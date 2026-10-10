import { DRAFT_STATUSES, canExport, type DraftStatus } from "@creatorcrew/core/review";
import { Badge, Card, EmptyState, PageHeader, buttonClass, cn, inputClass } from "@creatorcrew/ui";
import Link from "next/link";
import { reviewDraftAction } from "../actions";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { features } from "@/lib/env";
import { DRAFT_STATUS, formatTime } from "@/lib/format";
import { authedStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const TABS: DraftStatus[] = ["in_review", "changes_requested", "approved", "exported"];

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = pick(sp, "status") ?? "in_review";
  const status = (DRAFT_STATUSES as readonly string[]).includes(raw)
    ? (raw as DraftStatus)
    : "in_review";
  const store = await authedStore("/review");
  const [drafts, counts] = await Promise.all([
    store.listDrafts(status),
    store.countDraftsByStatus(),
  ]);
  const { requireApproval } = features();

  return (
    <>
      <PageHeader
        title="草稿审核"
        description="Bot 写的稿件都要经过你审核。通过后才能导出（默认规则，可在配置中调整）。"
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`/review?status=${tab}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              tab === status
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
            )}
          >
            {DRAFT_STATUS[tab].label}
            <span className="ml-1.5 opacity-70">{counts[tab] ?? 0}</span>
          </Link>
        ))}
      </div>

      {drafts.length === 0 ? (
        <EmptyState
          title={`没有「${DRAFT_STATUS[status].label}」的稿件`}
          description="在工作台运行「长文写作」Bot，产出的草稿会出现在这里"
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-zinc-900">{d.title}</h3>
                  <div className="mt-1 text-xs text-zinc-500">
                    {d.botName ?? "人工"} · 更新于 {formatTime(d.updatedAt)}
                  </div>
                </div>
                <Badge tone={DRAFT_STATUS[d.status].tone}>{DRAFT_STATUS[d.status].label}</Badge>
              </div>

              <details className="group mt-4 rounded-lg border border-zinc-100 bg-zinc-50">
                <summary className="cursor-pointer select-none px-4 py-2 text-sm text-zinc-600">
                  查看正文<span className="ml-1 text-xs text-zinc-400">（{d.body.length} 字）</span>
                </summary>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-zinc-100 px-4 py-3 font-sans text-sm leading-relaxed text-zinc-800">
                  {d.body}
                </pre>
              </details>

              {d.titleOptions.length ? (
                <div className="mt-3">
                  <div className="text-xs text-zinc-500">标题备选</div>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-zinc-700">
                    {d.titleOptions.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {d.coverPrompt ? (
                <p className="mt-3 text-xs text-zinc-500">
                  封面图提示词：<span className="text-zinc-700">{d.coverPrompt}</span>
                </p>
              ) : null}
              {d.reviewNote ? (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  审核意见：{d.reviewNote}
                </p>
              ) : null}

              <div className="mt-4 border-t border-zinc-100 pt-4">
                {d.status === "in_review" ? (
                  <form action={reviewDraftAction} className="flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="returnStatus" value={status} />
                    <input
                      name="note"
                      placeholder="审核意见（退回时建议填写）"
                      className={inputClass}
                    />
                    <div className="flex shrink-0 gap-2">
                      <SubmitButton name="decision" value="approve" variant="success">
                        通过
                      </SubmitButton>
                      <SubmitButton name="decision" value="request_changes" variant="danger">
                        退回修改
                      </SubmitButton>
                    </div>
                  </form>
                ) : canExport(d.status, requireApproval) ? (
                  <a href={`/api/drafts/${d.id}/export`} className={buttonClass("secondary", "sm")}>
                    导出 Markdown
                  </a>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {d.status === "changes_requested"
                      ? "已退回，等待 Bot 按意见重写或人工修改（v0.1 尚未支持自动重写）。"
                      : "审核通过后才能导出。"}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
