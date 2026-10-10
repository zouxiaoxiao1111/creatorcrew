import { describe, expect, it } from "vitest";
import { createXSearchTool, extractReadable, parseFeed } from "../src";

describe("parseFeed", () => {
  it("解析 RSS 2.0 和 Atom", () => {
    const rss = `<rss><channel><item><title><![CDATA[新功能 & 教程]]></title><link>https://a.com/1</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
    const atom = `<feed><entry><title>Atom 标题</title><link href="https://b.com/2"/><updated>2026-10-05</updated></entry></feed>`;
    expect(parseFeed(rss, "r")[0]).toMatchObject({
      title: "新功能 & 教程",
      link: "https://a.com/1",
    });
    expect(parseFeed(atom, "a")[0]).toMatchObject({ title: "Atom 标题", link: "https://b.com/2" });
  });
});

describe("x.search", () => {
  it("没有 Token 时标记为不可用", () => {
    expect(createXSearchTool(undefined).unavailableReason).toMatch(/X_API_BEARER/);
  });
});

describe("extractReadable", () => {
  it("提取标题并去掉脚本", () => {
    const page = extractReadable(
      "<title>Hi</title><script>x()</script><p>正文</p>",
      "https://c.com",
    );
    expect(page.title).toBe("Hi");
    expect(page.text).toBe("Hi 正文");
  });
});
