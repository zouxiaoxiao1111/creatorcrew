import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyReviewDecision,
  canExport,
  decryptSecret,
  encryptSecret,
  findEEDir,
  getFeatures,
  loadEE,
  parseTargetList,
  resolveEdition,
} from "../src";

describe("edition & features", () => {
  it("默认是 selfhost，单租户、无计费", () => {
    const f = getFeatures({}, { hasEE: false });
    expect(f.edition).toBe("selfhost");
    expect(f.multiTenant).toBe(false);
    expect(f.billing).toBe(false);
    expect(f.signup).toBe(false);
    expect(f.requireApproval).toBe(true);
    expect(f.autoPublish).toBe(false);
  });

  it("cloud 但没有 ee 时不开启计费", () => {
    const f = getFeatures({ CC_EDITION: "cloud" }, { hasEE: false });
    expect(f.multiTenant).toBe(true);
    expect(f.billing).toBe(false);
    expect(f.signup).toBe(true);
  });

  it("cloud + ee 才开启计费和市场支付", () => {
    const f = getFeatures({ CC_EDITION: "cloud" }, { hasEE: true });
    expect(f.billing).toBe(true);
    expect(f.marketplacePayments).toBe(true);
  });

  it("非法 edition 报错", () => {
    expect(() => resolveEdition({ CC_EDITION: "enterprise" })).toThrow();
  });

  it("能按需发现并加载 ee/，CC_DISABLE_EE 可关闭", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cc-ee-"));
    mkdirSync(path.join(root, "ee"));
    writeFileSync(
      path.join(root, "ee", "index.mjs"),
      "export default { name: 'test-ee', version: '0.0.0', register() {} };",
    );
    const nested = path.join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    expect(findEEDir({}, nested)).toBe(path.join(root, "ee"));
    expect(findEEDir({ CC_DISABLE_EE: "true" }, nested)).toBeNull();
    const ee = await loadEE({ CC_EE_DIR: path.join(root, "ee") });
    expect(ee?.name).toBe("test-ee");
    expect(await loadEE({ CC_EE_DIR: path.join(root, "nope") })).toBeNull();
  });
});

describe("审核状态机", () => {
  it("in_review 可以通过或退回", () => {
    expect(applyReviewDecision("in_review", "approve")).toBe("approved");
    expect(applyReviewDecision("in_review", "request_changes")).toBe("changes_requested");
  });

  it("草稿不能跳过审核直接通过", () => {
    expect(() => applyReviewDecision("draft", "approve")).toThrow();
  });

  it("默认只有已通过的稿件能导出", () => {
    expect(canExport("in_review", true)).toBe(false);
    expect(canExport("approved", true)).toBe(true);
    expect(canExport("in_review", false)).toBe(true);
  });
});

describe("模型配置解析", () => {
  it("支持 model 自带冒号", () => {
    expect(parseTargetList("openai:gpt-x, ollama:qwen2.5:7b")).toEqual([
      { provider: "openai", model: "gpt-x" },
      { provider: "ollama", model: "qwen2.5:7b" },
    ]);
  });
  it("格式错误时报错", () => {
    expect(() => parseTargetList("just-a-model")).toThrow();
  });
});

describe("密钥加密", () => {
  it("可以往返加解密，错误主密钥会失败", () => {
    const key = "a-very-long-master-key-for-tests";
    const ct = encryptSecret("sk-test-123456", key);
    expect(ct).not.toContain("sk-test");
    expect(decryptSecret(ct, key)).toBe("sk-test-123456");
    expect(() => decryptSecret(ct, "another-wrong-master-key!!")).toThrow();
  });
});

describe("密钥脱敏", () => {
  it("只保留后 4 位", async () => {
    const { maskSecret } = await import("../src");
    expect(maskSecret("sk-abcdefghijklmnop1234")).toBe("****1234");
    expect(maskSecret("abc")).toBe("****");
    expect(maskSecret("sk-abcdefghijklmnop1234")).not.toContain("abcdef");
  });

  it("同一明文每次加密结果不同（随机 IV），篡改密文会解密失败", async () => {
    const { decryptSecret, encryptSecret } = await import("../src");
    const key = "another-master-key-for-tests-123";
    const a = encryptSecret("sk-same-value-0000", key);
    const b = encryptSecret("sk-same-value-0000", key);
    expect(a).not.toBe(b);
    const parts = a.split(":");
    const ct = Buffer.from(parts[3]!, "base64");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(decryptSecret(b, key)).toBe("sk-same-value-0000");
  });
});
