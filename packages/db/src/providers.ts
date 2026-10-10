import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, maskSecret } from "@creatorcrew/core/crypto";
import type { ModelTier } from "@creatorcrew/core/domain";
import { and, asc, eq } from "drizzle-orm";
import { llmProviders, secrets } from "./schema";
import type { AnyDb } from "./types";

export type TierModels = Partial<Record<ModelTier, string>>;

/** 返回给前端的 Provider 信息：永远不包含明文 Key，只有脱敏后的后 4 位。 */
export interface ProviderCredentialView {
  id: string;
  name: string;
  baseUrl: string;
  tierModels: TierModels;
  priority: number;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: Date;
}

export interface ProviderCredentialInput {
  id?: string;
  name: string;
  baseUrl: string;
  /** 新 Key；编辑时留空表示保持原 Key 不变 */
  apiKey?: string;
  /** 编辑时显式清除 Key（例如本地 Ollama 不需要 Key） */
  clearKey?: boolean;
  tierModels: TierModels;
  priority?: number;
  enabled?: boolean;
}

/** worker 使用：包含解密后的 Key，只在服务端内存里使用。 */
export interface DecryptedProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  tierModels: TierModels;
  priority: number;
  enabled: boolean;
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function validateProviderInput(input: ProviderCredentialInput): string[] {
  const errors: string[] = [];
  if (!NAME_RE.test(input.name))
    errors.push("名称只能用小写字母、数字、- 和 _（最多 40 个字符），例如 openai、my-gateway");
  try {
    const u = new URL(input.baseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:")
      errors.push("Base URL 需要是 http(s) 地址");
  } catch {
    errors.push("Base URL 格式不正确，例如 https://api.openai.com/v1");
  }
  if (input.apiKey && input.apiKey.length > 500) errors.push("API Key 太长了");
  if (input.apiKey && /\s/.test(input.apiKey.trim())) errors.push("API Key 不能包含空格");
  return errors;
}

const secretName = (providerId: string) => `llm_provider:${providerId}`;

export function createProviderRepo(db: AnyDb, masterKey: string) {
  async function list(workspaceId: string): Promise<ProviderCredentialView[]> {
    const rows = await db
      .select({ p: llmProviders, last4: secrets.last4 })
      .from(llmProviders)
      .leftJoin(secrets, eq(llmProviders.secretId, secrets.id))
      .where(eq(llmProviders.workspaceId, workspaceId))
      .orderBy(asc(llmProviders.priority), asc(llmProviders.name));
    return rows.map(({ p, last4 }) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      tierModels: p.tierModels,
      priority: p.priority,
      enabled: p.enabled,
      hasKey: Boolean(p.secretId),
      maskedKey: last4 ? `****${last4}` : null,
      updatedAt: p.updatedAt,
    }));
  }

  /** 新增或更新。Key 用 AES-256-GCM 加密后写入 secret 表，只保存后 4 位用于展示。 */
  async function save(
    workspaceId: string,
    input: ProviderCredentialInput,
  ): Promise<ProviderCredentialView> {
    const errors = validateProviderInput(input);
    if (errors.length) throw new Error(errors.join("；"));
    const apiKey = input.apiKey?.trim();

    const id = await db.transaction(async (tx) => {
      let existing: typeof llmProviders.$inferSelect | undefined;
      if (input.id) {
        [existing] = await tx
          .select()
          .from(llmProviders)
          .where(and(eq(llmProviders.id, input.id), eq(llmProviders.workspaceId, workspaceId)));
        if (!existing) throw new Error("找不到这个 Provider");
      }
      const providerId = existing?.id ?? randomUUID();
      let secretId = existing?.secretId ?? null;

      if (apiKey) {
        const ciphertext = encryptSecret(apiKey, masterKey);
        const last4 = maskSecret(apiKey).slice(-4);
        if (secretId) {
          await tx.update(secrets).set({ ciphertext, last4 }).where(eq(secrets.id, secretId));
        } else {
          const [s] = await tx
            .insert(secrets)
            .values({ workspaceId, name: secretName(providerId), ciphertext, last4 })
            .returning({ id: secrets.id });
          secretId = s!.id;
        }
      } else if (input.clearKey && secretId) {
        await tx
          .update(llmProviders)
          .set({ secretId: null })
          .where(eq(llmProviders.id, providerId));
        await tx.delete(secrets).where(eq(secrets.id, secretId));
        secretId = null;
      }

      const values = {
        name: input.name,
        baseUrl: input.baseUrl.replace(/\/+$/, ""),
        tierModels: Object.fromEntries(
          Object.entries(input.tierModels)
            .filter(([, m]) => typeof m === "string" && m.trim())
            .map(([t, m]) => [t, m!.trim()]),
        ) as TierModels,
        priority: input.priority ?? existing?.priority ?? 100,
        enabled: input.enabled ?? existing?.enabled ?? true,
        secretId,
      };
      if (existing) {
        await tx.update(llmProviders).set(values).where(eq(llmProviders.id, providerId));
      } else {
        await tx.insert(llmProviders).values({ id: providerId, workspaceId, ...values });
      }
      return providerId;
    });
    const view = (await list(workspaceId)).find((p) => p.id === id);
    if (!view) throw new Error("保存失败");
    return view;
  }

  async function remove(workspaceId: string, id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [p] = await tx
        .delete(llmProviders)
        .where(and(eq(llmProviders.id, id), eq(llmProviders.workspaceId, workspaceId)))
        .returning();
      if (!p) return false;
      if (p.secretId) await tx.delete(secrets).where(eq(secrets.id, p.secretId));
      return true;
    });
  }

  /** 仅供 worker 使用：解密 Key。解密失败（例如换了主密钥）时跳过该 Provider 并报告。 */
  async function loadDecrypted(
    workspaceId: string,
    onError: (name: string, err: Error) => void = () => {},
  ): Promise<DecryptedProvider[]> {
    const rows = await db
      .select({ p: llmProviders, ciphertext: secrets.ciphertext })
      .from(llmProviders)
      .leftJoin(secrets, eq(llmProviders.secretId, secrets.id))
      .where(eq(llmProviders.workspaceId, workspaceId));
    const out: DecryptedProvider[] = [];
    for (const { p, ciphertext } of rows) {
      let apiKey: string | undefined;
      if (ciphertext) {
        try {
          apiKey = decryptSecret(ciphertext, masterKey);
        } catch (err) {
          onError(p.name, err as Error);
          continue;
        }
      }
      out.push({
        name: p.name,
        baseUrl: p.baseUrl,
        apiKey,
        tierModels: p.tierModels,
        priority: p.priority,
        enabled: p.enabled,
      });
    }
    return out;
  }

  return { list, save, remove, loadDecrypted };
}
