import { loadOfficialTemplates } from "@creatorcrew/agents";
import type { TierMapping, WorkspaceSettings } from "@creatorcrew/core/domain";
import { applyReviewDecision, type DraftStatus } from "@creatorcrew/core/review";
import { demoDrafts, demoInspirations, demoRuns } from "./demo-data";
import type {
  BotView,
  DraftView,
  InspirationView,
  ProviderCredentialView,
  RunView,
  Store,
  UsageData,
} from "./types";

interface MemoryState {
  providers: ProviderCredentialView[];
  bots: BotView[];
  inspirations: InspirationView[];
  drafts: DraftView[];
  runs: RunView[];
  settings: WorkspaceSettings;
}

function initialState(): MemoryState {
  const templates = loadOfficialTemplates();
  const bots: BotView[] = templates.map(({ template }) => ({
    id: `bot-${template.metadata.name}`,
    slug: template.metadata.name,
    name: template.metadata.displayName,
    description: template.metadata.description ?? null,
    status: template.metadata.name === "topic-radar" ? "error" : "idle",
    enabled: true,
    templateName: template.metadata.name,
    templateVersion: template.metadata.version,
    tier: template.spec.model.tier,
    tools: template.spec.tools,
    runInputs: Object.entries(template.spec.inputs)
      .filter(([, spec]) => spec.required && spec.default === undefined)
      .map(([key, spec]) => ({ key, label: spec.label ?? key })),
    routine: template.spec.routine
      ? {
          id: `routine-${template.metadata.name}`,
          cron: template.spec.routine.cron,
          enabled: false,
        }
      : null,
    lastRunAt: null,
    lastError:
      template.metadata.name === "topic-radar"
        ? "档位「cheap」还没有映射到任何模型，请到「设置」里配置"
        : null,
  }));
  return {
    providers: [
      {
        id: "demo-provider-1",
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        tierModels: { cheap: "your-cheap-model", strong: "your-strong-model" },
        priority: 10,
        enabled: true,
        hasKey: true,
        maskedKey: "****demo",
        updatedAt: new Date(),
      },
    ],
    bots,
    inspirations: demoInspirations(),
    drafts: demoDrafts(),
    runs: demoRuns(),
    settings: {
      tiers: {
        cheap: [{ provider: "openai", model: "your-cheap-model" }],
        mid: [{ provider: "openrouter", model: "your-mid-model" }],
        strong: [
          { provider: "openai", model: "your-strong-model" },
          { provider: "openrouter", model: "your-strong-model" },
        ],
        local: [{ provider: "ollama", model: "qwen2.5:7b" }],
      },
    },
  };
}

const g = globalThis as unknown as { __ccMemoryState?: MemoryState };
function state(): MemoryState {
  g.__ccMemoryState ??= initialState();
  return g.__ccMemoryState;
}

/** 演示模式：没有配置 DATABASE_URL 时使用，数据只保存在内存里，重启即丢失。 */
export const memoryStore: Store = {
  mode: "demo",

  async getDashboard() {
    const s = state();
    return {
      bots: s.bots,
      recentRuns: s.runs.slice(0, 8),
      stats: {
        newTopics: 0,
        pendingReviews: s.drafts.filter((d) => d.status === "in_review").length,
        runningRuns: s.runs.filter((r) => r.status === "running" || r.status === "queued").length,
        todayTokens: 0,
        todayCostUsd: null,
      },
    };
  },

  async triggerRun(botId) {
    const s = state();
    const bot = s.bots.find((b) => b.id === botId);
    if (!bot) return { ok: false, message: "找不到这个 Bot" };
    s.runs.unshift({
      id: `run-${Date.now()}`,
      botName: bot.name,
      status: "cancelled",
      trigger: "manual",
      createdAt: new Date(),
      error: "演示模式不会真正执行，请配置 DATABASE_URL 并启动 worker",
    });
    bot.lastRunAt = new Date();
    return {
      ok: false,
      message: "演示模式不会真正执行任务。配置 DATABASE_URL 并启动 worker 后即可运行。",
    };
  },

  async setRoutineEnabled(routineId, enabled) {
    const bot = state().bots.find((b) => b.routine?.id === routineId);
    if (!bot?.routine) return { ok: false, message: "找不到这个定时任务" };
    bot.routine.enabled = enabled;
    return {
      ok: true,
      message: enabled ? `已开启「${bot.name}」定时任务` : `已暂停「${bot.name}」定时任务`,
    };
  },

  async listInspirations(query) {
    const q = query?.trim().toLowerCase();
    const items = state().inspirations;
    if (!q) return items;
    return items.filter((i) =>
      [i.title, i.content, i.summary, i.url, ...i.tags].some((v) => v?.toLowerCase().includes(q)),
    );
  },

  async addInspiration(input) {
    state().inspirations.unshift({
      id: `insp-${Date.now()}`,
      source: input.url ? "link" : "text",
      url: input.url ?? null,
      title: input.title ?? null,
      content: input.content,
      summary: null,
      tags: input.tags,
      freshness: null,
      createdAt: new Date(),
    });
    return { ok: true, message: "已加入灵感库，「灵感库整理」Bot 会自动摘要和打标签" };
  },

  async listDrafts(status?: DraftStatus) {
    const drafts = state().drafts;
    return status ? drafts.filter((d) => d.status === status) : drafts;
  },

  async countDraftsByStatus() {
    const counts: Partial<Record<DraftStatus, number>> = {};
    for (const d of state().drafts) counts[d.status] = (counts[d.status] ?? 0) + 1;
    return counts;
  },

  async getDraft(id) {
    return state().drafts.find((d) => d.id === id) ?? null;
  },

  async reviewDraft(id, decision, note) {
    const draft = state().drafts.find((d) => d.id === id);
    if (!draft) return { ok: false, message: "找不到这篇草稿" };
    try {
      draft.status = applyReviewDecision(draft.status, decision);
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    draft.reviewNote = note || null;
    draft.updatedAt = new Date();
    return { ok: true, message: decision === "approve" ? "已通过，可以导出了" : "已退回修改" };
  },

  async markExported(id) {
    const draft = state().drafts.find((d) => d.id === id);
    if (draft && draft.status === "approved") draft.status = "exported";
  },

  async getSettings() {
    return state().settings;
  },

  async saveTierMapping(tiers: TierMapping) {
    state().settings.tiers = tiers;
    return { ok: true, message: "已保存模型档位映射（演示模式下重启后会恢复默认）" };
  },

  async listProviderCredentials() {
    return state().providers;
  },

  async saveProviderCredential(input) {
    const s = state();
    const existing = input.id ? s.providers.find((p) => p.id === input.id) : undefined;
    if (!existing && s.providers.some((p) => p.name === input.name)) {
      return { ok: false, message: `已经有名为「${input.name}」的 Provider 了` };
    }
    // 演示模式：Key 不会被保存（只记录后 4 位用于展示）
    const masked = input.apiKey
      ? `****${input.apiKey.slice(-4)}`
      : input.clearKey
        ? null
        : (existing?.maskedKey ?? null);
    const view: ProviderCredentialView = {
      id: existing?.id ?? `demo-provider-${Date.now()}`,
      name: input.name,
      baseUrl: input.baseUrl,
      tierModels: input.tierModels,
      priority: input.priority ?? existing?.priority ?? 100,
      enabled: input.enabled ?? true,
      hasKey: Boolean(masked),
      maskedKey: masked,
      updatedAt: new Date(),
    };
    s.providers = existing
      ? s.providers.map((p) => (p.id === existing.id ? view : p))
      : [...s.providers, view];
    return { ok: true, message: "演示模式：已更新列表，但 API Key 不会被保存" };
  },

  async deleteProviderCredential(id) {
    const s = state();
    const before = s.providers.length;
    s.providers = s.providers.filter((p) => p.id !== id);
    return s.providers.length < before
      ? { ok: true, message: "已删除" }
      : { ok: false, message: "找不到这个 Provider" };
  },

  async getUsage(days): Promise<UsageData> {
    const timezone = process.env.CC_TIMEZONE || "Asia/Shanghai";
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const bots = state().bots;
    const rows = Array.from({ length: Math.min(days, 5) }, (_, d) =>
      fmt.format(new Date(Date.now() - d * 86400_000)),
    ).flatMap((day, d) =>
      bots.map((b, i) => ({
        day,
        botId: b.id,
        botName: b.name,
        calls: 3 + i * 2 + d,
        failedCalls: i === 0 && d === 1 ? 1 : 0,
        inputTokens: 1800 * (i + 1) + 300 * d,
        outputTokens: 900 * (i + 1),
        costUsd: Number((0.04 * (i + 1) + 0.01 * d).toFixed(4)),
      })),
    );
    return {
      timezone,
      today: fmt.format(new Date()),
      days,
      rows,
      budgets: bots.map((b) => ({
        botId: b.id,
        botName: b.name,
        dailyBudgetUsd:
          b.slug === "topic-radar" ? 0.5 : b.slug === "inspiration-curator" ? 0.2 : null,
      })),
    };
  },
};
