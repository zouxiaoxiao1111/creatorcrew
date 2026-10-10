import { describe, expect, it, vi } from "vitest";
import {
  LLMRouter,
  deriveTierMapping,
  mergeProviderConfigs,
  resolveLLMConfig,
  type ProviderConfig,
} from "../src";

const db = (over: Partial<ProviderConfig> & { name: string }): ProviderConfig => ({
  baseUrl: `https://${over.name}.db.example/v1`,
  apiKey: `db-key-${over.name}`,
  tierModels: {},
  priority: 100,
  enabled: true,
  source: "db",
  ...over,
});

const env = {
  OPENAI_API_KEY: "env-openai-key",
  OPENAI_BASE_URL: "https://env.openai.example/v1",
  OLLAMA_BASE_URL: "http://ollama:11434/v1",
  CC_TIER_CHEAP: "openai:env-cheap",
  CC_TIER_STRONG: "openai:env-strong",
};

describe("Provider 来源优先级：数据库优先，环境变量兜底", () => {
  it("同名时使用数据库里的配置", () => {
    const merged = mergeProviderConfigs([db({ name: "openai" })], env);
    const openai = merged.find((c) => c.name === "openai")!;
    expect(openai.source).toBe("db");
    expect(openai.apiKey).toBe("db-key-openai");
    expect(openai.baseUrl).toBe("https://openai.db.example/v1");
  });

  it("数据库里没有的 Provider 从环境变量补上", () => {
    const merged = mergeProviderConfigs([db({ name: "gateway" })], env);
    expect(merged.map((c) => `${c.name}:${c.source}`).sort()).toEqual([
      "gateway:db",
      "ollama:env",
      "openai:env",
    ]);
  });

  it("数据库里停用的同名 Provider 不会悄悄回落到环境变量", () => {
    const { providers } = resolveLLMConfig({
      dbConfigs: [db({ name: "openai", enabled: false })],
      env,
    });
    expect(providers.openai).toBeUndefined();
    expect(providers.ollama).toBeDefined();
  });

  it("没有数据库配置时完全使用环境变量", () => {
    const { providers, mapping } = resolveLLMConfig({ dbConfigs: [], env });
    expect(Object.keys(providers).sort()).toEqual(["ollama", "openai"]);
    expect(mapping.cheap).toEqual([{ provider: "openai", model: "env-cheap" }]);
  });
});

describe("档位映射来源：手动设置 > 数据库凭据 > 环境变量", () => {
  const configs = [
    db({ name: "b", priority: 20, tierModels: { mid: "b-mid", strong: "b-strong" } }),
    db({ name: "a", priority: 10, tierModels: { mid: "a-mid" } }),
    db({ name: "off", enabled: false, tierModels: { cheap: "off-cheap" } }),
  ];

  it("按档位独立取值", () => {
    const mapping = deriveTierMapping(
      { strong: [{ provider: "manual", model: "m" }] },
      configs,
      env,
    );
    expect(mapping.strong).toEqual([{ provider: "manual", model: "m" }]); // 手动设置
    expect(mapping.mid).toEqual([
      { provider: "a", model: "a-mid" }, // priority 小的在前
      { provider: "b", model: "b-mid" },
    ]);
    expect(mapping.cheap).toEqual([{ provider: "openai", model: "env-cheap" }]); // 停用的凭据被跳过 → 环境变量
    expect(mapping.local).toBeUndefined();
  });
});

describe("端到端：数据库里的 Key 真正被用来调用模型", () => {
  it("请求带的是数据库 Key 而不是环境变量 Key", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: {} }), {
          status: 200,
        }),
    );
    const { providers, mapping } = resolveLLMConfig({
      dbConfigs: [db({ name: "openai", tierModels: { cheap: "db-cheap" } })],
      env,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const router = new LLMRouter({ providers, mapping });
    const res = await router.chat({ tier: "cheap", messages: [] });
    expect(res.model).toBe("db-cheap");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openai.db.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer db-key-openai");
  });
});
