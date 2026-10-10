import type { TokenUsage } from "./types";

/** 单价表：key 为 "provider:model"，单位 USD / 1M tokens。由用户配置，不硬编码。 */
export type PriceTable = Record<string, { inputPer1M: number; outputPer1M: number }>;

export function estimateCost(
  prices: PriceTable | undefined,
  provider: string,
  model: string,
  usage: TokenUsage,
): number | null {
  const price = prices?.[`${provider}:${model}`];
  if (!price) return null;
  const cost =
    (usage.inputTokens / 1_000_000) * price.inputPer1M +
    (usage.outputTokens / 1_000_000) * price.outputPer1M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
