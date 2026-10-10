import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** 兼容 postgres-js（生产）和 PGlite（测试）两种驱动 */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
