import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schemaNs from "./schema";
import { botTemplates, bots, routines, workspaces } from "./schema";

/** 兼容 postgres-js 和 PGlite（测试）两种驱动 */
type AnyDb = PgDatabase<PgQueryResultHKT, typeof schemaNs>;

export interface TemplateSeed {
  slug: string;
  name: string;
  version: string;
  description?: string;
  spec: unknown;
  raw: string;
  routine?: { cron: string; timezone?: string; budgetUsd?: number };
}

export const DEFAULT_WORKSPACE_SLUG = "default";

/**
 * 自部署（单租户）首次启动时：创建默认 workspace，写入官方模板，并为每个模板创建一个 Bot。
 * 可重复执行（幂等）。
 */
export async function ensureDefaultWorkspace(db: AnyDb, templates: TemplateSeed[]) {
  await db
    .insert(workspaces)
    .values({ slug: DEFAULT_WORKSPACE_SLUG, name: "我的编辑部" })
    .onConflictDoNothing({ target: workspaces.slug });
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG))
    .limit(1);
  if (!ws) throw new Error("创建默认 workspace 失败");

  for (const t of templates) {
    let [tpl] = await db
      .select()
      .from(botTemplates)
      .where(
        and(
          isNull(botTemplates.workspaceId),
          eq(botTemplates.slug, t.slug),
          eq(botTemplates.version, t.version),
        ),
      )
      .limit(1);
    if (!tpl) {
      [tpl] = await db
        .insert(botTemplates)
        .values({
          slug: t.slug,
          name: t.name,
          version: t.version,
          source: "official",
          spec: t.spec,
          raw: t.raw,
        })
        .returning();
    }
    const inserted = await db
      .insert(bots)
      .values({
        workspaceId: ws.id,
        templateId: tpl!.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
      })
      .onConflictDoNothing()
      .returning();
    const bot = inserted[0];
    if (bot && t.routine) {
      await db.insert(routines).values({
        workspaceId: ws.id,
        botId: bot.id,
        name: `${t.name} 定时任务`,
        cron: t.routine.cron,
        timezone: t.routine.timezone ?? "Asia/Shanghai",
        budgetUsd: t.routine.budgetUsd?.toString(),
        // 默认关闭，用户在工作台确认关键词 / 模型后再开启
        enabled: false,
      });
    }
  }
  return ws;
}
