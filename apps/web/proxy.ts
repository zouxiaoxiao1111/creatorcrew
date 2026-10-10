import { SESSION_COOKIE, SESSION_TTL_MS, decideAccess } from "@creatorcrew/core/auth";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 乐观检查（只看 cookie 是否存在，不查数据库）：
 * 没有 cookie 的请求直接跳到 /login（API 返回 401）。
 * 真正的会话校验在 lib/auth/session.ts 的 requireUser() / isApiAuthorized() 中完成。
 */
export function proxy(request: NextRequest) {
  const demo = !process.env.DATABASE_URL;
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const decision = decideAccess({ pathname, demo, authenticated: Boolean(token) });
  // 有 cookie 时访问 /login、/setup 交给页面自己判断（cookie 可能已经失效）
  if (token && (pathname === "/login" || pathname === "/setup")) return NextResponse.next();

  if (decision.action === "unauthorized") {
    return NextResponse.json({ error: "需要登录" }, { status: 401 });
  }
  if (decision.action === "redirect") {
    const target = new URL(decision.to, request.url);
    if (decision.to.startsWith("/login") && search && pathname !== "/") {
      target.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(target);
  }

  const res = NextResponse.next();
  // 滑动续期 cookie（数据库里的会话有效期由服务端负责续期）
  if (token && !demo && request.method === "GET" && !pathname.startsWith("/api/")) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.CC_BASE_URL ?? "").startsWith("https://"),
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
