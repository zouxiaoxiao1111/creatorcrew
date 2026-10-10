import { getAuthProviders, safeNextPath } from "@creatorcrew/core/auth";
import { Card, inputClass } from "@creatorcrew/ui";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { getAuthService, getCurrentUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db-context";
import { features } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (isDemoMode()) redirect("/");
  const sp = await searchParams;
  const next = safeNextPath(pick(sp, "next"));
  const current = await getCurrentUser();
  if (!current.demo && current.user) redirect(next);
  if (!(await (await getAuthService()).hasAdmin())) redirect("/setup");
  const others = getAuthProviders(features()).filter((p) => p.id !== "credentials");

  return (
    <Card>
      <h1 className="text-lg font-semibold">登录</h1>
      <p className="mt-1 text-sm text-zinc-500">使用管理员账号登录你的编辑部。</p>
      <div className="mt-4">
        <Flash error={pick(sp, "error")} msg={pick(sp, "msg")} />
      </div>
      <form action={loginAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">邮箱</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            defaultValue={pick(sp, "email")}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">密码</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
        <SubmitButton className="w-full" pendingText="登录中…">
          登录
        </SubmitButton>
      </form>
      {others.length ? (
        <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
          {others.map((p) => (
            <button
              key={p.id}
              disabled
              className="h-9 w-full rounded-lg border border-zinc-200 text-sm text-zinc-400"
            >
              使用 {p.label} 登录（即将支持）
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-4 text-xs text-zinc-400">
        忘记密码？自部署版请在服务器上执行重置命令（即将提供）。
      </p>
    </Card>
  );
}
