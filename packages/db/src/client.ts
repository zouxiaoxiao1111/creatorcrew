import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const cache = new Map<string, { db: Database; sql: postgres.Sql }>();

/** 每个连接串复用一个连接池（Next.js 开发模式热更新时也不会反复建连）。 */
export function getDb(url: string, opts: { max?: number } = {}): Database {
  let entry = cache.get(url);
  if (!entry) {
    const max = opts.max ?? (Number(process.env.CC_DB_POOL_MAX) || 10);
    const sql = postgres(url, { max, onnotice: () => {} });
    entry = { sql, db: drizzle(sql, { schema }) };
    cache.set(url, entry);
  }
  return entry.db;
}

export async function closeDb(url?: string): Promise<void> {
  for (const [key, entry] of cache) {
    if (url && key !== url) continue;
    await entry.sql.end({ timeout: 5 });
    cache.delete(key);
  }
}
