import type { Tool } from "@creatorcrew/core/domain";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt?: string;
  summary?: string;
  source: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1] ? decodeEntities(m[1]) : undefined;
}

/** 极简 RSS 2.0 / Atom 解析（够选题雷达用；复杂 feed 以后换成专门的解析库）。 */
export function parseFeed(xml: string, source = ""): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    items.push({
      title: tag(block, "title") ?? "(无标题)",
      link: tag(block, "link") ?? "",
      publishedAt: tag(block, "pubDate"),
      summary: tag(block, "description")
        ?.replace(/<[^>]+>/g, "")
        .slice(0, 500),
      source,
    });
  }
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const block = m[0];
    const href = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    items.push({
      title: tag(block, "title") ?? "(无标题)",
      link: href,
      publishedAt: tag(block, "updated") ?? tag(block, "published"),
      summary: (tag(block, "summary") ?? tag(block, "content"))
        ?.replace(/<[^>]+>/g, "")
        .slice(0, 500),
      source,
    });
  }
  return items;
}

export function createRssTool(
  fetchImpl: typeof fetch = globalThis.fetch,
): Tool<{ feeds?: string[]; limit?: number }, FeedItem[]> {
  return {
    name: "rss.fetch",
    description: "抓取 RSS / Atom 订阅源的最新条目",
    async run({ feeds = [], limit = 30 }, ctx) {
      const results = await Promise.allSettled(
        feeds.map(async (url) => {
          const res = await fetchImpl(url, {
            signal: ctx.signal,
            headers: { "user-agent": "CreatorCrew/0.1 (+https://github.com/creatorcrew)" },
          });
          if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
          return parseFeed(await res.text(), url);
        }),
      );
      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).slice(0, limit);
    },
  };
}
