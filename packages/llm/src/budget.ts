import type { ModelTier } from "@creatorcrew/core/domain";

export type BudgetState = "ok" | "warn" | "exceeded";

export interface Budget {
  spentUsd: number;
  limitUsd: number;
  /** 告警阈值，默认 0.8 */
  warnAt?: number;
  /** 超出预算后的策略：降一档（默认）或直接暂停 */
  onExceeded?: "downgrade" | "pause";
}

export function evaluateBudget(b: Budget): BudgetState {
  if (b.limitUsd <= 0) return "ok";
  const ratio = b.spentUsd / b.limitUsd;
  if (ratio >= 1) return "exceeded";
  if (ratio >= (b.warnAt ?? 0.8)) return "warn";
  return "ok";
}

/** strong → mid → cheap；cheap 和 local 不再降。 */
export function downgradeTier(tier: ModelTier): ModelTier {
  switch (tier) {
    case "strong":
      return "mid";
    case "mid":
      return "cheap";
    default:
      return tier;
  }
}
