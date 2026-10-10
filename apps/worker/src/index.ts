import { loadOfficialTemplates } from "@creatorcrew/agents";
import { parseEnv } from "@creatorcrew/config";
import { QUEUES, getFeatures, loadEE, type BotRunJob } from "@creatorcrew/core";
import { closeDb, ensureDefaultWorkspace, getDb, runMigrations } from "@creatorcrew/db";
import PgBoss from "pg-boss";
import { enqueueRoutineRun, handleBotRun, syncRoutines } from "./jobs";
import { log } from "./log";

async function main() {
  const env = parseEnv(process.env);
  const features = getFeatures(process.env);
  log.info({ edition: features.edition, ee: features.eeLoaded }, "CreatorCrew worker 启动");

  if (!env.DATABASE_URL) {
    log.error("缺少 DATABASE_URL，worker 无法启动");
    process.exit(1);
  }
  if (!env.CC_SECRET_KEY && env.NODE_ENV === "production") {
    log.warn("没有设置 CC_SECRET_KEY，密钥加密存储功能不可用");
  }

  // 在线版的商业功能（计费等）在 ee/ 中，按需加载；不存在时直接跳过
  const ee = await loadEE(process.env);
  if (ee) {
    await ee.register({ features, log: (m) => log.info(m) });
    log.info({ name: ee.name, version: ee.version }, "已加载 ee 模块");
  }

  await runMigrations(env.DATABASE_URL, (m) => log.info(m));
  const db = getDb(env.DATABASE_URL);

  const templates = loadOfficialTemplates();
  await ensureDefaultWorkspace(
    db,
    templates.map(({ template, raw }) => ({
      slug: template.metadata.name,
      name: template.metadata.displayName,
      version: template.metadata.version,
      description: template.metadata.description,
      spec: template,
      raw,
      routine: template.spec.routine && {
        cron: template.spec.routine.cron,
        timezone: template.spec.routine.timezone,
        budgetUsd: template.spec.routine.budget_usd,
      },
    })),
  );
  log.info({ count: templates.length }, "官方模板已同步");

  const boss = new PgBoss({ connectionString: env.DATABASE_URL });
  boss.on("error", (err) => log.error({ err }, "pg-boss 出错"));
  await boss.start();
  await boss.createQueue(QUEUES.botRun);

  await boss.work<BotRunJob>(QUEUES.botRun, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    log.info({ jobId: job.id, ...job.data }, "开始执行 Bot");
    await handleBotRun(db, job.data, process.env);
  });

  const registered = new Set<string>();
  const sync = () =>
    syncRoutines(db, boss, (id) => enqueueRoutineRun(db, boss, id), registered).catch((err) =>
      log.error({ err }, "同步定时任务失败"),
    );
  await sync();
  const timer = setInterval(sync, 60_000);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "正在退出…");
    clearInterval(timer);
    await boss.stop({ graceful: true, timeout: 20_000 });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error({ err }, "worker 启动失败");
  process.exit(1);
});
