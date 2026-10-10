import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/schema";
import { ensureDefaultWorkspace } from "../src/seed";

/** 新建一个内存 Postgres（PGlite + pgvector），跑完 migration 并创建默认 workspace。 */
export async function freshDb() {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  const ws = await ensureDefaultWorkspace(db, [
    {
      slug: "longform-writer",
      name: "长文写作",
      version: "0.1.0",
      spec: {},
      raw: "",
      routine: { cron: "0 8 * * *", budgetUsd: 0.5 },
    },
  ]);
  return { client, db, ws };
}

/** 测试用的「哈希」：可逆但足以验证流程（生产用 argon2id）。 */
export const fakeHasher = {
  async hash(pw: string) {
    return `fake$${Buffer.from(pw).toString("base64")}`;
  },
  async verify(hash: string, pw: string) {
    return hash === `fake$${Buffer.from(pw).toString("base64")}`;
  },
};
