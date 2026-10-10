import { Badge, Card, EmptyState, PageHeader, buttonClass, inputClass } from "@creatorcrew/ui";
import { addInspirationAction } from "../actions";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { FRESHNESS_LABEL, SOURCE_LABEL, formatTime } from "@/lib/format";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InspirationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = pick(sp, "q") ?? "";
  const items = await getStore().listInspirations(q);

  return (
    <>
      <PageHeader
        title="灵感库"
        description="把链接、笔记和想法统一收进来。「灵感库整理」Bot 会自动摘要、打标签、标注时效，供选题雷达和长文写作检索。"
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <h2 className="mb-3 text-sm font-semibold">收进一条灵感</h2>
          <form action={addInspirationAction} className="space-y-3">
            <input
              name="url"
              type="url"
              placeholder="链接（可选）https://…"
              className={inputClass}
            />
            <input name="title" placeholder="标题（可选）" className={inputClass} />
            <textarea
              name="content"
              rows={5}
              placeholder="粘贴正文、笔记或你的想法…"
              className={inputClass}
            />
            <input name="tags" placeholder="标签，用逗号或空格分隔" className={inputClass} />
            <SubmitButton className="w-full" pendingText="保存中…">
              加入灵感库
            </SubmitButton>
            <p className="text-xs text-zinc-400">
              截图 OCR、X 书签同步、邮件转发等收集方式在后续版本提供。只抓取你主动提供的链接。
            </p>
          </form>
        </Card>

        <div>
          <form className="mb-4 flex gap-2" action="/inspiration">
            <input
              name="q"
              defaultValue={q}
              placeholder="搜索标题、内容或标签…"
              className={inputClass}
            />
            <button className={buttonClass("secondary")} type="submit">
              搜索
            </button>
          </form>
          {items.length === 0 ? (
            <EmptyState
              title={q ? "没有找到匹配的灵感" : "灵感库还是空的"}
              description="从左侧添加第一条吧"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <Badge>{SOURCE_LABEL[item.source]}</Badge>
                    {item.freshness ? (
                      <Badge tone={FRESHNESS_LABEL[item.freshness].tone}>
                        {FRESHNESS_LABEL[item.freshness].label}
                      </Badge>
                    ) : (
                      <Badge tone="blue">待整理</Badge>
                    )}
                    <span className="ml-auto">{formatTime(item.createdAt)}</span>
                  </div>
                  <div className="mt-2 font-medium text-zinc-900">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {item.title || item.url}
                      </a>
                    ) : (
                      item.title || "（无标题）"
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-zinc-600">
                    {item.summary ?? item.content}
                  </p>
                  {item.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
