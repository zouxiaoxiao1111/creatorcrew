import { buildProviders, envProviderConfigs } from "./providers";
import type { LLMProvider } from "./types";

type EnvLike = Record<string, string | undefined>;

export interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  baseUrl: string;
}

/** 只用环境变量创建 Provider（不读数据库）。worker 请使用 resolveLLMConfig()，它会优先读数据库。 */
export function providersFromEnv(env: EnvLike = process.env): Record<string, LLMProvider> {
  return buildProviders(envProviderConfigs(env));
}

/** 环境变量里内置 Provider 的配置状态（设置页展示用，不包含 Key）。 */
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
