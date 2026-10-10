import { z } from "zod";

/**
 * 统一的环境变量 schema。
 * 所有 app 都应该通过 `parseEnv()` 读取配置，而不是到处直接读 process.env。
 */
const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CC_EDITION: z.enum(["selfhost", "cloud"]).default("selfhost"),
  CC_BASE_URL: z.string().url().default("http://localhost:3000"),
  CC_SECRET_KEY: z.string().optional(),
  CC_ALLOW_SIGNUP: boolish,
  CC_REQUIRE_APPROVAL: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  CC_DISABLE_EE: boolish,
  CC_EE_DIR: z.string().optional(),
  CC_TEMPLATES_DIR: z.string().optional(),
  CC_MIGRATIONS_DIR: z.string().optional(),
  CC_TIMEZONE: z.string().default("Asia/Shanghai"),
  CC_DB_POOL_MAX: z.coerce.number().int().positive().optional(),
  CC_PORT: z.string().optional(),
  PG_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./data/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),

  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),

  /** 档位 → 模型链，格式："provider:model,provider:model"（逗号分隔即 fallback 顺序） */
  CC_TIER_CHEAP: z.string().optional(),
  CC_TIER_MID: z.string().optional(),
  CC_TIER_STRONG: z.string().optional(),
  CC_TIER_LOCAL: z.string().optional(),

  X_API_BEARER: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  // 空字符串视为未设置（.env 里经常有 `KEY=` 这样的空行）
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`环境变量配置有误：\n${details}`);
  }
  return result.data;
}
