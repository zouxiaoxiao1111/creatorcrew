import type { Tool } from "@creatorcrew/core/domain";

export interface PageContent {
  url: string;
  title: string;
  text: string;
}

/** 从 HTML 中提取标题和正文纯文本（粗略版，TODO：换成 Readability）。 */
export function extractReadable(html: string, url: string): PageContent {
  const title =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
    url;
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
  return { url, title, text };
}

export function createWebPageTool(
  fetchImpl: typeof fetch = globalThis.fetch,
): Tool<{ url: string }, PageContent> {
  return {
    name: "web.fetch",
    description: "抓取用户主动提供的链接正文（不绕过登录或风控）",
    async run({ url }, ctx) {
      const res = await fetchImpl(url, { signal: ctx.signal });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return extractReadable(await res.text(), url);
    },
  };
}
