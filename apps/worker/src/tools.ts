import { createRssTool, createWebPageTool, createXSearchTool } from "@creatorcrew/connectors";
import type { Tool } from "@creatorcrew/core/domain";
import {
  and,
  desc,
  eq,
  ilike,
  inspirations,
  isNull,
  or,
  sql,
  type Database,
} from "@creatorcrew/db";

/** 把连接器和灵感库能力注册成 Bot 可调用的工具。 */
export function buildTools(
  db: Database,
  env: Record<string, string | undefined>,
): Record<string, Tool> {
  const tools: Tool[] = [
    createRssTool() as Tool,
    createXSearchTool(env.X_API_BEARER) as Tool,
    createWebPageTool() as Tool,
    {
      name: "inspiration.search",
      description: "在灵感库中检索（v0.1 为关键词检索）",
      async run(args, ctx) {
        // TODO(v0.1/W4)：生成 query embedding，用 pgvector 做语义检索 + 关键词混合排序
        const raw = (args as { query?: unknown }).query;
        const terms = (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
        const limit = Number((args as { limit?: unknown }).limit ?? 10);
        const match = terms.length
          ? or(
              ...terms.flatMap((t) => [
                ilike(inspirations.title, `%${t}%`),
                ilike(inspirations.content, `%${t}%`),
              ]),
            )
          : undefined;
        const rows = await db
          .select({
            title: inspirations.title,
            url: inspirations.url,
            summary: inspirations.summary,
            content: inspirations.content,
            tags: inspirations.tags,
          })
          .from(inspirations)
          .where(and(eq(inspirations.workspaceId, ctx.workspaceId), match))
          .orderBy(desc(inspirations.createdAt))
          .limit(limit);
        return rows.map((r) => ({ ...r, content: r.content.slice(0, 1000) }));
      },
    },
    {
      name: "inspiration.pending",
      description: "读取还没整理过的灵感",
      async run(args, ctx) {
        const limit = Number((args as { limit?: unknown }).limit ?? 20);
        const rows = await db
          .select({
            id: inspirations.id,
            title: inspirations.title,
            url: inspirations.url,
            content: inspirations.content,
          })
          .from(inspirations)
          .where(and(eq(inspirations.workspaceId, ctx.workspaceId), isNull(inspirations.curatedAt)))
          .orderBy(inspirations.createdAt)
          .limit(limit);
        return rows.map((r) => ({ ...r, content: r.content.slice(0, 2000) }));
      },
    },
    {
      name: "inspiration.update",
      description: "把整理结果（摘要、标签、时效）写回灵感库",
      async run(args, ctx) {
        const payload = (args as { items?: unknown }).items as
          { items?: unknown[] } | unknown[] | undefined;
        const items = (Array.isArray(payload) ? payload : (payload?.items ?? [])) as {
          id?: string;
          summary?: string;
          tags?: string[];
          freshness?: "evergreen" | "timely" | "stale";
        }[];
        let updated = 0;
        for (const item of items) {
          if (!item.id) continue;
          const freshness = ["evergreen", "timely", "stale"].includes(item.freshness ?? "")
            ? item.freshness
            : undefined;
          const res = await db
            .update(inspirations)
            .set({
              summary: item.summary?.slice(0, 500),
              tags: Array.isArray(item.tags) ? item.tags.slice(0, 5).map(String) : undefined,
              freshness,
              curatedAt: sql`now()`,
            })
            .where(and(eq(inspirations.id, item.id), eq(inspirations.workspaceId, ctx.workspaceId)))
            .returning({ id: inspirations.id });
          updated += res.length;
        }
        // TODO(v0.1/W4)：同时生成 embedding 写入 inspiration.embedding，并基于向量做去重
        return { updated };
      },
    },
  ];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
