import "server-only";
import { requireUser } from "../auth/session";
import { isDemoMode } from "../db-context";
import { createDbStore } from "./db";
import { memoryStore } from "./memory";
import type { Store } from "./types";

export type * from "./types";

let store: Store | undefined;

function getStore(): Store {
  store ??= isDemoMode() ? memoryStore : createDbStore();
  return store;
}

/**
 * 所有页面和 Server Action 都通过这里拿数据：先校验登录（演示模式除外），再返回数据访问层。
 * 这样即使 proxy 被绕过，也拿不到任何数据。
 */
export async function authedStore(pathname = "/"): Promise<Store> {
  await requireUser(pathname);
  return getStore();
}

/** 只给已经自己校验过登录的地方用（例如 API Route 先返回 401）。 */
export function unsafeStore(): Store {
  return getStore();
}
