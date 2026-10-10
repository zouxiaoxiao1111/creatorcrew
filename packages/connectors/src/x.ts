import type { Tool } from "@creatorcrew/core/domain";

/**
 * X（Twitter）连接器：只使用官方 API，用户自己提供 Bearer Token。
 * X API 是付费的，档位、价格和可用接口经常变化，以 X 官方最新条款为准。
 * 没有 Token 时这个工具标记为不可用，选题雷达会退回 RSS / 灵感库。
 *
 * TODO(v0.1/W4)：限速器、本地缓存、增量拉取（since_id）、调用量统计。
 */
export interface XPost {
  id: string;
  text: string;
  url: string;
  authorId?: string;
  metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
}

export function createXSearchTool(
  bearer: string | undefined,
  fetchImpl: typeof fetch = globalThis.fetch,
): Tool<{ keywords?: string[]; accounts?: string[]; maxResults?: number }, XPost[]> {
  return {
    name: "x.search",
    description: "通过 X 官方 API 搜索最近的帖子（需要 X_API_BEARER）",
    unavailableReason: bearer ? undefined : "未配置 X_API_BEARER",
    async run({ keywords = [], accounts = [], maxResults = 50 }, ctx) {
      if (!bearer) throw new Error("未配置 X_API_BEARER，x.search 不可用");
      const parts: string[] = [];
      if (keywords.length) parts.push(`(${keywords.map((k) => JSON.stringify(k)).join(" OR ")})`);
      if (accounts.length)
        parts.push(`(${accounts.map((a) => `from:${a.replace(/^@/, "")}`).join(" OR ")})`);
      const query = `${parts.join(" ")} -is:retweet`.trim();
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", query);
      url.searchParams.set("max_results", String(Math.min(Math.max(maxResults, 10), 100)));
      url.searchParams.set("tweet.fields", "public_metrics,author_id,created_at");
      const res = await fetchImpl(url, {
        headers: { authorization: `Bearer ${bearer}` },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`X API HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: {
          id: string;
          text: string;
          author_id?: string;
          public_metrics?: XPost["metrics"];
        }[];
      };
      return (json.data ?? []).map((t) => ({
        id: t.id,
        text: t.text,
        authorId: t.author_id,
        url: `https://x.com/i/status/${t.id}`,
        metrics: t.public_metrics,
      }));
    },
  };
}
