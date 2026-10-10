import "server-only";
import { SESSION_COOKIE, SESSION_TTL_MS, decideAccess } from "@creatorcrew/core/auth";
import { createAuthService, type SessionUser } from "@creatorcrew/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDbContext, isDemoMode } from "../db-context";
import { argon2Hasher } from "./password";

export async function getAuthService() {
  const { db } = await getDbContext();
  return createAuthService(db, argon2Hasher);
}

export function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.CC_BASE_URL ?? "").startsWith("https://"),
    path: "/",
    ...(expires ? { expires } : { maxAge: Math.floor(SESSION_TTL_MS / 1000) }),
  };
}

export async function requestMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined,
  };
}

/** 当前请求的登录用户（同一次渲染内只查一次数据库）。演示模式返回 demo 标记。 */
export const getCurrentUser = cache(
  async (): Promise<{ demo: true } | { demo: false; user: SessionUser | null }> => {
    if (isDemoMode()) return { demo: true };
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await (await getAuthService()).validateSession(token);
    return { demo: false, user: session?.user ?? null };
  },
);

/**
 * 页面 / Server Action 使用：没有登录就跳转（还没有管理员时跳 /setup）。
 * 这是真正的鉴权（proxy.ts 只做基于 cookie 的乐观检查）。
 */
export async function requireUser(pathname = "/"): Promise<SessionUser | null> {
  const current = await getCurrentUser();
  if (current.demo) return null;
  if (current.user) return current.user;
  const hasAdmin = await (await getAuthService()).hasAdmin();
  const decision = decideAccess({ pathname, demo: false, authenticated: false, hasAdmin });
  redirect(decision.action === "redirect" ? decision.to : "/login");
}

/** API Route 使用：没有登录返回 false（调用方返回 401）。 */
export async function isApiAuthorized(): Promise<boolean> {
  const current = await getCurrentUser();
  return current.demo || Boolean(current.user);
}
