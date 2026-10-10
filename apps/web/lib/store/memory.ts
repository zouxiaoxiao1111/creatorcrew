import { loadOfficialTemplates } from "@creatorcrew/agents";
import type { TierMapping, WorkspaceSettings } from "@creatorcrew/core/domain";
import { applyReviewDecision, type DraftStatus } from "@creatorcrew/core/review";
import { demoDrafts, demoInspirations, demoRuns } from "./demo-data";
import type { BotView, DraftView, InspirationView, RunView, Store } from "./types";

interface MemoryState {
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
};
