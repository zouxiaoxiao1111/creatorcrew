import { canExport } from "@creatorcrew/core/review";
import { NextResponse } from "next/server";
import { features } from "@/lib/env";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 导出 Markdown。默认只有审核通过的稿件可以导出；v0.1 不做自动发帖。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const draft = await store.getDraft(id);
  if (!draft) return NextResponse.json({ error: "找不到这篇草稿" }, { status: 404 });
  if (!canExport(draft.status, features().requireApproval)) {
    return NextResponse.json({ error: "审核通过后才能导出" }, { status: 403 });
  }
  const settings = await store.getSettings();
  const label =
    settings.aiLabelOnExport === false ? "" : "\n\n---\n\n> 本文由 AI 辅助创作，经作者审核修改。\n";
  const md = `# ${draft.title}\n\n${draft.body}${label}`;
  await store.markExported(id);
  const filename = encodeURIComponent(`${draft.title.slice(0, 40)}.md`);
  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
