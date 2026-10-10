import "server-only";
import { QUEUES, type BotRunJob } from "@creatorcrew/core";
import PgBoss from "pg-boss";

/**
 * Web 端只负责把任务放进队列（不处理任务、不跑定时调度），执行由 apps/worker 负责。
 */
const g = globalThis as unknown as { __ccBoss?: Promise<PgBoss> };

function getBoss(url: string): Promise<PgBoss> {
  g.__ccBoss ??= (async () => {
    const boss = new PgBoss({ connectionString: url, supervise: false, schedule: false, max: 2 });
    boss.on("error", (err) => console.error("[pg-boss]", err));
    await boss.start();
    await boss.createQueue(QUEUES.botRun);
    return boss;
  })();
  return g.__ccBoss;
}

export async function enqueueBotRun(url: string, job: BotRunJob): Promise<string | null> {
  const boss = await getBoss(url);
  return boss.send(QUEUES.botRun, job, { retryLimit: 1, expireInSeconds: 15 * 60 });
}
