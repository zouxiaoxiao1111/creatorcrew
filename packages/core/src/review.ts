/**
 * 人工审核流状态机：draft → in_review → changes_requested → approved → exported/published
 * 默认规则：任何对外导出 / 发布都必须先经过 approved。
 */
export const DRAFT_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "exported",
  "published",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  draft: "草稿",
  in_review: "待审核",
  changes_requested: "需修改",
  approved: "已通过",
  exported: "已导出",
  published: "已发布",
};

const TRANSITIONS: Record<DraftStatus, readonly DraftStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "changes_requested"],
  changes_requested: ["in_review", "draft"],
  approved: ["exported", "published", "changes_requested"],
  exported: ["published", "changes_requested"],
  published: [],
};

export function canTransition(from: DraftStatus, to: DraftStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: DraftStatus, to: DraftStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `草稿状态不能从「${DRAFT_STATUS_LABELS[from]}」变为「${DRAFT_STATUS_LABELS[to]}」`,
    );
  }
}

export type ReviewDecision = "approve" | "request_changes";

export function applyReviewDecision(from: DraftStatus, decision: ReviewDecision): DraftStatus {
  const to: DraftStatus = decision === "approve" ? "approved" : "changes_requested";
  assertTransition(from, to);
  return to;
}

/** 导出前检查：开启 requireApproval 时只有 approved / exported 的稿件可以导出。 */
export function canExport(status: DraftStatus, requireApproval: boolean): boolean {
  if (!requireApproval) return status !== "published";
  return status === "approved" || status === "exported";
}
