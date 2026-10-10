import type { BotTemplate } from "@creatorcrew/agents";
import { BotTemplateSchema, runBot } from "@creatorcrew/agents";
import { QUEUES, type BotRunJob } from "@creatorcrew/core";
import {
  and,
  botSpendToday,
  botTemplates,
  bots,
  createProviderRepo,
  draftVersions,
  drafts,
  eq,
  routines,
  runSteps,
  runs,
  topics,
  usageEvents,
  workspaces,
  type Database,
} from "@creatorcrew/db";
import { LLMRouter, resolveLLMConfig } from "@creatorcrew/llm";
import type PgBoss from "pg-boss";
import { log } from "./log";
import { toDraft, toTopics } from "./outputs";
import { buildTools } from "./tools";

type Env = Record<string, string | undefined>;

export interface JobContext {
  env: Env;
  /** CC_SECRET_KEY，用于解密设置页保存的 API Key */
  masterKey: string;
  timezone: string;
}

export async function handleBotRun(db: Database, job: BotRunJob, ctx: JobContext): Promise<void> {
  const { env } = ctx;
  const { runId, botId, workspaceId } = job;
  const [row] = await db
    .select({ bot: bots, template: botTemplates, ws: workspaces })
    .from(bots)
    .innerJoin(workspaces, eq(bots.workspaceId, workspaces.id))
    .leftJoin(botTemplates, eq(bots.templateId, botTemplates.id))
    .where(and(eq(bots.id, botId), eq(bots.workspaceId, workspaceId)));

  const fail = async (message: string) => {
    await db
      .update(runs)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(runs.id, runId));
    await db
      .update(bots)
      .set({ status: "error", lastError: message, lastRunAt: new Date() })
      .where(eq(bots.id, botId));
    log.warn({ runId, botId }, message);
  };

  if (!row) return fail("找不到 Bot");
  if (!row.template) return fail("Bot 没有关联模板");

  const parsed = BotTemplateSchema.safeParse(row.template.spec);
  if (!parsed.success) return fail(`模板校验失败：${parsed.error.issues[0]?.message ?? ""}`);
  const template: BotTemplate = parsed.data;

  await db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, runId));
  await db.update(bots).set({ status: "running", lastError: null }).where(eq(bots.id, botId));

  const settings = row.ws.settings ?? {};
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let hasCost = false;

  // Provider：数据库（设置页保存的加密凭据）优先，环境变量兜底
  const dbProviders = await createProviderRepo(db, ctx.masterKey).loadDecrypted(
    workspaceId,
    (name, err) =>
      log.error(
        { provider: name, err: err.message },
        "无法解密 Provider 的 API Key（CC_SECRET_KEY 是否变更？）",
      ),
  );
  const llm = resolveLLMConfig({
    dbConfigs: dbProviders.map((p) => ({ ...p, source: "db" as const })),
    explicitTiers: settings.tiers,
    env,
  });

  const router = new LLMRouter({
    providers: llm.providers,
    mapping: llm.mapping,
    prices: settings.prices,
    onUsage: async (u) => {
      totalIn += u.inputTokens;
      totalOut += u.outputTokens;
      if (u.costUsd != null) {
        hasCost = true;
        totalCost += u.costUsd;
      }
      await db.insert(usageEvents).values({
        workspaceId,
        runId,
        botId,
        provider: u.provider,
        model: u.model,
        tier: u.tier,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        costUsd: u.costUsd?.toString(),
        latencyMs: u.latencyMs,
        ok: u.ok,
        error: u.error,
      });
    },
  });

  // 预算：routine.budget_usd = 该 Bot 每天（按 CC_TIMEZONE）的花费上限，用完后自动降一档（需配置单价表才生效）
  const [routine] = await db.select().from(routines).where(eq(routines.botId, botId)).limit(1);
  const budget = routine?.budgetUsd
    ? {
        spentUsd: await botSpendToday(db, botId, ctx.timezone),
        limitUsd: Number(routine.budgetUsd),
      }
    : undefined;

  let idx = 0;
  const result = await runBot(template, {
    inputs: { ...row.bot.inputs, ...job.inputs },
    router,
    tools: buildTools(db, env),
    workspaceId,
    budget,
    onStep: async (s) => {
      await db.insert(runSteps).values({
        runId,
        idx: idx++,
        stepId: s.id,
        kind: s.type,
        status: s.status,
        prompt: s.prompt,
        output: s.output === undefined ? null : (s.output as object),
        error: s.error,
        provider: s.provider,
        model: s.model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
      });
    },
  });

  const usage = {
    inputTokens: totalIn,
    outputTokens: totalOut,
    costUsd: hasCost ? totalCost.toFixed(6) : null,
  };

  if (result.status === "failed") {
    await db
      .update(runs)
      .set({ ...usage, output: result.outputs })
      .where(eq(runs.id, runId));
    return fail(result.error ?? "运行失败");
  }

  // 按模板输出类型落库
  if (template.spec.output.kind === "draft") {
    const fields = toDraft(result.outputs, `${template.metadata.displayName} 草稿`);
    await db.transaction(async (tx) => {
      const [draft] = await tx
        .insert(drafts)
        .values({ workspaceId, botId, runId, ...fields, status: "in_review" })
        .returning();
      await tx
        .insert(draftVersions)
        .values({ draftId: draft!.id, version: 1, body: fields.body, author: "bot" });
    });
  } else if (template.spec.output.kind === "topic_list") {
    const list = toTopics(result.output);
    if (list.length)
      await db.insert(topics).values(list.map((t) => ({ ...t, workspaceId, runId })));
  }

  await db
    .update(runs)
    .set({
      ...usage,
      status: result.status === "awaiting_review" ? "awaiting_review" : "succeeded",
      output: result.outputs,
      finishedAt: new Date(),
    })
    .where(eq(runs.id, runId));
  await db.update(bots).set({ status: "idle", lastRunAt: new Date() }).where(eq(bots.id, botId));
  log.info({ runId, botId, status: result.status }, "运行完成");
}

/** 把数据库里开启的 Routine 同步成 pg-boss 定时任务（每个 Routine 一个队列）。 */
export async function syncRoutines(
  db: Database,
  boss: PgBoss,
  onTick: (routineId: string) => Promise<void>,
  registered: Set<string>,
): Promise<void> {
  const all = await db.select().from(routines);
  const wanted = new Map(all.filter((r) => r.enabled).map((r) => [`routine-${r.id}`, r]));

  for (const [name, r] of wanted) {
    if (!registered.has(name)) {
      await boss.createQueue(name);
      await boss.work(name, async () => onTick(r.id));
      registered.add(name);
    }
    await boss.schedule(name, r.cron, { routineId: r.id }, { tz: r.timezone });
  }
  for (const s of await boss.getSchedules()) {
    if (s.name.startsWith("routine-") && !wanted.has(s.name)) {
      await boss.unschedule(s.name);
      log.info({ queue: s.name }, "已取消定时任务");
    }
  }
}

export async function enqueueRoutineRun(db: Database, boss: PgBoss, routineId: string) {
  const [r] = await db.select().from(routines).where(eq(routines.id, routineId));
  if (!r?.enabled) return;
  const [bot] = await db.select().from(bots).where(eq(bots.id, r.botId));
  if (!bot?.enabled) return;
  // TODO：静默期（quietHours）检查
  const [run] = await db
    .insert(runs)
    .values({
      workspaceId: r.workspaceId,
      botId: r.botId,
      routineId: r.id,
      trigger: "schedule",
      input: bot.inputs,
    })
    .returning();
  await db.update(routines).set({ lastRunAt: new Date() }).where(eq(routines.id, r.id));
  await boss.send(QUEUES.botRun, {
    runId: run!.id,
    botId: r.botId,
    workspaceId: r.workspaceId,
  } satisfies BotRunJob);
}
