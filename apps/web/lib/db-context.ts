import "server-only";
import { loadOfficialTemplates } from "@creatorcrew/agents";
import { assertSecretKey } from "@creatorcrew/core/auth";
import { ensureDefaultWorkspace, getDb, runMigrations, type Database } from "@creatorcrew/db";

export interface DbContext {
  db: Database;
  workspaceId: string;
  url: string;
  masterKey: string;
}

const g = globalThis as unknown as { __ccDbCtx?: Promise<DbContext> };

/** 演示模式 = 没有配置 DATABASE_URL：不需要登录，数据只在内存里。 */
export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

/**
 * 自部署是单租户：首次访问时自动 migrate，并确保有一个默认 workspace 和官方模板 Bot。
 * TODO(cloud)：多租户时从会话里取 workspace，并依赖 Postgres RLS 兜底。
 */
export function getDbContext(): Promise<DbContext> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("演示模式下没有数据库");
  g.__ccDbCtx ??= (async () => {
    const masterKey = assertSecretKey(process.env);
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
    return { db, workspaceId: ws.id, url, masterKey };
  })().catch((err) => {
    g.__ccDbCtx = undefined;
    throw err;
  });
  return g.__ccDbCtx;
}
