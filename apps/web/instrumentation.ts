/**
 * 服务启动时检查：非演示模式（配置了 DATABASE_URL）必须设置 CC_SECRET_KEY，否则拒绝启动。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkStartup } = await import("./instrumentation-node");
    checkStartup();
  }
}
