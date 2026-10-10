import { Badge, Card, EmptyState, PageHeader, cn } from "@creatorcrew/ui";
import Link from "next/link";
import { pick, type SearchParams } from "@/components/flash";
import { formatTokens } from "@/lib/format";
import { authedStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const RANGES = [7, 14, 30];

function money(v: number | null): string {
  return v == null ? "—" : `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

export default async function UsagePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(pick(sp, "days"))) ? Number(pick(sp, "days")) : 7;
  const usage = await (await authedStore("/usage")).getUsage(days);
  const todayRows = usage.rows.filter((r) => r.day === usage.today);
  const hasAnyCost = usage.rows.some((r) => r.costUsd != null);

  const today = usage.budgets.map((b) => {
    const r = todayRows.find((x) => x.botId === b.botId);
    const cost = r?.costUsd ?? null;
    const ratio = b.dailyBudgetUsd && cost != null ? cost / b.dailyBudgetUsd : null;
    return {
      ...b,
      tokens: (r?.inputTokens ?? 0) + (r?.outputTokens ?? 0),
      calls: r?.calls ?? 0,
      failed: r?.failedCalls ?? 0,
      cost,
      ratio,
    };
  });

  return (
    <>
      <PageHeader
        title="用量"
        description={`每个 Bot 每天的 token 用量和估算费用，对比每日预算（budget_usd）。按 ${usage.timezone} 切分日期。`}
        actions={
          <div className="flex gap-1">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/usage?days=${d}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  d === days
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                )}
              >
                近 {d} 天
              </Link>
            ))}
          </div>
        }
      />

      {!hasAnyCost && usage.rows.length > 0 ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          还没有配置模型单价，所以只显示 token，不估算费用；每日预算也要在有费用数据后才会生效。
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-zinc-700">今天（{usage.today}）</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {today.map((b) => {
          const pct = b.ratio == null ? 0 : Math.min(100, Math.round(b.ratio * 100));
          const tone =
            b.ratio == null ? "zinc" : b.ratio >= 1 ? "red" : b.ratio >= 0.8 ? "amber" : "green";
          return (
            <Card key={b.botId}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-zinc-900">{b.botName}</div>
                {b.ratio == null ? (
                  <Badge>{b.dailyBudgetUsd == null ? "未设预算" : "无费用数据"}</Badge>
                ) : (
                  <Badge tone={tone}>
                    {b.ratio >= 1 ? "已超预算 · 自动降档" : b.ratio >= 0.8 ? "接近预算" : "正常"}
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight">{money(b.cost)}</span>
                <span className="text-sm text-zinc-500">
                  / {b.dailyBudgetUsd == null ? "不限" : money(b.dailyBudgetUsd)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "red"
                      ? "bg-rose-500"
                      : tone === "amber"
                        ? "bg-amber-400"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-zinc-500">
                <span>{formatTokens(b.tokens)} tokens</span>
                <span>
                  {b.calls} 次调用{b.failed ? ` · ${b.failed} 次失败` : ""}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-700">每日明细</h2>
      {usage.rows.length === 0 ? (
        <EmptyState
          title="还没有用量记录"
          description="运行一次 Bot 后，这里会显示每次模型调用的 token 和费用"
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-2 font-medium">日期</th>
                <th className="px-5 py-2 font-medium">Bot</th>
                <th className="px-5 py-2 text-right font-medium">调用</th>
                <th className="px-5 py-2 text-right font-medium">输入 tokens</th>
                <th className="px-5 py-2 text-right font-medium">输出 tokens</th>
                <th className="px-5 py-2 text-right font-medium">费用</th>
                <th className="px-5 py-2 text-right font-medium">预算</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {usage.rows.map((r) => {
                const budget =
                  usage.budgets.find((b) => b.botId === r.botId)?.dailyBudgetUsd ?? null;
                const over = budget != null && r.costUsd != null && r.costUsd >= budget;
                return (
                  <tr key={`${r.day}-${r.botId}`}>
                    <td className="px-5 py-2.5 font-mono text-xs text-zinc-500">{r.day}</td>
                    <td className="px-5 py-2.5">{r.botName}</td>
                    <td className="px-5 py-2.5 text-right">
                      {r.calls}
                      {r.failedCalls ? (
                        <span className="ml-1 text-xs text-rose-600">（{r.failedCalls} 失败）</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      {formatTokens(r.inputTokens)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      {formatTokens(r.outputTokens)}
                    </td>
                    <td className={cn("px-5 py-2.5 text-right font-mono", over && "text-rose-600")}>
                      {money(r.costUsd)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-zinc-500">
                      {budget == null ? "—" : money(budget)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
