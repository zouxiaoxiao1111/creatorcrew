import type { ModelTarget, ModelTier, TierMapping } from "@creatorcrew/core/domain";
import { downgradeTier, evaluateBudget, type Budget } from "./budget";
import { estimateCost, type PriceTable } from "./pricing";
import { LLMError } from "./types";
import type { AttemptRecord, ChatRequest, ChatResult, LLMProvider, UsageRecord } from "./types";

export interface RouteStep {
  tier: ModelTier;
  target: ModelTarget;
}

/**
 * 计算一次调用的尝试顺序：
 *   先是主档位映射的模型链（例如 自带 Key → OpenRouter → Ollama），
 *   再按模板声明的 fallback 档位依次追加。重复的 provider:model 只保留第一次。
 */
export function resolveRoute(
  tier: ModelTier,
  fallbackTiers: ModelTier[],
  mapping: TierMapping,
): RouteStep[] {
  const seen = new Set<string>();
  const steps: RouteStep[] = [];
  for (const t of [tier, ...fallbackTiers]) {
    for (const target of mapping[t] ?? []) {
      const key = `${target.provider}:${target.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({ tier: t, target });
    }
  }
  return steps;
}

export interface RouterOptions {
  providers: Record<string, LLMProvider>;
  mapping: TierMapping;
  prices?: PriceTable;
  /** 每次调用（成功或失败）都会回调，用于写 usage_event 表 */
  onUsage?: (u: UsageRecord) => void | Promise<void>;
  now?: () => number;
}

export interface RoutedChatRequest extends ChatRequest {
  tier: ModelTier;
  fallback?: ModelTier[];
  budget?: Budget;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class NoRouteError extends Error {
  readonly attempts: AttemptRecord[];
  constructor(message: string, attempts: AttemptRecord[]) {
    super(message);
    this.name = "NoRouteError";
    this.attempts = attempts;
  }
}

/** 按档位路由 + fallback 链 + 预算控制 + 用量计量（「额度管家」的执行层）。 */
export class LLMRouter {
  private readonly opts: RouterOptions;

  constructor(opts: RouterOptions) {
    this.opts = opts;
  }

  /** 应用预算策略后实际使用的主档位 */
  effectiveTier(tier: ModelTier, budget?: Budget): ModelTier {
    if (!budget) return tier;
    const state = evaluateBudget(budget);
    if (state !== "exceeded") return tier;
    if (budget.onExceeded === "pause") {
      throw new BudgetExceededError(
        `预算已用完（$${budget.spentUsd.toFixed(2)} / $${budget.limitUsd.toFixed(2)}），任务已暂停`,
      );
    }
    return downgradeTier(tier);
  }

  async chat(req: RoutedChatRequest): Promise<ChatResult> {
    const now = this.opts.now ?? Date.now;
    const tier = this.effectiveTier(req.tier, req.budget);
    const route = resolveRoute(tier, req.fallback ?? [], this.opts.mapping);
    if (route.length === 0) {
      throw new NoRouteError(`档位「${tier}」还没有映射到任何模型，请到「设置」里配置`, []);
    }

    const attempts: AttemptRecord[] = [];
    for (const step of route) {
      const provider = this.opts.providers[step.target.provider];
      if (!provider) {
        attempts.push({
          ...step.target,
          tier: step.tier,
          ok: false,
          error: `Provider「${step.target.provider}」未配置`,
        });
        continue;
      }
      const started = now();
      try {
        const res = await provider.chat(step.target.model, req);
        const latencyMs = now() - started;
        await this.opts.onUsage?.({
          ...step.target,
          tier: step.tier,
          ...res.usage,
          costUsd: estimateCost(
            this.opts.prices,
            step.target.provider,
            step.target.model,
            res.usage,
          ),
          latencyMs,
          ok: true,
        });
        attempts.push({ ...step.target, tier: step.tier, ok: true });
        return { ...res, ...step.target, tier: step.tier, latencyMs, attempts };
      } catch (err) {
        const message = (err as Error).message;
        await this.opts.onUsage?.({
          ...step.target,
          tier: step.tier,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: null,
          latencyMs: now() - started,
          ok: false,
          error: message,
        });
        attempts.push({ ...step.target, tier: step.tier, ok: false, error: message });
        if (req.signal?.aborted) throw err;
        // 400 说明请求本身有问题，换 Provider 大概率也会失败，直接抛出；其他错误继续尝试下一个。
        if (err instanceof LLMError && !err.retryable && err.status === 400) throw err;
      }
    }
    throw new NoRouteError(
      `所有模型都调用失败：${attempts.map((a) => `${a.provider}:${a.model}（${a.error}）`).join("；")}`,
      attempts,
    );
  }
}
