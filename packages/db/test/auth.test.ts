import { SESSION_TTL_MS, hashSessionToken } from "@creatorcrew/core/auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthService } from "../src/auth";
import * as schema from "../src/schema";
import { fakeHasher, freshDb } from "./helpers";

let ctx: Awaited<ReturnType<typeof freshDb>>;
let clock = new Date("2026-10-10T00:00:00Z");
const now = () => clock;

beforeAll(async () => {
  ctx = await freshDb();
}, 60_000);
afterAll(async () => {
  await ctx.client.close();
});

describe("首次初始化（setup）与登录流程", () => {
  it("一开始没有管理员", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    expect(await auth.hasAdmin()).toBe(false);
  });

  it("非法输入不会创建账号", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    const res = await auth.setupAdmin({ email: "bad", password: "short" }, ctx.ws.id);
    expect(res.ok).toBe(false);
    expect(await auth.hasAdmin()).toBe(false);
  });

  it("并发提交 setup 时只会创建一个管理员", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    const results = await Promise.all([
      auth.setupAdmin({ email: "Admin@Example.com ", password: "correct horse 42" }, ctx.ws.id),
      auth.setupAdmin({ email: "other@example.com", password: "correct horse 42" }, ctx.ws.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "already_setup" });
    const users = await ctx.db.select().from(schema.users);
    expect(users).toHaveLength(1);
    // 密码不以明文保存；管理员是默认 workspace 的 owner
    expect(users[0]!.passwordHash).not.toContain("correct horse");
    const [m] = await ctx.db.select().from(schema.memberships);
    expect(m).toMatchObject({ workspaceId: ctx.ws.id, userId: users[0]!.id, role: "owner" });
  });

  it("创建后再次 setup 被拒绝", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    expect(await auth.hasAdmin()).toBe(true);
    const res = await auth.setupAdmin(
      { email: "x@example.com", password: "another pass 99" },
      ctx.ws.id,
    );
    expect(res).toMatchObject({ ok: false, reason: "already_setup" });
  });

  it("错误密码 / 不存在的邮箱都返回同样的错误", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    expect(await auth.login("admin@example.com", "wrong password")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await auth.login("nobody@example.com", "correct horse 42")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("登录成功后会话存在数据库里（只存 token 哈希），可以校验和登出", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    const res = await auth.login(" ADMIN@example.com", "correct horse 42", {
      userAgent: "vitest",
      ip: "127.0.0.1",
    });
    if (!res.ok) throw new Error("login failed");
    const rows = await ctx.db.select().from(schema.sessions);
    expect(rows.map((r) => r.id)).toContain(hashSessionToken(res.token));
    expect(rows.map((r) => r.id)).not.toContain(res.token);

    const session = await auth.validateSession(res.token);
    expect(session?.user.email).toBe("admin@example.com");
    expect(session?.refreshed).toBe(false);
    expect(await auth.validateSession("forged-token")).toBeNull();

    await auth.logout(res.token);
    expect(await auth.validateSession(res.token)).toBeNull();
  });

  it("会话快过期时自动续期，过期后失效并被删除", async () => {
    const auth = createAuthService(ctx.db, fakeHasher, now);
    const res = await auth.login("admin@example.com", "correct horse 42");
    if (!res.ok) throw new Error("login failed");

    clock = new Date(clock.getTime() + 20 * 24 * 3600 * 1000); // 20 天后：剩余 10 天，触发续期
    const refreshed = await auth.validateSession(res.token);
    expect(refreshed?.refreshed).toBe(true);
    expect(refreshed!.expiresAt.getTime()).toBe(clock.getTime() + SESSION_TTL_MS);

    clock = new Date(clock.getTime() + SESSION_TTL_MS + 1000); // 超过有效期
    expect(await auth.validateSession(res.token)).toBeNull();
    const left = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, hashSessionToken(res.token)));
    expect(left).toHaveLength(0);
  });
});
