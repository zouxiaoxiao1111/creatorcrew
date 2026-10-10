import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("请先设置 DATABASE_URL");
  process.exit(1);
}
await runMigrations(url);
