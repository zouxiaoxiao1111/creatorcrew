import {
  BOT_STATUSES,
  FRESHNESS,
  INSPIRATION_SOURCES,
  MEMBER_ROLES,
  MODEL_TIERS,
  RUN_STATUSES,
  RUN_TRIGGERS,
  type WorkspaceSettings,
} from "@creatorcrew/core/domain";
import { DRAFT_STATUSES } from "@creatorcrew/core/review";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * 核心数据模型。所有业务表都带 workspace_id，为在线版多租户（+ RLS）做准备。
 * 向量维度暂定 1536（常见 embedding 模型），TODO：做成可配置 / 支持多维度。
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const memberRole = pgEnum("member_role", MEMBER_ROLES);
export const botStatus = pgEnum("bot_status", BOT_STATUSES);
export const runStatus = pgEnum("run_status", RUN_STATUSES);
export const runTrigger = pgEnum("run_trigger", RUN_TRIGGERS);
export const draftStatus = pgEnum("draft_status", DRAFT_STATUSES);
export const inspirationSource = pgEnum("inspiration_source", INSPIRATION_SOURCES);
export const freshness = pgEnum("freshness", FRESHNESS);
export const modelTier = pgEnum("model_tier", MODEL_TIERS);
export const templateSource = pgEnum("template_source", ["official", "community", "custom"]);
export const topicStatus = pgEnum("topic_status", ["new", "accepted", "dismissed"]);
export const versionAuthor = pgEnum("version_author", ["bot", "human"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const workspaceId = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

export const workspaces = pgTable("workspace", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("user", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** 自部署单管理员模式使用；OAuth / Magic link 用户为空。TODO(v0.1/W1)：接 Auth.js */
  passwordHash: text("password_hash"),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "membership",
  {
    workspaceId: workspaceId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/** Bot 模板（bot.yaml）。workspace_id 为空表示官方 / 全局模板。 */
export const botTemplates = pgTable(
  "bot_template",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    source: templateSource("source").notNull().default("custom"),
    spec: jsonb("spec").notNull(),
    raw: text("raw").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // 官方模板 workspace_id 为空，用 NULLS NOT DISTINCT 保证同一 slug+version 只有一份（PG15+）
    unique("bot_template_ws_slug_version_uq")
      .on(t.workspaceId, t.slug, t.version)
      .nullsNotDistinct(),
  ],
);

export const crews = pgTable("crew", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const bots = pgTable(
  "bot",
  {
    id: id(),
    workspaceId: workspaceId(),
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => botTemplates.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: botStatus("status").notNull().default("idle"),
    enabled: boolean("enabled").notNull().default(true),
    /** 覆盖模板默认值的输入，例如关键词、对标账号 */
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("bot_ws_slug_idx").on(t.workspaceId, t.slug)],
);

/** 定时任务（Routine）。实际调度由 pg-boss 的 schedule 完成。 */
export const routines = pgTable("routine", {
  id: id(),
  workspaceId: workspaceId(),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  enabled: boolean("enabled").notNull().default(true),
  budgetUsd: numeric("budget_usd", { precision: 10, scale: 4 }),
  /** 静默期，例如 {"start":"23:00","end":"07:00"} */
  quietHours: jsonb("quiet_hours").$type<{ start: string; end: string } | null>(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** 每次运行（job）的记录：输入、输出、token、耗时、失败原因。 */
export const runs = pgTable(
  "run",
  {
    id: id(),
    workspaceId: workspaceId(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }),
    status: runStatus("status").notNull().default("queued"),
    trigger: runTrigger("trigger").notNull().default("manual"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("run_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const runSteps = pgTable("run_step", {
  id: id(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  stepId: text("step_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  prompt: text("prompt"),
  output: jsonb("output"),
  error: text("error"),
  provider: text("provider"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** 灵感库条目（含向量，用于检索 / 去重 / RAG）。 */
export const inspirations = pgTable(
  "inspiration",
  {
    id: id(),
    workspaceId: workspaceId(),
    source: inspirationSource("source").notNull().default("text"),
    url: text("url"),
    title: text("title"),
    content: text("content").notNull().default(""),
    summary: text("summary"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    freshness: freshness("freshness"),
    contentHash: text("content_hash"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    curatedAt: timestamp("curated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("inspiration_ws_created_idx").on(t.workspaceId, t.createdAt),
    uniqueIndex("inspiration_ws_hash_idx").on(t.workspaceId, t.contentHash),
    index("inspiration_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const topics = pgTable("topic", {
  id: id(),
  workspaceId: workspaceId(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  angle: text("angle"),
  reason: text("reason"),
  score: numeric("score", { precision: 6, scale: 2 }),
  urls: text("urls")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  status: topicStatus("status").notNull().default("new"),
  createdAt: createdAt(),
});

/** 草稿 + 审核状态（draft → in_review → changes_requested → approved → exported/published） */
export const drafts = pgTable(
  "draft",
  {
    id: id(),
    workspaceId: workspaceId(),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    titleOptions: text("title_options")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    body: text("body").notNull().default(""),
    coverPrompt: text("cover_prompt"),
    status: draftStatus("status").notNull().default("draft"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("draft_ws_status_idx").on(t.workspaceId, t.status)],
);

export const draftVersions = pgTable("draft_version", {
  id: id(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  author: versionAuthor("author").notNull(),
  createdAt: createdAt(),
});

export const reviewComments = pgTable("review_comment", {
  id: id(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  /** 段落级批注的锚点，例如 {"paragraph": 3} */
  anchor: jsonb("anchor"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: createdAt(),
});

/** 加密存储的密钥（AES-256-GCM），前端只显示后 4 位。 */
export const secrets = pgTable(
  "secret",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    ciphertext: text("ciphertext").notNull(),
    last4: text("last4").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("secret_ws_name_idx").on(t.workspaceId, t.name)],
);

export const connectorAccounts = pgTable("connector_account", {
  id: id(),
  workspaceId: workspaceId(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  config: jsonb("config").notNull().default({}),
  secretId: uuid("secret_id").references(() => secrets.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** 用量计量：每次 LLM 调用一条。额度看板和预算控制都基于这张表。 */
export const usageEvents = pgTable(
  "usage_event",
  {
    id: id(),
    workspaceId: workspaceId(),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    tier: modelTier("tier").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    latencyMs: integer("latency_ms"),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_ws_created_idx").on(t.workspaceId, t.createdAt)],
);
