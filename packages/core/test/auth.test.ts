import { describe, expect, it } from "vitest";
import {
  assertSecretKey,
  decideAccess,
  generateSessionToken,
  getAuthProviders,
  hashSessionToken,
  safeNextPath,
  validateSetupInput,
} from "../src";

describe("decideAccess 路由守卫", () => {
  const base = { demo: false, authenticated: false, hasAdmin: true };

  it("演示模式不需要登录，/login 和 /setup 跳回首页", () => {
    expect(decideAccess({ ...base, demo: true, pathname: "/settings" })).toEqual({
      action: "allow",
    });
    expect(decideAccess({ ...base, demo: true, pathname: "/login" })).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("还没有管理员时，页面都跳到 /setup，API 返回 401，健康检查放行", () => {
    const noAdmin = { ...base, hasAdmin: false };
    expect(decideAccess({ ...noAdmin, pathname: "/" })).toEqual({
      action: "redirect",
      to: "/setup",
    });
    expect(decideAccess({ ...noAdmin, pathname: "/login" })).toEqual({
      action: "redirect",
      to: "/setup",
    });
    expect(decideAccess({ ...noAdmin, pathname: "/setup" })).toEqual({ action: "allow" });
    expect(decideAccess({ ...noAdmin, pathname: "/api/drafts/1/export" })).toEqual({
      action: "unauthorized",
    });
    expect(decideAccess({ ...noAdmin, pathname: "/api/health" })).toEqual({ action: "allow" });
  });

  it("已有管理员后 /setup 不可再用", () => {
    expect(decideAccess({ ...base, pathname: "/setup" })).toEqual({
      action: "redirect",
      to: "/login",
    });
    expect(decideAccess({ ...base, authenticated: true, pathname: "/setup" })).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("未登录访问页面跳 /login 并带上 next，访问 API 返回 401", () => {
    expect(decideAccess({ ...base, pathname: "/review" })).toEqual({
      action: "redirect",
      to: "/login?next=%2Freview",
    });
    expect(decideAccess({ ...base, pathname: "/" })).toEqual({ action: "redirect", to: "/login" });
    expect(decideAccess({ ...base, pathname: "/api/drafts/x/export" })).toEqual({
      action: "unauthorized",
    });
    expect(decideAccess({ ...base, pathname: "/api/health" })).toEqual({ action: "allow" });
    expect(decideAccess({ ...base, pathname: "/login" })).toEqual({ action: "allow" });
  });

  it("已登录可以访问所有页面，访问 /login 跳回首页", () => {
    expect(decideAccess({ ...base, authenticated: true, pathname: "/usage" })).toEqual({
      action: "allow",
    });
    expect(decideAccess({ ...base, authenticated: true, pathname: "/login" })).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("只做乐观检查（不知道是否有管理员）时也能给出决定", () => {
    expect(decideAccess({ demo: false, authenticated: false, pathname: "/settings" })).toEqual({
      action: "redirect",
      to: "/login?next=%2Fsettings",
    });
  });
});

describe("safeNextPath 防开放重定向", () => {
  it.each([
    ["/review", "/review"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/login", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("validateSetupInput", () => {
  it("合法输入没有错误", () => {
    expect(
      validateSetupInput({
        email: "me@example.com",
        password: "correct horse 42",
        confirm: "correct horse 42",
      }),
    ).toEqual([]);
  });
  it("邮箱、密码长度、确认密码都会校验", () => {
    const errors = validateSetupInput({ email: "bad", password: "short", confirm: "other" });
    expect(errors).toHaveLength(3);
    expect(validateSetupInput({ email: "a@b.co", password: "aaaaaaaaaaaa" })).toContain(
      "密码不能是同一个字符的重复",
    );
  });
});

describe("会话 token", () => {
  it("随机生成，数据库只存哈希", () => {
    const a = generateSessionToken();
    expect(a).not.toBe(generateSessionToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
  });
});

describe("登录方式", () => {
  it("自部署只有账号密码；在线版按环境变量预留 OAuth", () => {
    expect(
      getAuthProviders(
        { multiTenant: false },
        { AUTH_GITHUB_ID: "x", AUTH_GITHUB_SECRET: "y" },
      ).map((p) => p.id),
    ).toEqual(["credentials"]);
    expect(
      getAuthProviders({ multiTenant: true }, { AUTH_GITHUB_ID: "x", AUTH_GITHUB_SECRET: "y" }).map(
        (p) => p.id,
      ),
    ).toEqual(["credentials", "github"]);
  });
});

describe("assertSecretKey", () => {
  it("缺少或太短时拒绝启动", () => {
    expect(() => assertSecretKey({})).toThrowError(/CC_SECRET_KEY/);
    expect(() => assertSecretKey({ CC_SECRET_KEY: "short" })).toThrowError(/16/);
    expect(assertSecretKey({ CC_SECRET_KEY: "x".repeat(32) })).toHaveLength(32);
  });
});
