import "server-only";
import { createDbStore } from "./db";
import { memoryStore } from "./memory";
import type { Store } from "./types";

export type * from "./types";

let store: Store | undefined;

export function getStore(): Store {
  if (!store) {
    const url = process.env.DATABASE_URL;
    store = url ? createDbStore(url) : memoryStore;
  }
  return store;
}
