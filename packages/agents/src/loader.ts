import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { BotTemplateSchema, type BotTemplate } from "./schema";

export class TemplateError extends Error {
  readonly source: string;
  readonly issues: string[];
  constructor(source: string, issues: string[]) {
    super(`模板「${source}」校验失败：\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "TemplateError";
    this.source = source;
    this.issues = issues;
  }
}

export interface LoadedTemplate {
  template: BotTemplate;
  source: string;
  raw: string;
}

/** 模板里不允许出现密钥（导出时也会剥离）。这里做一个保守的检测。 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, "疑似 OpenAI 风格的 API Key（sk-...）"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "疑似 Slack Token"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "疑似 GitHub Token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "疑似 AWS Access Key"],
  [/^\s*(api[_-]?key|secret|password|token|bearer)\s*:\s*["']?[^\s"'{}]{8,}/im, "疑似明文密钥字段"],
];

export function findSecrets(raw: string): string[] {
  return SECRET_PATTERNS.filter(([re]) => re.test(raw)).map(([, label]) => label);
}

/** 解析 YAML 或 JSON 字符串为模板，并做 schema 校验。 */
export function parseTemplate(raw: string, source = "<inline>"): LoadedTemplate {
  const secrets = findSecrets(raw);
  if (secrets.length) {
    throw new TemplateError(
      source,
      secrets.map((s) => `模板中不能包含密钥：${s}`),
    );
  }
  let data: unknown;
  try {
    data = source.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  } catch (err) {
    throw new TemplateError(source, [`无法解析：${(err as Error).message}`]);
  }
  const result = BotTemplateSchema.safeParse(data);
  if (!result.success) {
    throw new TemplateError(
      source,
      result.error.issues.map((i) => `${i.path.join(".") || "(根)"}：${i.message}`),
    );
  }
  return { template: result.data, source, raw };
}

export function loadTemplateFile(file: string): LoadedTemplate {
  return parseTemplate(readFileSync(file, "utf8"), file);
}

const TEMPLATE_EXT = /\.(ya?ml|json)$/i;

/** 读取目录下（一层）所有 *.yaml / *.yml / *.json 模板，按文件名排序。 */
export function loadTemplatesFromDir(dir: string): LoadedTemplate[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => TEMPLATE_EXT.test(f))
    .sort()
    .map((f) => loadTemplateFile(path.join(dir, f)));
}

/**
 * 官方模板目录：优先 CC_TEMPLATES_DIR；否则从当前目录逐级向上查找 packages/agents/templates。
 * （Next.js / 打包后的 worker 里 import.meta.url 不可靠，所以用这种方式定位。）
 */
export function officialTemplatesDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  if (env.CC_TEMPLATES_DIR) return path.resolve(env.CC_TEMPLATES_DIR);
  let dir = path.resolve(/* turbopackIgnore: true */ cwd);
  for (let i = 0; i < 8; i++) {
    for (const rel of ["packages/agents/templates", "templates/official"]) {
      const candidate = path.join(/* turbopackIgnore: true */ dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    if (
      path.basename(dir) === "agents" &&
      existsSync(path.join(/* turbopackIgnore: true */ dir, "templates"))
    ) {
      return path.join(/* turbopackIgnore: true */ dir, "templates");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到官方模板目录，请设置 CC_TEMPLATES_DIR");
}

export function loadOfficialTemplates(): LoadedTemplate[] {
  return loadTemplatesFromDir(officialTemplatesDir());
}

/** 计算模板的有效输入：用户提供的值 > 模板默认值；缺少必填项时报错。 */
export function resolveInputs(
  template: BotTemplate,
  provided: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [key, spec] of Object.entries(template.spec.inputs)) {
    const value = provided[key] ?? spec.default;
    if (value === undefined || value === null || value === "") {
      if (spec.required) missing.push(spec.label ?? key);
      continue;
    }
    out[key] = value;
  }
  if (missing.length) throw new Error(`缺少必填输入：${missing.join("、")}`);
  return out;
}
