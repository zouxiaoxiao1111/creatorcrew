/**
 * 校验官方模板（packages/agents/templates）和社区模板（templates/）。
 * CI 会跑这个脚本：schema 校验 + 检查有没有带密钥。
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateError, loadTemplatesFromDir } from "../src";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function dirsWithTemplates(root: string): string[] {
  const out = [root];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) out.push(...dirsWithTemplates(full));
  }
  return out;
}

const roots = [path.join(here, "../templates"), path.join(repoRoot, "templates")];
let count = 0;
let failed = 0;
for (const root of roots) {
  for (const dir of dirsWithTemplates(root)) {
    try {
      const loaded = loadTemplatesFromDir(dir);
      for (const t of loaded) {
        count++;
        console.log(`✔ ${path.relative(repoRoot, t.source)}  (${t.template.metadata.displayName})`);
      }
    } catch (err) {
      failed++;
      console.error(err instanceof TemplateError ? err.message : err);
    }
  }
}
console.log(`\n共校验 ${count} 个模板，失败 ${failed} 个目录`);
process.exit(failed ? 1 : 0);
