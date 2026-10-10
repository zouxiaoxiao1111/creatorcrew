import { describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  LLMError,
  LLMRouter,
  NoRouteError,
  createOpenAICompatibleProvider,
  evaluateBudget,
  resolveRoute,
  type LLMProvider,
  type UsageRecord,
} from "../src";
import type { TierMapping } from "@creatorcrew/core/domain";

const mapping: TierMapping = {
  cheap: [{ provider: "a", model: "a-small" }],
  mid: [
    { provider: "a", model: "a-medium" },
    { provider: "b", model: "b-medium" },
  ],
  strong: [{ provider: "b", model: "b-large" }],
  local: [{ provider: "ollama", model: "qwen2.5:7b" }],
};

function fakeProvider(
  id: string,
  behavior: (model: string) => string | Error,
): LLMProvider & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    id,
    calls,
    async chat(model) {
      calls.push(model);
      const out = behavior(model);
      if (out instanceof Error) throw out;
      return { text: out, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

describe("resolveRoute", () => {
  it("主档位链在前，fallback 档位在后，且去重", () => {
    const route = resolveRoute("cheap", ["mid", "cheap"], mapping);
    expect(route.map((r) => `${r.tier}/${r.target.provider}:${r.target.model}`)).toEqual([
      "cheap/a:a-small",
      "mid/a:a-medium",
      "mid/b:b-medium",
    ]);
  });

  it("未映射的档位返回空", () => {
    expect(resolveRoute("strong", [], { cheap: mapping.cheap })).toEqual([]);
  });
});

describe("LLMRouter", () => {
  it("使用档位映射的第一个模型并记录用量和费用", async () => {
    const a = fakeProvider("a", (m) => `hello from ${m}`);
    const usage: UsageRecord[] = [];
    const router = new LLMRouter({
      providers: { a },
      mapping,
      prices: { "a:a-small": { inputPer1M: 1, outputPer1M: 2 } },
      onUsage: (u) => {
        usage.push(u);
      },
    });
    const res = await router.chat({ tier: "cheap", messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("hello from a-small");
    expect(res.tier).toBe("cheap");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costUsd).toBeCloseTo(0.0002, 6);
  });

  it("限流（429）时按 fallback 链切到下一个 Provider", async () => {
    const a = fakeProvider(
      "a",
      () => new LLMError("rate limited", { provider: "a", status: 429, retryable: true }),
    );
    const b = fakeProvider("b", (m) => `ok ${m}`);
    const usage: UsageRecord[] = [];
    const router = new LLMRouter({
      providers: { a, b },
      mapping,
      onUsage: (u) => void usage.push(u),
    });
    const res = await router.chat({ tier: "mid", messages: [] });
    expect(res.provider).toBe("b");
    expect(res.model).toBe("b-medium");
    expect(res.attempts.map((x) => x.ok)).toEqual([false, true]);
    expect(usage.map((u) => u.ok)).toEqual([false, true]);
    expect(usage[1]?.costUsd).toBeNull(); // 没配置单价
  });

  it("跳过未配置的 Provider，然后走模板声明的 fallback 档位", async () => {
    const a = fakeProvider("a", (m) => `ok ${m}`);
    const router = new LLMRouter({ providers: { a }, mapping });
    const res = await router.chat({ tier: "strong", fallback: ["mid"], messages: [] });
    expect(res.tier).toBe("mid");
    expect(res.model).toBe("a-medium");
    expect(res.attempts[0]).toMatchObject({ provider: "b", ok: false });
  });

  it("400 错误不再继续尝试", async () => {
    const a = fakeProvider(
      "a",
      () => new LLMError("bad request", { provider: "a", status: 400, retryable: false }),
    );
    const b = fakeProvider("b", () => "never");
    const router = new LLMRouter({ providers: { a, b }, mapping });
    await expect(router.chat({ tier: "mid", messages: [] })).rejects.toThrow("bad request");
    expect(b.calls).toHaveLength(0);
  });

  it("全部失败时抛出 NoRouteError 并带上每次尝试", async () => {
    const router = new LLMRouter({ providers: {}, mapping });
    const err = await router.chat({ tier: "cheap", messages: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoRouteError);
    expect((err as NoRouteError).attempts).toHaveLength(1);
  });

  it("档位没有映射时给出中文提示", async () => {
    const router = new LLMRouter({ providers: {}, mapping: {} });
    await expect(router.chat({ tier: "strong", messages: [] })).rejects.toThrow(/还没有映射/);
  });

  it("预算用完后自动降一档；pause 策略则直接暂停", async () => {
    const a = fakeProvider("a", (m) => m);
    const b = fakeProvider("b", (m) => m);
    const router = new LLMRouter({ providers: { a, b }, mapping });
    const res = await router.chat({
      tier: "strong",
      messages: [],
      budget: { spentUsd: 5, limitUsd: 5 },
    });
    expect(res.tier).toBe("mid");
    await expect(
      router.chat({
        tier: "strong",
        messages: [],
        budget: { spentUsd: 6, limitUsd: 5, onExceeded: "pause" },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("预算 80% 时告警", () => {
    expect(evaluateBudget({ spentUsd: 0.79, limitUsd: 1 })).toBe("ok");
    expect(evaluateBudget({ spentUsd: 0.8, limitUsd: 1 })).toBe("warn");
    expect(evaluateBudget({ spentUsd: 1, limitUsd: 1 })).toBe("exceeded");
  });
});

describe("OpenAI 兼容 Provider", () => {
  it("发送标准 chat/completions 请求并解析 usage", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "你好" } }],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const p = createOpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://llm.example.com/v1/",
      apiKey: "sk-test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.chat("m-1", {
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "json",
    });
    expect(res).toEqual({ text: "你好", usage: { inputTokens: 12, outputTokens: 3 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: "m-1",
      response_format: { type: "json_object" },
    });
  });

  it("429 映射为可重试错误", async () => {
    const p = createOpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://llm.example.com/v1",
      fetch: (async () =>
        new Response(JSON.stringify({ error: { message: "slow down" } }), {
          status: 429,
        })) as typeof fetch,
    });
    const err = await p.chat("m", { messages: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).retryable).toBe(true);
    expect((err as LLMError).status).toBe(429);
  });
});
