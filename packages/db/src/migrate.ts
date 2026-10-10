import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** 任意固定的 64 位整数，用于 pg_advisory_lock，防止 web 和 worker 同时跑 migration。 */
const MIGRATION_LOCK_ID = 727_001;

export function migrationsDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  if (env.CC_MIGRATIONS_DIR) return path.resolve(env.CC_MIGRATIONS_DIR);
  let dir = path.resolve(/* turbopackIgnore: true */ cwd);
  for (let i = 0; i < 8; i++) {
    for (const rel of ["packages/db/drizzle", "drizzle"]) {
      const candidate = path.join(/* turbopackIgnore: true */ dir, rel, "meta", "_journal.json");
      if (existsSync(candidate)) return path.join(/* turbopackIgnore: true */ dir, rel);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到 migration 目录，请设置 CC_MIGRATIONS_DIR");
}

/** 启动时自动 migrate（第一个 migration 会启用 pgvector 扩展）。 */
export async function runMigrations(databaseUrl: string, log: (m: string) => void = console.log) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    const folder = migrationsDir();
    log(`[db] 执行 migration：${folder}`);
    await drizzleMigrate(drizzle(sql), { migrationsFolder: folder });
    log("[db] migration 完成");
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}
