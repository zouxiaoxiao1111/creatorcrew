import type { ReactNode } from "react";
import { Badge } from "@creatorcrew/ui";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db-context";
import { features } from "@/lib/env";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

/** 需要登录的应用页面（演示模式除外）。每个页面取数据时还会再次校验（authedStore）。 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const f = features();
  const demo = isDemoMode();
  return (
    <>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-5 md:flex">
          <div className="mb-6 px-3">
            <div className="text-base font-semibold tracking-tight">CreatorCrew</div>
            <div className="text-xs text-zinc-500">你的 AI 编辑部</div>
          </div>
          <Nav />
          <div className="mt-auto space-y-2 px-3 text-xs text-zinc-500">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={f.edition === "cloud" ? "violet" : "zinc"}>
                {f.edition === "cloud" ? "在线版" : "自部署版"}
              </Badge>
              {f.eeLoaded ? <Badge tone="blue">ee 已加载</Badge> : null}
            </div>
            {user ? (
              <div className="space-y-1.5 border-t border-zinc-100 pt-3">
                <div className="truncate text-zinc-700" title={user.email}>
                  {user.email}
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
                  >
                    退出登录
                  </button>
                </form>
              </div>
            ) : (
              <div className="border-t border-zinc-100 pt-3 text-amber-700">
                演示模式 · 无需登录
              </div>
            )}
            <div>v0.1.0 · AGPL-3.0</div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-4 border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
            <span className="font-semibold">CreatorCrew</span>
            <div className="flex gap-3 text-sm text-zinc-600">
              <a href="/">工作台</a>
              <a href="/inspiration">灵感库</a>
              <a href="/review">审核</a>
              <a href="/usage">用量</a>
              <a href="/settings">设置</a>
            </div>
          </header>
          {demo ? (
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-800">
              演示模式：没有配置 <code className="font-mono">DATABASE_URL</code>
              ，页面使用内存中的示例数据，重启后会丢失。用
              <code className="mx-1 font-mono">docker compose up</code>启动即可使用真实数据库。
            </div>
          ) : null}
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </>
  );
}
