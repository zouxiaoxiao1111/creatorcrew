import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import { ensureDefaultWorkspace } from "../src/seed";

/** 用内存版 Postgres（PGlite + pgvector）验证 migration 能完整执行。 */
const client = new PGlite({ extensions: { vector } });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe("migrations", () => {
  it("启用了 pgvector 扩展", async () => {
    const res = await db.execute(sql`select extname from pg_extension where extname = 'vector'`);
    expect(res.rows).toHaveLength(1);
  });

  it("种子数据幂等，并能存取向量和草稿状态", async () => {
    const seed = [
      {
        slug: "topic-radar",
        name: "选题雷达",
        version: "0.1.0",
        spec: { a: 1 },
        raw: "x",
        routine: { cron: "0 8 * * *", budgetUsd: 0.5 },
      },
    ];
    const ws = await ensureDefaultWorkspace(db, seed);
    await ensureDefaultWorkspace(db, seed);
    expect(await db.select().from(schema.bots)).toHaveLength(1);
    expect(await db.select().from(schema.botTemplates)).toHaveLength(1);
    expect(await db.select().from(schema.routines)).toHaveLength(1);

    const embedding = Array.from({ length: schema.EMBEDDING_DIMENSIONS }, (_, i) => (i % 7) / 7);
    await db.insert(schema.inspirations).values({
      workspaceId: ws.id,
      content: "Grok Bot 新功能",
      tags: ["Agent"],
      embedding,
    });
    const nearest = await db
      .select({ content: schema.inspirations.content })
      .from(schema.inspirations)
      .orderBy(sql`${schema.inspirations.embedding} <=> ${JSON.stringify(embedding)}::vector`)
      .limit(1);
    expect(nearest[0]?.content).toBe("Grok Bot 新功能");

    const [draft] = await db
      .insert(schema.drafts)
      .values({ workspaceId: ws.id, title: "测试稿", status: "in_review" })
      .returning();
    await db
      .update(schema.drafts)
      .set({ status: "approved" })
      .where(eq(schema.drafts.id, draft!.id));
    const [after] = await db.select().from(schema.drafts).where(eq(schema.drafts.id, draft!.id));
    expect(after?.status).toBe("approved");
  });
});
