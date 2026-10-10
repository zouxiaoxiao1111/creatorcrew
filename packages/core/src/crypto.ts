import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * API Key 等密钥的加密存储（AES-256-GCM）。
 * 主密钥来自 CC_SECRET_KEY。
 * TODO(v0.1/W2)：改成真正的信封加密（每条密钥一个 DEK，DEK 由主密钥 / KMS 加密）。
 */
const VERSION = "v1";

function deriveKey(masterKey: string): Buffer {
  if (!masterKey || masterKey.length < 16) {
    throw new Error("CC_SECRET_KEY 至少需要 16 个字符");
  }
  return createHash("sha256").update(masterKey, "utf8").digest();
}

export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(payload: string, masterKey: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error("无法识别的密文格式");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(masterKey),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** 前端只显示后 4 位 */
export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return `****${secret.slice(-4)}`;
}
