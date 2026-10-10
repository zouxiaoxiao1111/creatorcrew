import type { BotTemplate } from "@creatorcrew/agents";
import { BotTemplateSchema, runBot } from "@creatorcrew/agents";
import {
  QUEUES,
  parseTargetList,
  type BotRunJob,
  type ModelTier,
  type TierMapping,
} from "@creatorcrew/core";
import {
  and,
  botTemplates,
  bots,
  draftVersions,
  drafts,
  eq,
  gte,
  routines,
  runSteps,
  runs,
  sql,
  topics,
  usageEvents,
  workspaces,
  type Database,
} from "@creatorcrew/db";
import { LLMRouter, providersFromEnv } from "@creatorcrew/llm";
import type PgBoss from "pg-boss";
import { log } from "./log";
import { toDraft, toTopics } from "./outputs";
import { buildTools } from "./tools";

type Env = Record<string, string | undefined>;

/** 档位映射：workspace 设置优先，其次是环境变量 CC_TIER_*。 */
export function resolveTierMapping(settings: TierMapping | undefined, env: Env): TierMapping {
  const fromEnv: TierMapping = {};
  for (const tier of ["cheap", "mid", "strong", "local"] as ModelTier[]) {
    const list = parseTargetList(env[`CC_TIER_${tier.toUpperCase()}`]);
    if (list.length) fromEnv[tier] = list;
  }
  return { ...fromEnv, ...settings };
}

export async function handleBotRun(db: Database, job: BotRunJob, env: Env): Promise<void> {
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

  const router = new LLMRouter({
    providers: providersFromEnv(env),
    mapping: resolveTierMapping(settings.tiers, env),
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

  // 单个 Routine 的预算上限：v0.1 按「该 Bot 当天累计花费 ≤ budget_usd」理解（需配置单价表才生效）
  const [routine] = await db.select().from(routines).where(eq(routines.botId, botId)).limit(1);
  let budget: { spentUsd: number; limitUsd: number } | undefined;
  if (routine?.budgetUsd) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [spent] = await db
      .select({ v: sql<string | null>`sum(${usageEvents.costUsd})` })
      .from(usageEvents)
      .where(and(eq(usageEvents.botId, botId), gte(usageEvents.createdAt, dayStart)));
    budget = { spentUsd: Number(spent?.v ?? 0), limitUsd: Number(routine.budgetUsd) };
  }

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
