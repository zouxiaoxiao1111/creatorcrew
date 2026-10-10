import type { BotStatus, Freshness, InspirationSource, RunStatus } from "@creatorcrew/core/domain";
import type { DraftStatus } from "@creatorcrew/core/review";
import type { BadgeTone } from "@creatorcrew/ui";

export const BOT_STATUS: Record<BotStatus, { label: string; tone: BadgeTone }> = {
  idle: { label: "空闲", tone: "zinc" },
  queued: { label: "排队中", tone: "blue" },
  running: { label: "运行中", tone: "violet" },
  paused: { label: "已暂停", tone: "amber" },
  error: { label: "出错", tone: "red" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "排队中", tone: "blue" },
  running: { label: "运行中", tone: "violet" },
  awaiting_review: { label: "等待审核", tone: "amber" },
  succeeded: { label: "成功", tone: "green" },
  failed: { label: "失败", tone: "red" },
  cancelled: { label: "已取消", tone: "zinc" },
};

export const DRAFT_STATUS: Record<DraftStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "zinc" },
  in_review: { label: "待审核", tone: "amber" },
  changes_requested: { label: "需修改", tone: "red" },
  approved: { label: "已通过", tone: "green" },
  exported: { label: "已导出", tone: "blue" },
  published: { label: "已发布", tone: "violet" },
};

export const SOURCE_LABEL: Record<InspirationSource, string> = {
  link: "链接",
  text: "文字",
  screenshot: "截图",
  x_bookmark: "X 书签",
  rss: "RSS",
  email: "邮件",
};

export const FRESHNESS_LABEL: Record<Freshness, { label: string; tone: BadgeTone }> = {
  evergreen: { label: "常青", tone: "green" },
  timely: { label: "时效", tone: "amber" },
  stale: { label: "已过时", tone: "zinc" },
};

const dtf = new Intl.DateTimeFormat("zh-CN", {
  timeZone: process.env.CC_TIMEZONE || "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dtf.format(typeof d === "string" ? new Date(d) : d);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
