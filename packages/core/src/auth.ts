import { createHash, randomBytes } from "node:crypto";
import type { Features } from "./edition";

/**
 * 认证相关的纯逻辑（不依赖数据库 / Next.js），便于测试：
 * - 路由守卫决策
 * - 首次初始化（setup）输入校验
 * - 会话 token 生成与哈希（数据库只存 token 的 SHA-256，不存明文）
 */

export const SESSION_COOKIE = "cc_session";
/** 会话有效期 30 天；剩余不足 15 天时自动续期 */
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const SESSION_REFRESH_MS = 15 * 24 * 3600 * 1000;

/** 不需要登录就能访问的路径（其他页面和 API 一律需要登录）。 */
export const PUBLIC_PATHS = ["/api/health", "/login", "/setup", "/api/auth"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export type AccessDecision =
  { action: "allow" } | { action: "redirect"; to: string } | { action: "unauthorized" };

export interface AccessInput {
  pathname: string;
  /** 演示模式（没有 DATABASE_URL）：不需要登录 */
  demo: boolean;
  /** 是否有有效会话 */
  authenticated: boolean;
  /** 是否已经创建过管理员；未知（例如只做了乐观检查）时为 undefined */
  hasAdmin?: boolean;
}

/**
 * 路由守卫：
 * - 演示模式：全部放行；/login、/setup 跳回首页
 * - 还没有管理员：除公开 API 外都跳到 /setup
 * - 已有管理员：/setup 不再可用；未登录访问页面跳 /login，访问 API 返回 401
 * - 已登录访问 /login 或 /setup：跳回首页
 */
export function decideAccess(input: AccessInput): AccessDecision {
  const { pathname, demo, authenticated, hasAdmin } = input;
  const isAuthPage = pathname === "/login" || pathname === "/setup";

  if (demo) return isAuthPage ? { action: "redirect", to: "/" } : { action: "allow" };

  if (hasAdmin === false) {
    if (pathname === "/setup" || pathname === "/api/health") return { action: "allow" };
    if (isApiPath(pathname) && !pathname.startsWith("/api/auth")) return { action: "unauthorized" };
    return { action: "redirect", to: "/setup" };
  }

  if (pathname === "/setup" && hasAdmin === true) {
    return { action: "redirect", to: authenticated ? "/" : "/login" };
  }
  if (authenticated) return isAuthPage ? { action: "redirect", to: "/" } : { action: "allow" };
  if (isPublicPath(pathname)) return { action: "allow" };
  if (isApiPath(pathname)) return { action: "unauthorized" };
  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return { action: "redirect", to: `/login${next}` };
}

/** 登录后跳转目标只允许站内相对路径，防止开放重定向。 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/setup")) return "/";
  return next;
}

export interface CredentialsInput {
  email: string;
  password: string;
  confirm?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 管理员账号校验：邮箱格式、密码至少 10 位且不能全是同一类字符。 */
export function validateSetupInput(input: CredentialsInput): string[] {
  const errors: string[] = [];
  const email = input.email.trim();
  if (!EMAIL_RE.test(email)) errors.push("请输入有效的邮箱地址");
  if (input.password.length < 10) errors.push("密码至少需要 10 个字符");
  if (input.password.length > 256) errors.push("密码太长了（最多 256 个字符）");
  if (/^(.)\1+$/.test(input.password)) errors.push("密码不能是同一个字符的重复");
  if (input.password.toLowerCase() === email.toLowerCase()) errors.push("密码不能和邮箱相同");
  if (input.confirm !== undefined && input.confirm !== input.password)
    errors.push("两次输入的密码不一致");
  return errors;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 数据库里只存 token 的哈希，即使数据库泄露也无法直接冒用会话。 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthProviderId = "credentials" | "email" | "github" | "google";

export interface AuthProviderInfo {
  id: AuthProviderId;
  label: string;
  /** v0.1 只实现了 credentials；其余为在线版预留 */
  implemented: boolean;
}

/**
 * 可用的登录方式。
 * - 自部署：只有管理员账号密码（credentials）
 * - 在线版：在 credentials 之外，按环境变量启用 Magic link / OAuth（尚未实现，结构已预留）
 */
export function getAuthProviders(
  features: Pick<Features, "multiTenant">,
  env: Record<string, string | undefined> = process.env,
): AuthProviderInfo[] {
  const providers: AuthProviderInfo[] = [
    { id: "credentials", label: "邮箱 + 密码", implemented: true },
  ];
  if (!features.multiTenant) return providers;
  // TODO(cloud)：实现 Magic link（需要 SMTP）和 OAuth 回调（/api/auth/callback/<provider>），账号关联写入 account 表
  if (env.AUTH_EMAIL_FROM && env.SMTP_URL)
    providers.push({ id: "email", label: "邮箱登录链接", implemented: false });
  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)
    providers.push({ id: "github", label: "GitHub", implemented: false });
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)
    providers.push({ id: "google", label: "Google", implemented: false });
  return providers;
}

/** 非演示模式下必须配置主密钥（加密存储 API Key、未来的 OAuth token 等）。 */
export function assertSecretKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.CC_SECRET_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "缺少 CC_SECRET_KEY（至少 16 个字符）。请用 `openssl rand -base64 32` 生成，并写入 .env 后重启。",
    );
  }
  return key;
}
