import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Edition 开关：同一套代码，用 CC_EDITION 区分自部署（selfhost）和在线版（cloud）。
 * UI 和 API 都只读 `getFeatures()`，不要直接判断 edition。
 */
export type Edition = "selfhost" | "cloud";

type EnvLike = Record<string, string | undefined>;

export function resolveEdition(env: EnvLike = process.env): Edition {
  const raw = (env.CC_EDITION ?? "selfhost").trim().toLowerCase();
  if (raw === "selfhost" || raw === "cloud") return raw;
  throw new Error(`CC_EDITION 只能是 selfhost 或 cloud，收到 "${env.CC_EDITION}"`);
}

const EE_ENTRY = "index.mjs";

/**
 * 查找 ee/ 目录：优先 CC_EE_DIR，否则从当前工作目录逐级向上查找 `ee/index.mjs`。
 * 设置 CC_DISABLE_EE=true 时始终视为不存在。
 */
export function findEEDir(env: EnvLike = process.env, cwd: string = process.cwd()): string | null {
  if (env.CC_DISABLE_EE === "true" || env.CC_DISABLE_EE === "1") return null;
  if (env.CC_EE_DIR) {
    return existsSync(path.join(env.CC_EE_DIR, EE_ENTRY)) ? path.resolve(env.CC_EE_DIR) : null;
  }
  let dir = path.resolve(/* turbopackIgnore: true */ cwd);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(/* turbopackIgnore: true */ dir, "ee");
    if (existsSync(path.join(candidate, EE_ENTRY))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function hasEE(env: EnvLike = process.env): boolean {
  return findEEDir(env) !== null;
}

export interface Features {
  edition: Edition;
  eeLoaded: boolean;
  multiTenant: boolean;
  billing: boolean;
  marketplacePayments: boolean;
  signup: boolean;
  /** v0.1 只做导入导出；市场页属于在线版 + ee */
  templateMarketplace: boolean;
  /** 导出 / 发布前必须经过人工审核（默认开启） */
  requireApproval: boolean;
  /** v0.1 不做自动发帖，永远为 false */
  autoPublish: false;
  xConnector: boolean;
}

export function getFeatures(env: EnvLike = process.env, opts: { hasEE?: boolean } = {}): Features {
  const edition = resolveEdition(env);
  const ee = opts.hasEE ?? hasEE(env);
  const cloud = edition === "cloud";
  return {
    edition,
    eeLoaded: ee,
    multiTenant: cloud,
    billing: cloud && ee,
    marketplacePayments: cloud && ee,
    signup: env.CC_ALLOW_SIGNUP === "true" || cloud,
    templateMarketplace: cloud && ee,
    requireApproval: env.CC_REQUIRE_APPROVAL !== "false",
    autoPublish: false,
    xConnector: Boolean(env.X_API_BEARER),
  };
}

/** ee/ 模块对外暴露的约定接口（见 ee/README.md）。 */
export interface EEModule {
  name: string;
  version: string;
  register(ctx: { features: Features; log: (msg: string) => void }): void | Promise<void>;
}

/**
 * 运行时按需加载 ee/。使用不可静态分析的动态 import，
 * 因此 ee/ 不存在时构建不会失败，运行时也只是返回 null。
 */
export async function loadEE(env: EnvLike = process.env): Promise<EEModule | null> {
  const dir = findEEDir(env);
  if (!dir) return null;
  const url = pathToFileURL(path.join(dir, EE_ENTRY)).href;
  const mod = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url
  )) as {
    default?: EEModule;
  } & Partial<EEModule>;
  const ee = mod.default ?? (mod as EEModule);
  if (typeof ee.register !== "function") {
    throw new Error(`ee/${EE_ENTRY} 必须导出 register() 函数`);
  }
  return ee;
}
