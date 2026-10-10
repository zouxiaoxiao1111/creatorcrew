import { assertSecretKey } from "@creatorcrew/core/auth";

/** 只在 Node.js 运行时加载（见 instrumentation.ts）。 */
export function checkStartup() {
  if (!process.env.DATABASE_URL) {
    console.warn("[creatorcrew] 演示模式：没有配置 DATABASE_URL，不需要登录，数据只保存在内存中。");
    return;
  }
  try {
    assertSecretKey(process.env);
  } catch (err) {
    console.error(`[creatorcrew] 拒绝启动：${(err as Error).message}`);
    process.exit(1);
  }
}
