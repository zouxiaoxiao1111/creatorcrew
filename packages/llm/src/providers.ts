import {
  MODEL_TIERS,
  parseTargetList,
  type ModelTier,
  type TierMapping,
} from "@creatorcrew/core/domain";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./types";

type EnvLike = Record<string, string | undefined>;

/** 一个 Provider 的配置（来源可以是数据库或环境变量）。 */
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  /** 这个 Provider 服务的档位及对应模型 */
  tierModels: Partial<Record<ModelTier, string>>;
  priority: number;
  enabled: boolean;
  source: "db" | "env";
  headers?: Record<string, string>;
}

/** 环境变量里的内置 Provider（只在配置了 Key / URL 时出现）。 */
export function envProviderConfigs(env: EnvLike = process.env): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  if (env.OPENAI_API_KEY) {
    out.push({
      name: "openai",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
      tierModels: {},
      priority: 1000,
      enabled: true,
      source: "env",
    });
  }
  if (env.OPENROUTER_API_KEY) {
    out.push({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      tierModels: {},
      priority: 1001,
      enabled: true,
      source: "env",
      headers: { "X-Title": "CreatorCrew" },
    });
  }
  if (env.OLLAMA_BASE_URL) {
    out.push({
      name: "ollama",
      baseUrl: env.OLLAMA_BASE_URL,
      tierModels: {},
      priority: 1002,
      enabled: true,
      source: "env",
    });
  }
  return out;
}

/**
 * 合并 Provider：**数据库优先**，环境变量兜底。
 * 同名时只保留数据库里的那个（即使它被停用——停用就是不想用，不应该悄悄回落到环境变量）。
 */
export function mergeProviderConfigs(
  dbConfigs: ProviderConfig[],
  env: EnvLike = process.env,
): ProviderConfig[] {
  const byName = new Map<string, ProviderConfig>();
  for (const c of dbConfigs) byName.set(c.name, { ...c, source: "db" });
  for (const c of envProviderConfigs(env)) if (!byName.has(c.name)) byName.set(c.name, c);
  return [...byName.values()];
}

export function buildProviders(
  configs: ProviderConfig[],
  fetchImpl?: typeof fetch,
): Record<string, LLMProvider> {
  const providers: Record<string, LLMProvider> = {};
  for (const c of configs) {
    if (!c.enabled) continue;
    providers[c.name] = createOpenAICompatibleProvider({
      id: c.name,
      baseUrl: c.baseUrl,
      apiKey: c.apiKey,
      headers: c.headers,
      fetch: fetchImpl,
    });
  }
  return providers;
}

/**
 * 计算最终的档位映射，每个档位独立按以下顺序取第一个非空来源：
 *   1. 设置页里手动填写的映射（workspace.settings.tiers）
 *   2. 数据库 Provider 凭据里声明服务该档位的模型（按 priority 排序）
 *   3. 环境变量 CC_TIER_*
 */
export function deriveTierMapping(
  explicit: TierMapping | undefined,
  configs: ProviderConfig[],
  env: EnvLike = process.env,
): TierMapping {
  const mapping: TierMapping = {};
  for (const tier of MODEL_TIERS) {
    const manual = explicit?.[tier] ?? [];
    if (manual.length) {
      mapping[tier] = manual;
      continue;
    }
    const fromProviders = configs
      .filter((c) => c.enabled && c.tierModels[tier])
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
      .map((c) => ({ provider: c.name, model: c.tierModels[tier]! }));
    if (fromProviders.length) {
      mapping[tier] = fromProviders;
      continue;
    }
    const fromEnv = parseTargetList(env[`CC_TIER_${tier.toUpperCase()}`]);
    if (fromEnv.length) mapping[tier] = fromEnv;
  }
  return mapping;
}

/** 一步到位：数据库配置 + 环境变量 → providers 和档位映射，供 worker 构造 LLMRouter。 */
export function resolveLLMConfig(opts: {
  dbConfigs: ProviderConfig[];
  explicitTiers?: TierMapping;
  env?: EnvLike;
  fetch?: typeof fetch;
}) {
  const env = opts.env ?? process.env;
  const configs = mergeProviderConfigs(opts.dbConfigs, env);
  return {
    configs,
    providers: buildProviders(configs, opts.fetch),
    mapping: deriveTierMapping(opts.explicitTiers, configs, env),
  };
}
