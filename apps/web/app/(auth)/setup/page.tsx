import { Card, inputClass } from "@creatorcrew/ui";
import { redirect } from "next/navigation";
import { setupAction } from "../actions";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { getAuthService } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db-context";

/** 首次启动：创建唯一的管理员账号。创建之后这个页面不再可用。 */
export default async function SetupPage({ searchParams }: { searchParams: SearchParams }) {
  if (isDemoMode()) redirect("/");
  if (await (await getAuthService()).hasAdmin()) redirect("/login");
  const sp = await searchParams;

  return (
    <Card>
      <h1 className="text-lg font-semibold">欢迎！先创建管理员账号</h1>
      <p className="mt-1 text-sm text-zinc-500">
        这是自部署版的首次初始化，只需要做一次。之后只有这个账号可以登录。
      </p>
      <div className="mt-4">
        <Flash error={pick(sp, "error")} />
      </div>
      <form action={setupAction} className="space-y-3">
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
          <span className="mb-1 block text-zinc-600">密码（至少 10 个字符）</span>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">再输入一次密码</span>
          <input
            name="confirm"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <SubmitButton className="w-full" pendingText="创建中…">
          创建管理员并登录
        </SubmitButton>
      </form>
      <p className="mt-4 text-xs text-zinc-400">密码使用 argon2id 哈希保存，不会以明文存储。</p>
    </Card>
  );
}
