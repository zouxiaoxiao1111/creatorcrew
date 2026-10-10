import { and, eq, gte, sql } from "drizzle-orm";
import { bots, routines, usageEvents } from "./schema";
import type { AnyDb } from "./types";

export interface DailyBotUsage {
  day: string; // YYYY-MM-DD（按 CC_TIMEZONE）
  botId: string | null;
  botName: string;
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface BotBudget {
  botId: string;
  botName: string;
  /** budget_usd：每个 Bot 每天的花费上限（USD），为空表示不限 */
  dailyBudgetUsd: number | null;
}

/** 按「天 × Bot」汇总用量。天按指定时区切分。 */
export async function dailyUsageByBot(
  db: AnyDb,
  workspaceId: string,
  opts: { days: number; timezone: string; now?: Date },
): Promise<DailyBotUsage[]> {
  const since = new Date((opts.now ?? new Date()).getTime() - opts.days * 24 * 3600 * 1000);
  const day = sql<string>`to_char(${usageEvents.createdAt} at time zone ${opts.timezone}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      botId: usageEvents.botId,
      botName: sql<string>`coalesce(${bots.name}, '（已删除的 Bot）')`,
      calls: sql<number>`count(*)::int`,
      failedCalls: sql<number>`count(*) filter (where not ${usageEvents.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
      costUsd: sql<string | null>`sum(${usageEvents.costUsd})`,
    })
    .from(usageEvents)
    .leftJoin(bots, eq(usageEvents.botId, bots.id))
    .where(and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, since)))
    .groupBy(sql`1`, sql`2`, sql`3`)
    .orderBy(sql`1 desc`, sql`3`);
  return rows.map((r) => ({ ...r, costUsd: r.costUsd == null ? null : Number(r.costUsd) }));
}

export async function botBudgets(db: AnyDb, workspaceId: string): Promise<BotBudget[]> {
  const rows = await db
    .select({ botId: bots.id, botName: bots.name, budget: routines.budgetUsd })
    .from(bots)
    .leftJoin(routines, eq(routines.botId, bots.id))
    .where(eq(bots.workspaceId, workspaceId))
    .orderBy(bots.createdAt);
  return rows.map((r) => ({
    botId: r.botId,
    botName: r.botName,
    dailyBudgetUsd: r.budget == null ? null : Number(r.budget),
  }));
}

/** 某个 Bot「今天」（按时区）已花费的金额，用于每日预算控制。 */
export async function botSpendToday(db: AnyDb, botId: string, timezone: string): Promise<number> {
  const [row] = await db
    .select({ v: sql<string | null>`sum(${usageEvents.costUsd})` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.botId, botId),
        sql`(${usageEvents.createdAt} at time zone ${timezone})::date = (now() at time zone ${timezone})::date`,
      ),
    );
  return Number(row?.v ?? 0);
}
