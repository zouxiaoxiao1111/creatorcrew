/**
 * 极简的内存登录限流：同一个 IP + 邮箱 15 分钟内最多失败 8 次。
 * 单实例自部署够用；多实例部署时 TODO：改成存在 Postgres 里。
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

const g = globalThis as unknown as { __ccLoginFailures?: Map<string, number[]> };
const failures = (g.__ccLoginFailures ??= new Map<string, number[]>());

export function isRateLimited(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()) {
  failures.set(key, [...(failures.get(key) ?? []), now]);
}

export function clearFailures(key: string) {
  failures.delete(key);
}
