import { describe, expect, it } from "vitest";
import { toDraft, toTopics } from "../src/outputs";

describe("toDraft", () => {
  it("正文来自 draft 步骤，标题和封面来自 packaging", () => {
    const d = toDraft(
      {
        draft: "# 原标题\n\n正文",
        packaging: { titles: ["标题A", "标题B"], cover_prompt: "封面" },
      },
      "兜底",
    );
    expect(d).toEqual({
      title: "标题A",
      body: "# 原标题\n\n正文",
      titleOptions: ["标题A", "标题B"],
      coverPrompt: "封面",
    });
  });

  it("没有 packaging 时用正文一级标题，再用兜底标题", () => {
    expect(toDraft({ draft: "# 原标题\n\n正文" }, "兜底").title).toBe("原标题");
    expect(toDraft({}, "兜底").title).toBe("兜底");
  });
});

describe("toTopics", () => {
  it("解析选题雷达 JSON 输出并过滤无效项", () => {
    const list = toTopics({
      topics: [{ title: "A", reason: "r", urls: ["u"], score: 9.5 }, { reason: "缺标题" }],
    });
    expect(list).toEqual([{ title: "A", angle: null, reason: "r", urls: ["u"], score: "9.50" }]);
    expect(toTopics("不是 JSON")).toEqual([]);
  });
});
