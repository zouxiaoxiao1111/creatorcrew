import { runMigrations } from "@creatorcrew/db";
import { log } from "./log";

const url = process.env.DATABASE_URL;
if (!url) {
  log.error("请先设置 DATABASE_URL");
  process.exit(1);
}
await runMigrations(url, (m) => log.info(m));
