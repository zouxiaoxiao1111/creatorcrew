/**
 * 领域常量与类型。这里不依赖任何运行时（fs / db），可以被前端、db、worker 共同引用。
 */

export const MODEL_TIERS = ["cheap", "mid", "strong", "local"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  cheap: "便宜（筛选 / 分类 / 打标签）",
  mid: "中档（总结 / 改写）",
  strong: "强力（终稿写作）",
  local: "本地（Ollama 等）",
};

export const BOT_STATUSES = ["idle", "queued", "running", "paused", "error"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

export const RUN_STATUSES = [
  "queued",
  "running",
  "awaiting_review",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["manual", "schedule", "webhook", "event"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const INSPIRATION_SOURCES = [
  "link",
  "text",
  "screenshot",
  "x_bookmark",
  "rss",
  "email",
] as const;
export type InspirationSource = (typeof INSPIRATION_SOURCES)[number];

export const FRESHNESS = ["evergreen", "timely", "stale"] as const;
export type Freshness = (typeof FRESHNESS)[number];

export const MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** 工具（连接器能力）的统一接口，供 agents 运行时调用。 */
export interface Tool<Args = Record<string, unknown>, Result = unknown> {
  name: string;
  description: string;
  /** 不可用时（例如没有配置 X API Token）返回原因 */
  unavailableReason?: string;
  run(args: Args, ctx: ToolContext): Promise<Result>;
}

export interface ToolContext {
  workspaceId: string;
  signal?: AbortSignal;
}

/** 档位映射：每个档位是一条有序的 provider:model 链（第一个失败时按顺序切换）。 */
export interface ModelTarget {
  provider: string;
  model: string;
}
export type TierMapping = Partial<Record<ModelTier, ModelTarget[]>>;

export interface WorkspaceSettings {
  tiers?: TierMapping;
  /** 单价表（USD / 1M tokens），key 为 "provider:model"。不硬编码，由用户配置。 */
  prices?: Record<string, { inputPer1M: number; outputPer1M: number }>;
  monthlyBudgetUsd?: number;
  /** 导出时加「AI 辅助创作」标识 */
  aiLabelOnExport?: boolean;
}

/** 解析 "provider:model,provider:model"。model 本身可以带冒号（例如 ollama 的 qwen2.5:7b）。 */
export function parseTargetList(value: string | undefined | null): ModelTarget[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const idx = item.indexOf(":");
      if (idx <= 0 || idx === item.length - 1) {
        throw new Error(`模型配置格式应为 provider:model，收到 "${item}"`);
      }
      return { provider: item.slice(0, idx).trim(), model: item.slice(idx + 1).trim() };
    });
}

export function formatTargetList(targets: ModelTarget[] | undefined): string {
  return (targets ?? []).map((t) => `${t.provider}:${t.model}`).join(", ");
}
