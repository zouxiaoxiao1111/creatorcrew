"use server";

import { SESSION_COOKIE, normalizeEmail, safeNextPath } from "@creatorcrew/core/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthService, requestMeta, sessionCookieOptions } from "@/lib/auth/session";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import { getDbContext, isDemoMode } from "@/lib/db-context";

function fail(path: string, message: string, extra: Record<string, string> = {}): never {
  redirect(`${path}?${new URLSearchParams({ error: message, ...extra }).toString()}`);
}

/** 首次初始化：创建唯一的管理员账号，然后直接登录。 */
export async function setupAction(formData: FormData) {
  if (isDemoMode()) redirect("/");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const { workspaceId } = await getDbContext();
  const auth = await getAuthService();

  const result = await auth.setupAdmin({ email, password, confirm }, workspaceId);
  if (!result.ok) {
    if (result.reason === "already_setup") redirect("/login");
    fail("/setup", result.errors.join("；"), { email });
  }
  const session = await auth.createSession(result.user.id, await requestMeta());
  (await cookies()).set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  redirect(
    "/settings?msg=" + encodeURIComponent("管理员账号已创建。下一步：添加模型 Provider 的 API Key"),
  );
}

export async function loginAction(formData: FormData) {
  if (isDemoMode()) redirect("/");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const meta = await requestMeta();
  const limitKey = `${meta.ip ?? "?"}|${normalizeEmail(email)}`;

  if (isRateLimited(limitKey)) fail("/login", "尝试次数过多，请 15 分钟后再试", { next });
  const auth = await getAuthService();
  if (!(await auth.hasAdmin())) redirect("/setup");

  const result = await auth.login(email, password, meta);
  if (!result.ok) {
    recordFailure(limitKey);
    fail("/login", "邮箱或密码不正确", { next, email });
  }
  clearFailures(limitKey);
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  redirect(next);
}
