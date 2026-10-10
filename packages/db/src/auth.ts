import {
  SESSION_REFRESH_MS,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  normalizeEmail,
  validateSetupInput,
  type CredentialsInput,
} from "@creatorcrew/core/auth";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { memberships, sessions, users } from "./schema";
import type { AnyDb } from "./types";

/** 密码哈希实现由调用方注入（web 用 argon2id；测试用假实现）。 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

const SETUP_LOCK_ID = 727_002;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface ValidSession {
  user: SessionUser;
  expiresAt: Date;
  /** 剩余有效期不足一半时已自动续期，调用方需要重新写 cookie */
  refreshed: boolean;
}

export type SetupResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "already_setup" | "invalid"; errors: string[] };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: SessionUser }
  | { ok: false; reason: "invalid_credentials" };

/** 一个合法的 argon2id 哈希，用于用户不存在时也做一次校验，避免通过响应时间探测邮箱是否存在。 */
let dummyHash: string | undefined;

export function createAuthService(
  db: AnyDb,
  hasher: PasswordHasher,
  now: () => Date = () => new Date(),
) {
  async function hasAdmin(): Promise<boolean> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    return (row?.n ?? 0) > 0;
  }

  /**
   * 首次初始化：创建唯一的管理员账号，并设为默认 workspace 的 owner。
   * 用事务级 advisory lock 保证并发请求下也只会创建一个管理员。
   */
  async function setupAdmin(input: CredentialsInput, workspaceId: string): Promise<SetupResult> {
    const errors = validateSetupInput(input);
    if (errors.length) return { ok: false, reason: "invalid", errors };
    const passwordHash = await hasher.hash(input.password);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_ID})`);
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
      if ((row?.n ?? 0) > 0) {
        return {
          ok: false as const,
          reason: "already_setup" as const,
          errors: ["管理员账号已经创建过了，请直接登录"],
        };
      }
      const [user] = await tx
        .insert(users)
        .values({ email: normalizeEmail(input.email), passwordHash, name: "管理员" })
        .returning();
      await tx.insert(memberships).values({ workspaceId, userId: user!.id, role: "owner" });
      return { ok: true as const, user: { id: user!.id, email: user!.email, name: user!.name } };
    });
  }

  async function createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
    const token = generateSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
    await db.insert(sessions).values({
      id: hashSessionToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip?.slice(0, 64),
    });
    return { token, expiresAt };
  }

  async function login(
    email: string,
    password: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<LoginResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);
    if (!user?.passwordHash) {
      dummyHash ??= await hasher.hash("creatorcrew-timing-equalizer");
      await hasher.verify(dummyHash, password);
      return { ok: false, reason: "invalid_credentials" };
    }
    if (!(await hasher.verify(user.passwordHash, password)))
      return { ok: false, reason: "invalid_credentials" };
    const { token, expiresAt } = await createSession(user.id, meta);
    return {
      ok: true,
      token,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async function validateSession(token: string | undefined | null): Promise<ValidSession | null> {
    if (!token) return null;
    const id = hashSessionToken(token);
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .limit(1);
    if (!row) return null;
    const current = now();
    if (row.session.expiresAt.getTime() <= current.getTime()) {
      await db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    let expiresAt = row.session.expiresAt;
    let refreshed = false;
    if (expiresAt.getTime() - current.getTime() < SESSION_REFRESH_MS) {
      expiresAt = new Date(current.getTime() + SESSION_TTL_MS);
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
      refreshed = true;
    }
    return {
      user: { id: row.user.id, email: row.user.email, name: row.user.name },
      expiresAt,
      refreshed,
    };
  }

  async function logout(token: string | undefined | null) {
    if (token) await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  }

  async function purgeExpiredSessions() {
    await db.delete(sessions).where(lt(sessions.expiresAt, now()));
  }

  async function activeSessionCount(userId: string) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now())));
    return row?.n ?? 0;
  }

  return {
    hasAdmin,
    setupAdmin,
    login,
    createSession,
    validateSession,
    logout,
    purgeExpiredSessions,
    activeSessionCount,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
