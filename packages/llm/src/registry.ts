import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./types";

type EnvLike = Record<string, string | undefined>;

export interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  baseUrl: string;
}

/**
 * 根据环境变量创建内置 Provider。没有配置 Key 的 Provider 不会被创建。
 * TODO(v0.1/W2)：支持在 UI 里配置 Key（加密存进 secret 表），以及 Anthropic / Gemini 原生接口。
 */
export function providersFromEnv(env: EnvLike = process.env): Record<string, LLMProvider> {
  const providers: Record<string, LLMProvider> = {};
  if (env.OPENAI_API_KEY) {
    providers.openai = createOpenAICompatibleProvider({
      id: "openai",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
    });
  }
  if (env.OPENROUTER_API_KEY) {
    providers.openrouter = createOpenAICompatibleProvider({
      id: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      headers: { "X-Title": "CreatorCrew" },
    });
  }
  if (env.OLLAMA_BASE_URL) {
    providers.ollama = createOpenAICompatibleProvider({
      id: "ollama",
      baseUrl: env.OLLAMA_BASE_URL,
    });
  }
  return providers;
}

export function describeProviders(env: EnvLike = process.env): ProviderInfo[] {
  return [
    {
      id: "openai",
      label: "OpenAI 兼容接口",
      configured: Boolean(env.OPENAI_API_KEY),
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      configured: Boolean(env.OPENROUTER_API_KEY),
      baseUrl: "https://openrouter.ai/api/v1",
    },
    {
      id: "ollama",
      label: "Ollama（本地模型）",
      configured: Boolean(env.OLLAMA_BASE_URL),
      baseUrl: env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    },
  ];
}
