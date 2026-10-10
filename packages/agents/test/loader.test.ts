import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TemplateError,
  loadTemplatesFromDir,
  officialTemplatesDir,
  parseTemplate,
  renderPrompt,
  resolveInputs,
  runBot,
  type ChatRouter,
} from "../src";

const dir = path.resolve(import.meta.dirname, "../templates");

const minimal = (extra = "") => `
apiVersion: creatorcrew/v1
kind: Bot
metadata: { name: demo-bot, displayName: 演示, version: 0.1.0 }
spec:
  persona: 你是测试 Bot
  model: { tier: cheap }
  steps:
    - { id: say, type: llm, prompt: "关键词：{{ inputs.keywords }}" }
  output: { kind: text }
${extra}`;

describe("官方模板", () => {
  const loaded = loadTemplatesFromDir(dir);

  it("包含 3 个 MVP 模板且全部通过校验", () => {
    expect(loaded.map((t) => t.template.metadata.displayName).sort()).toEqual(
      ["灵感库整理", "选题雷达", "长文写作"].sort(),
    );
  });

  it("长文写作必须有人工审核步骤，且是最后一步", () => {
    const writer = loaded.find((t) => t.template.metadata.name === "longform-writer")!.template;
    expect(writer.spec.output.kind).toBe("draft");
    expect(writer.spec.review.required).toBe(true);
    expect(writer.spec.steps.at(-1)?.type).toBe("human_review");
  });

  it("选题雷达带定时任务和预算，X 搜索是可选的", () => {
    const radar = loaded.find((t) => t.template.metadata.name === "topic-radar")!.template;
    expect(radar.spec.routine).toMatchObject({ cron: "0 8 * * *", budget_usd: 0.5 });
    const x = radar.spec.steps.find((s) => s.id === "x_posts");
    expect(x).toMatchObject({ type: "tool", optional: true });
  });

  it("能从子目录向上找到官方模板目录", () => {
    expect(officialTemplatesDir({}, path.resolve(dir, "../src"))).toBe(dir);
    expect(officialTemplatesDir({ CC_TEMPLATES_DIR: "/tmp/x" })).toBe("/tmp/x");
  });
});

describe("parseTemplate 校验", () => {
  it("合法的最小模板可以解析，并填充默认值", () => {
    const { template } = parseTemplate(minimal());
    expect(template.metadata.tags).toEqual([]);
    expect(template.spec.model.fallback).toEqual([]);
    expect(template.spec.review.required).toBe(false);
  });

  it("产出草稿但没有审核步骤时拒绝", () => {
    const raw = minimal().replace("output: { kind: text }", "output: { kind: draft }");
    expect(() => parseTemplate(raw)).toThrowError(/human_review/);
  });

  it("使用未声明的工具时拒绝", () => {
    const raw = minimal().replace(
      "- { id: say,",
      "- { id: fetch, type: tool, tool: rss.fetch }\n    - { id: say,",
    );
    const err = (() => {
      try {
        parseTemplate(raw);
      } catch (e) {
        return e as TemplateError;
      }
    })();
    expect(err).toBeInstanceOf(TemplateError);
    expect(err?.issues.join()).toMatch(/rss\.fetch/);
  });

  it("非法档位和非法名称会给出路径", () => {
    const raw = minimal().replace("tier: cheap", "tier: ultra").replace("demo-bot", "Demo Bot");
    try {
      parseTemplate(raw, "bad.yaml");
      expect.unreachable();
    } catch (e) {
      const issues = (e as TemplateError).issues.join("\n");
      expect(issues).toMatch(/spec\.model\.tier/);
      expect(issues).toMatch(/metadata\.name/);
    }
  });

  it("模板中包含密钥时拒绝", () => {
    const raw = minimal("# api_key: sk-abcdefghijklmnopqrstuvwx");
    expect(() => parseTemplate(raw)).toThrowError(/密钥/);
  });

  it("YAML 语法错误", () => {
    expect(() => parseTemplate("a: [1, 2", "broken.yaml")).toThrowError(TemplateError);
  });

  it("也支持 JSON 模板", () => {
    const json = JSON.stringify({
      apiVersion: "creatorcrew/v1",
      kind: "Bot",
      metadata: { name: "json-bot", displayName: "JSON", version: "1.0.0" },
      spec: {
        persona: "p",
        model: { tier: "mid" },
        steps: [{ id: "a", type: "llm", prompt: "x" }],
        output: { kind: "text" },
      },
    });
    expect(parseTemplate(json, "bot.json").template.metadata.name).toBe("json-bot");
  });
});

describe("输入与渲染", () => {
  it("必填输入缺失时报错，默认值生效", () => {
    const writer = loadTemplatesFromDir(dir).find(
      (t) => t.template.metadata.name === "longform-writer",
    )!;
    expect(() => resolveInputs(writer.template, {})).toThrowError(/选题/);
    const inputs = resolveInputs(writer.template, { topic: "Grok Bot 入门" });
    expect(inputs.platform).toBe("X 长文");
  });

  it("renderPrompt 支持数组和嵌套路径", () => {
    expect(
      renderPrompt("{{ inputs.k }} / {{ steps.a.output }} / {{ missing.x }}", {
        inputs: { k: ["A", "B"] },
        steps: { a: { output: "ok" } },
      }),
    ).toBe("A、B / ok / ");
  });
});

describe("runBot", () => {
  it("长文写作在人工审核步骤停下，草稿等待审核", async () => {
    const writer = loadTemplatesFromDir(dir).find(
      (t) => t.template.metadata.name === "longform-writer",
    )!;
    const tiers: string[] = [];
    const router: ChatRouter = {
      async chat(req) {
        tiers.push(req.tier);
        const text = req.responseFormat === "json" ? '{"titles":["a"],"cover_prompt":"c"}' : "正文";
        return {
          text,
          usage: { inputTokens: 1, outputTokens: 1 },
          provider: "fake",
          model: "m",
          tier: req.tier,
          latencyMs: 1,
          attempts: [],
        };
      },
    };
    const res = await runBot(writer.template, {
      inputs: { topic: "测试选题" },
      router,
      workspaceId: "w1",
    });
    expect(res.status).toBe("awaiting_review");
    expect(tiers).toEqual(["mid", "strong", "mid"]);
    expect(res.steps.map((s) => s.status)).toEqual([
      "skipped",
      "succeeded",
      "succeeded",
      "succeeded",
      "awaiting_review",
    ]);
    expect(res.output).toEqual({ titles: ["a"], cover_prompt: "c" });
    expect(res.outputs.draft).toBe("正文");
  });
});
