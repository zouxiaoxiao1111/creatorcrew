import type {
  BotStatus,
  Freshness,
  InspirationSource,
  ModelTier,
  RunStatus,
  RunTrigger,
  TierMapping,
  WorkspaceSettings,
} from "@creatorcrew/core/domain";
import type { DraftStatus, ReviewDecision } from "@creatorcrew/core/review";

export interface BotView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: BotStatus;
  enabled: boolean;
  templateName: string | null;
  templateVersion: string | null;
  tier: ModelTier | null;
  tools: string[];
  /** 运行时需要临时填写的输入（必填且没有默认值），例如长文写作的「选题」 */
  runInputs: { key: string; label: string }[];
  routine: { id: string; cron: string; enabled: boolean } | null;
  lastRunAt: Date | null;
  lastError: string | null;
}

export interface RunView {
  id: string;
  botName: string;
  status: RunStatus;
  trigger: RunTrigger;
  createdAt: Date;
  error: string | null;
}

export interface DashboardData {
  bots: BotView[];
  recentRuns: RunView[];
  stats: {
    newTopics: number;
    pendingReviews: number;
    runningRuns: number;
    todayTokens: number;
    todayCostUsd: number | null;
  };
}

export interface InspirationView {
  id: string;
  source: InspirationSource;
  url: string | null;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[];
  freshness: Freshness | null;
  createdAt: Date;
}

export interface NewInspiration {
  url?: string;
  title?: string;
  content: string;
  tags: string[];
}

export interface DraftView {
  id: string;
  title: string;
  titleOptions: string[];
  body: string;
  coverPrompt: string | null;
  status: DraftStatus;
  reviewNote: string | null;
  botName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Web 端的数据访问层：有 DATABASE_URL 时用 Postgres，否则用内存演示数据。 */
export interface Store {
  mode: "db" | "demo";
  getDashboard(): Promise<DashboardData>;
  triggerRun(botId: string, inputs?: Record<string, string>): Promise<ActionResult>;
  setRoutineEnabled(routineId: string, enabled: boolean): Promise<ActionResult>;
  listInspirations(query?: string): Promise<InspirationView[]>;
  addInspiration(input: NewInspiration): Promise<ActionResult>;
  listDrafts(status?: DraftStatus): Promise<DraftView[]>;
  countDraftsByStatus(): Promise<Partial<Record<DraftStatus, number>>>;
  getDraft(id: string): Promise<DraftView | null>;
  reviewDraft(id: string, decision: ReviewDecision, note?: string): Promise<ActionResult>;
  markExported(id: string): Promise<void>;
  getSettings(): Promise<WorkspaceSettings>;
  saveTierMapping(tiers: TierMapping): Promise<ActionResult>;
}
