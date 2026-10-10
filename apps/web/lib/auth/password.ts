import "server-only";
import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "@creatorcrew/db";

/** argon2id（OWASP 推荐参数：19 MiB 内存、2 次迭代）。 */
export const argon2Hasher: PasswordHasher = {
  hash: (password) => hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
  verify: async (hashed, password) => {
    try {
      return await verify(hashed, password);
    } catch {
      return false;
    }
  },
};
