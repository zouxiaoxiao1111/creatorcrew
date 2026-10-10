import "server-only";
import { createHash } from "node:crypto";
import { loadOfficialTemplates } from "@creatorcrew/agents";
import type { TierMapping, WorkspaceSettings } from "@creatorcrew/core/domain";
import { applyReviewDecision, type DraftStatus } from "@creatorcrew/core/review";
import {
  and,
  botTemplates,
  bots,
  desc,
  draftVersions,
  drafts,
  ensureDefaultWorkspace,
  eq,
  getDb,
  gte,
  ilike,
  inspirations,
  or,
  routines,
  runMigrations,
  runs,
  sql,
  topics,
  usageEvents,
  workspaces,
  type Database,
} from "@creatorcrew/db";
import { enqueueBotRun } from "../queue";
import type { BotView, DraftView, Store } from "./types";

type Ctx = { db: Database; workspaceId: string; url: string };

const g = globalThis as unknown as { __ccDbCtx?: Promise<Ctx> };

/**
 * 自部署是单租户：启动时自动 migrate，并确保有一个默认 workspace 和官方模板 Bot。
 * TODO(cloud)：多租户时从会话里取 workspace，并依赖 Postgres RLS 兜底。
 */
function ctx(url: string): Promise<Ctx> {
  g.__ccDbCtx ??= (async () => {
    await runMigrations(url, (m) => console.log(m));
    const db = getDb(url);
    const ws = await ensureDefaultWorkspace(
      db,
      loadOfficialTemplates().map(({ template, raw }) => ({
        slug: template.metadata.name,
        name: template.metadata.displayName,
        version: template.metadata.version,
        description: template.metadata.description,
        spec: template,
        raw,
        routine: template.spec.routine && {
          cron: template.spec.routine.cron,
          timezone: template.spec.routine.timezone,
          budgetUsd: template.spec.routine.budget_usd,
        },
      })),
    );
    return { db, workspaceId: ws.id, url };
  })().catch((err) => {
    g.__ccDbCtx = undefined;
    throw err;
  });
  return g.__ccDbCtx;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type TemplateSpec = {
  spec?: {
    model?: { tier?: BotView["tier"] };
    tools?: string[];
    inputs?: Record<string, { label?: string; required?: boolean; default?: unknown }>;
  };
};

export function createDbStore(url: string): Store {
  const toDraftView = (r: typeof drafts.$inferSelect, botName: string | null): DraftView => ({
    id: r.id,
    title: r.title,
    titleOptions: r.titleOptions,
    body: r.body,
    coverPrompt: r.coverPrompt,
    status: r.status,
    reviewNote: r.reviewNote,
    botName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });

  return {
    mode: "db",

    async getDashboard() {
      const { db, workspaceId } = await ctx(url);
      const rows = await db
        .select({ bot: bots, template: botTemplates, routine: routines })
        .from(bots)
        .leftJoin(botTemplates, eq(bots.templateId, botTemplates.id))
        .leftJoin(routines, eq(routines.botId, bots.id))
        .where(eq(bots.workspaceId, workspaceId))
        .orderBy(bots.createdAt);

      const botViews: BotView[] = rows.map(({ bot, template, routine }) => {
        const spec = (template?.spec ?? {}) as TemplateSpec;
        return {
          id: bot.id,
          slug: bot.slug,
          name: bot.name,
          description: bot.description,
          status: bot.status,
          enabled: bot.enabled,
          templateName: template?.slug ?? null,
          templateVersion: template?.version ?? null,
          tier: spec.spec?.model?.tier ?? null,
          tools: spec.spec?.tools ?? [],
          runInputs: Object.entries(spec.spec?.inputs ?? {})
            .filter(
              ([key, i]) => i.required && i.default === undefined && bot.inputs[key] === undefined,
            )
            .map(([key, i]) => ({ key, label: i.label ?? key })),
          routine: routine
            ? { id: routine.id, cron: routine.cron, enabled: routine.enabled }
            : null,
          lastRunAt: bot.lastRunAt,
          lastError: bot.lastError,
        };
      });

      const today = startOfToday();
      const [[topicCount], [reviewCount], [runningCount], [usage], recent] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(topics)
          .where(and(eq(topics.workspaceId, workspaceId), eq(topics.status, "new"))),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(drafts)
          .where(and(eq(drafts.workspaceId, workspaceId), eq(drafts.status, "in_review"))),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(runs)
          .where(
            and(
              eq(runs.workspaceId, workspaceId),
              or(eq(runs.status, "running"), eq(runs.status, "queued")),
            ),
          ),
        db
          .select({
            tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
            cost: sql<string | null>`sum(${usageEvents.costUsd})`,
          })
          .from(usageEvents)
          .where(and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, today))),
        db
          .select({ run: runs, botName: bots.name })
          .from(runs)
          .innerJoin(bots, eq(runs.botId, bots.id))
          .where(eq(runs.workspaceId, workspaceId))
          .orderBy(desc(runs.createdAt))
          .limit(8),
      ]);

      return {
        bots: botViews,
        recentRuns: recent.map(({ run, botName }) => ({
          id: run.id,
          botName,
          status: run.status,
          trigger: run.trigger,
          createdAt: run.createdAt,
          error: run.error,
        })),
        stats: {
          newTopics: topicCount?.n ?? 0,
          pendingReviews: reviewCount?.n ?? 0,
          runningRuns: runningCount?.n ?? 0,
          todayTokens: usage?.tokens ?? 0,
          todayCostUsd: usage?.cost == null ? null : Number(usage.cost),
        },
      };
    },

    async triggerRun(botId, extra = {}) {
      const { db, workspaceId } = await ctx(url);
      const [bot] = await db
        .select()
        .from(bots)
        .where(and(eq(bots.id, botId), eq(bots.workspaceId, workspaceId)));
      if (!bot) return { ok: false, message: "找不到这个 Bot" };
      const [run] = await db
        .insert(runs)
        .values({ workspaceId, botId, trigger: "manual", input: { ...bot.inputs, ...extra } })
        .returning();
      await db.update(bots).set({ status: "queued" }).where(eq(bots.id, botId));
      await enqueueBotRun(url, { runId: run!.id, botId, workspaceId, inputs: extra });
      return { ok: true, message: `已把「${bot.name}」加入队列，worker 会马上执行` };
    },

    async setRoutineEnabled(routineId, enabled) {
      const { db, workspaceId } = await ctx(url);
      const res = await db
        .update(routines)
        .set({ enabled })
        .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
        .returning();
      if (!res.length) return { ok: false, message: "找不到这个定时任务" };
      return {
        ok: true,
        message: enabled ? "已开启定时任务（worker 1 分钟内同步）" : "已暂停定时任务",
      };
    },

    async listInspirations(query) {
      const { db, workspaceId } = await ctx(url);
      const q = query?.trim();
      // TODO(v0.1/W4)：向量检索（pgvector）+ 关键词混合检索
      const filter = q
        ? and(
            eq(inspirations.workspaceId, workspaceId),
            or(
              ilike(inspirations.title, `%${q}%`),
              ilike(inspirations.content, `%${q}%`),
              sql`${q} = any(${inspirations.tags})`,
            ),
          )
        : eq(inspirations.workspaceId, workspaceId);
      const rows = await db
        .select()
        .from(inspirations)
        .where(filter)
        .orderBy(desc(inspirations.createdAt))
        .limit(200);
      return rows.map((r) => ({
        id: r.id,
        source: r.source,
        url: r.url,
        title: r.title,
        content: r.content,
        summary: r.summary,
        tags: r.tags,
        freshness: r.freshness,
        createdAt: r.createdAt,
      }));
    },

    async addInspiration(input) {
      const { db, workspaceId } = await ctx(url);
      const contentHash = createHash("sha256")
        .update(input.url || input.content)
        .digest("hex");
      const res = await db
        .insert(inspirations)
        .values({
          workspaceId,
          source: input.url ? "link" : "text",
          url: input.url,
          title: input.title,
          content: input.content,
          tags: input.tags,
          contentHash,
        })
        .onConflictDoNothing()
        .returning();
      if (!res.length) return { ok: false, message: "灵感库里已经有这条内容了" };
      return { ok: true, message: "已加入灵感库，「灵感库整理」Bot 会自动摘要和打标签" };
    },

    async listDrafts(status?: DraftStatus) {
      const { db, workspaceId } = await ctx(url);
      const rows = await db
        .select({ draft: drafts, botName: bots.name })
        .from(drafts)
        .leftJoin(bots, eq(drafts.botId, bots.id))
        .where(
          status
            ? and(eq(drafts.workspaceId, workspaceId), eq(drafts.status, status))
            : eq(drafts.workspaceId, workspaceId),
        )
        .orderBy(desc(drafts.updatedAt))
        .limit(100);
      return rows.map(({ draft, botName }) => toDraftView(draft, botName));
    },

    async countDraftsByStatus() {
      const { db, workspaceId } = await ctx(url);
      const rows = await db
        .select({ status: drafts.status, n: sql<number>`count(*)::int` })
        .from(drafts)
        .where(eq(drafts.workspaceId, workspaceId))
        .groupBy(drafts.status);
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    },

    async getDraft(id) {
      const { db, workspaceId } = await ctx(url);
      const [row] = await db
        .select({ draft: drafts, botName: bots.name })
        .from(drafts)
        .leftJoin(bots, eq(drafts.botId, bots.id))
        .where(and(eq(drafts.id, id), eq(drafts.workspaceId, workspaceId)));
      return row ? toDraftView(row.draft, row.botName) : null;
    },

    async reviewDraft(id, decision, note) {
      const { db, workspaceId } = await ctx(url);
      const [draft] = await db
        .select()
        .from(drafts)
        .where(and(eq(drafts.id, id), eq(drafts.workspaceId, workspaceId)));
      if (!draft) return { ok: false, message: "找不到这篇草稿" };
      let next: DraftStatus;
      try {
        next = applyReviewDecision(draft.status, decision);
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
      // TODO(v0.1/W1)：接入 Auth.js 后记录 reviewedBy
      await db
        .update(drafts)
        .set({ status: next, reviewNote: note || null, reviewedAt: new Date() })
        .where(eq(drafts.id, id));
      if (decision === "approve" && draft.runId) {
        await db
          .update(runs)
          .set({ status: "succeeded", finishedAt: new Date() })
          .where(and(eq(runs.id, draft.runId), eq(runs.status, "awaiting_review")));
      }
      return { ok: true, message: decision === "approve" ? "已通过，可以导出了" : "已退回修改" };
    },

    async markExported(id) {
      const { db, workspaceId } = await ctx(url);
      const [draft] = await db
        .select()
        .from(drafts)
        .where(and(eq(drafts.id, id), eq(drafts.workspaceId, workspaceId)));
      if (draft?.status !== "approved") return;
      await db.transaction(async (tx) => {
        await tx.update(drafts).set({ status: "exported" }).where(eq(drafts.id, id));
        const [{ v } = { v: 0 }] = await tx
          .select({ v: sql<number>`coalesce(max(${draftVersions.version}), 0)::int` })
          .from(draftVersions)
          .where(eq(draftVersions.draftId, id));
        await tx
          .insert(draftVersions)
          .values({ draftId: id, version: v + 1, body: draft.body, author: "human" });
      });
    },

    async getSettings() {
      const { db, workspaceId } = await ctx(url);
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      return ws?.settings ?? {};
    },

    async saveTierMapping(tiers: TierMapping) {
      const { db, workspaceId } = await ctx(url);
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      const settings: WorkspaceSettings = { ...(ws?.settings ?? {}), tiers };
      await db.update(workspaces).set({ settings }).where(eq(workspaces.id, workspaceId));
      return { ok: true, message: "已保存模型档位映射" };
    },
  };
}
