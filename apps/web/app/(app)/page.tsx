import { MODEL_TIER_LABELS } from "@creatorcrew/core/domain";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
  buttonClass,
  inputClass,
} from "@creatorcrew/ui";
import Link from "next/link";
import { runBotAction, toggleRoutineAction } from "./actions";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { BOT_STATUS, RUN_STATUS, formatTime, formatTokens } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL = {
  manual: "手动",
  schedule: "定时",
  webhook: "Webhook",
  event: "事件",
} as const;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { bots, stats, recentRuns } = await getStore().getDashboard();

  return (
    <>
      <PageHeader
        title="工作台"
        description="一个总管派活，多个专职 Bot 分别负责选题、整理和写作；你只做最后的判断和润色。"
        actions={
          <Link href="/review" className={buttonClass("secondary")}>
            去审核 {stats.pendingReviews ? `(${stats.pendingReviews})` : ""}
          </Link>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="新选题" value={stats.newTopics} hint="选题雷达产出、尚未处理" />
        <StatCard label="待审稿件" value={stats.pendingReviews} hint="需要你审核后才能导出" />
        <StatCard label="运行中的任务" value={stats.runningRuns} hint="排队中 + 运行中" />
        <StatCard
          label="今日 token"
          value={formatTokens(stats.todayTokens)}
          hint={
            stats.todayCostUsd == null
              ? "未配置单价，暂不估算费用"
              : `约 $${stats.todayCostUsd.toFixed(4)}`
          }
        />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">我的 Bot 团队</h2>
          <span className="text-xs text-zinc-500">
            v0.1 · 手动串联流水线（总管自动调度在 v0.2）
          </span>
        </div>
        {bots.length === 0 ? (
          <EmptyState title="还没有 Bot" description="首次启动时会自动从官方模板创建" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {bots.map((bot) => {
              const status = BOT_STATUS[bot.status];
              return (
                <Card key={bot.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-zinc-900">{bot.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-zinc-400">
                        {bot.templateName}@{bot.templateVersion}
                      </div>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {bot.description ? (
                    <p className="mt-3 text-sm text-zinc-600">{bot.description}</p>
                  ) : null}
                  <dl className="mt-4 space-y-1.5 text-xs text-zinc-500">
                    <div className="flex justify-between gap-2">
                      <dt>模型档位</dt>
                      <dd className="text-zinc-700">
                        {bot.tier ? MODEL_TIER_LABELS[bot.tier] : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>定时任务</dt>
                      <dd className="font-mono text-zinc-700">
                        {bot.routine
                          ? `${bot.routine.cron}${bot.routine.enabled ? "" : "（未开启）"}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>上次运行</dt>
                      <dd className="text-zinc-700">{formatTime(bot.lastRunAt)}</dd>
                    </div>
                    {bot.tools.length ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {bot.tools.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </dl>
                  {bot.lastError ? (
                    <p className="mt-3 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                      {bot.lastError}
                    </p>
                  ) : null}
                  <div className="mt-auto pt-4">
                    <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                      <form action={runBotAction} className="flex flex-1 flex-wrap gap-2">
                        <input type="hidden" name="botId" value={bot.id} />
                        {bot.runInputs.map((i) => (
                          <input
                            key={i.key}
                            name={`input_${i.key}`}
                            required
                            placeholder={`${i.label}（必填）`}
                            className={`${inputClass} h-8 basis-full py-1 text-xs`}
                          />
                        ))}
                        <SubmitButton
                          size="sm"
                          pendingText="加入队列…"
                          disabled={bot.status === "running" || bot.status === "queued"}
                        >
                          立即运行
                        </SubmitButton>
                      </form>
                      {bot.routine ? (
                        <form action={toggleRoutineAction}>
                          <input type="hidden" name="routineId" value={bot.routine.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={String(!bot.routine.enabled)}
                          />
                          <SubmitButton size="sm" variant="secondary">
                            {bot.routine.enabled ? "暂停定时" : "开启定时"}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">最近运行</h2>
        <Card className="overflow-hidden p-0">
          {recentRuns.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">还没有运行记录</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Bot</th>
                  <th className="px-5 py-2 font-medium">状态</th>
                  <th className="px-5 py-2 font-medium">触发</th>
                  <th className="px-5 py-2 font-medium">时间</th>
                  <th className="px-5 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-5 py-2.5">{run.botName}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={RUN_STATUS[run.status].tone}>
                        {RUN_STATUS[run.status].label}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-zinc-500">{TRIGGER_LABEL[run.trigger]}</td>
                    <td className="px-5 py-2.5 text-zinc-500">{formatTime(run.createdAt)}</td>
                    <td
                      className="max-w-xs truncate px-5 py-2.5 text-xs text-zinc-500"
                      title={run.error ?? ""}
                    >
                      {run.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </>
  );
}
