import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { botSpendToday, dailyUsageByBot } from "../src/usage";
import { createProviderRepo, validateProviderInput } from "../src/providers";
import * as schema from "../src/schema";
import { freshDb } from "./helpers";

const MASTER = "test-master-key-0123456789abcdef";
const KEY = "sk-live-secret-ABCD1234";
let ctx: Awaited<ReturnType<typeof freshDb>>;

beforeAll(async () => {
  ctx = await freshDb();
}, 60_000);
afterAll(async () => {
  await ctx.client.close();
});

describe("Provider 凭据加密存储", () => {
  it("保存后数据库里只有密文，列表只返回脱敏后 4 位", async () => {
    const repo = createProviderRepo(ctx.db, MASTER);
    const view = await repo.save(ctx.ws.id, {
      name: "openai",
      baseUrl: "https://api.example.com/v1/",
      apiKey: KEY,
      tierModels: { cheap: "m-small", strong: "m-large", mid: "  " },
    });
    expect(view).toMatchObject({
      name: "openai",
      baseUrl: "https://api.example.com/v1",
      maskedKey: "****1234",
      hasKey: true,
    });
    expect(view.tierModels).toEqual({ cheap: "m-small", strong: "m-large" });

    const [secret] = await ctx.db.select().from(schema.secrets);
    expect(secret!.ciphertext).not.toContain(KEY);
    expect(secret!.ciphertext.startsWith("v1:")).toBe(true);
    expect(JSON.stringify(await repo.list(ctx.ws.id))).not.toContain("secret-ABCD");
  });

  it("worker 可以解密拿到原始 Key", async () => {
    const repo = createProviderRepo(ctx.db, MASTER);
    const [p] = await repo.loadDecrypted(ctx.ws.id);
    expect(p).toMatchObject({
      name: "openai",
      apiKey: KEY,
      tierModels: { cheap: "m-small", strong: "m-large" },
    });
  });

  it("主密钥不对时解密失败，该 Provider 被跳过并报告", async () => {
    const errors: string[] = [];
    const list = await createProviderRepo(ctx.db, "a-totally-different-master-key").loadDecrypted(
      ctx.ws.id,
      (name) => errors.push(name),
    );
    expect(list).toHaveLength(0);
    expect(errors).toEqual(["openai"]);
  });

  it("编辑时 Key 留空保持不变，填写新 Key 则替换", async () => {
    const repo = createProviderRepo(ctx.db, MASTER);
    const [existing] = await repo.list(ctx.ws.id);
    await repo.save(ctx.ws.id, {
      id: existing!.id,
      name: "openai",
      baseUrl: "https://api.example.com/v2",
      tierModels: { mid: "m-mid" },
    });
    let [p] = await repo.loadDecrypted(ctx.ws.id);
    expect(p).toMatchObject({
      apiKey: KEY,
      baseUrl: "https://api.example.com/v2",
      tierModels: { mid: "m-mid" },
    });

    await repo.save(ctx.ws.id, {
      id: existing!.id,
      name: "openai",
      baseUrl: "https://api.example.com/v2",
      apiKey: "sk-new-key-99999999",
      tierModels: {},
    });
    [p] = await repo.loadDecrypted(ctx.ws.id);
    expect(p!.apiKey).toBe("sk-new-key-99999999");
    expect((await repo.list(ctx.ws.id))[0]!.maskedKey).toBe("****9999");
    expect(await ctx.db.select().from(schema.secrets)).toHaveLength(1);
  });

  it("可以清除 Key，删除 Provider 时连带删除密文", async () => {
    const repo = createProviderRepo(ctx.db, MASTER);
    const [existing] = await repo.list(ctx.ws.id);
    await repo.save(ctx.ws.id, {
      id: existing!.id,
      name: "openai",
      baseUrl: "http://ollama:11434/v1",
      clearKey: true,
      tierModels: {},
    });
    expect((await repo.list(ctx.ws.id))[0]).toMatchObject({ hasKey: false, maskedKey: null });
    expect(await ctx.db.select().from(schema.secrets)).toHaveLength(0);

    await repo.save(ctx.ws.id, {
      name: "gateway",
      baseUrl: "https://gw.example.com/v1",
      apiKey: "gw-key-12345678",
      tierModels: {},
    });
    const gw = (await repo.list(ctx.ws.id)).find((p) => p.name === "gateway")!;
    expect(await repo.remove(ctx.ws.id, gw.id)).toBe(true);
    expect(await ctx.db.select().from(schema.secrets)).toHaveLength(0);
    expect(await repo.remove(ctx.ws.id, gw.id)).toBe(false);
  });

  it("名称和 URL 会校验，重名会报错", async () => {
    expect(
      validateProviderInput({ name: "Bad Name", baseUrl: "ftp://x", tierModels: {} }),
    ).toHaveLength(2);
    const repo = createProviderRepo(ctx.db, MASTER);
    await expect(
      repo.save(ctx.ws.id, { name: "openai", baseUrl: "https://dup.example.com", tierModels: {} }),
    ).rejects.toThrow();
  });
});

describe("用量统计", () => {
  it("按天 × Bot 汇总，并能算出今天的花费", async () => {
    const [bot] = await ctx.db.select().from(schema.bots);
    await ctx.db.insert(schema.usageEvents).values([
      {
        workspaceId: ctx.ws.id,
        botId: bot!.id,
        provider: "openai",
        model: "m",
        tier: "strong",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: "0.120000",
      },
      {
        workspaceId: ctx.ws.id,
        botId: bot!.id,
        provider: "openai",
        model: "m",
        tier: "mid",
        inputTokens: 10,
        outputTokens: 0,
        ok: false,
        error: "429",
      },
    ]);
    const rows = await dailyUsageByBot(ctx.db, ctx.ws.id, { days: 7, timezone: "Asia/Shanghai" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      botName: "长文写作",
      calls: 2,
      failedCalls: 1,
      inputTokens: 1010,
      outputTokens: 500,
      costUsd: 0.12,
    });
    expect(rows[0]!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await botSpendToday(ctx.db, bot!.id, "Asia/Shanghai")).toBeCloseTo(0.12);
  });
});
