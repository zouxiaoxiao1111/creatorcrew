"use server";

import {
  MODEL_TIERS,
  parseTargetList,
  type ModelTier,
  type TierMapping,
} from "@creatorcrew/core/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@creatorcrew/core/auth";
import { cookies } from "next/headers";
import { getAuthService } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db-context";
import { authedStore } from "@/lib/store";

function back(path: string, result: { ok: boolean; message: string }): never {
  const params = new URLSearchParams({ [result.ok ? "msg" : "error"]: result.message });
  revalidatePath(path);
  redirect(`${path}?${params.toString()}`);
}

export async function runBotAction(formData: FormData) {
  const botId = String(formData.get("botId") ?? "");
  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("input_") && typeof value === "string" && value.trim()) {
      inputs[key.slice("input_".length)] = value.trim();
    }
  }
  back("/", await (await authedStore()).triggerRun(botId, inputs));
}

export async function toggleRoutineAction(formData: FormData) {
  const routineId = String(formData.get("routineId") ?? "");
  const enabled = formData.get("enabled") === "true";
  back("/", await (await authedStore()).setRoutineEnabled(routineId, enabled));
}

export async function addInspirationAction(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!url && !content) back("/inspiration", { ok: false, message: "链接和内容至少填一个" });
  if (url && !/^https?:\/\//i.test(url))
    back("/inspiration", { ok: false, message: "链接需要以 http:// 或 https:// 开头" });
  const store = await authedStore("/inspiration");
  back(
    "/inspiration",
    await store.addInspiration({
      url: url || undefined,
      title: title || undefined,
      content: content || url,
      tags,
    }),
  );
}

export async function reviewDraftAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "approve" ? "approve" : "request_changes";
  const note = String(formData.get("note") ?? "").trim();
  const status = String(formData.get("returnStatus") ?? "in_review");
  const result = await (await authedStore("/review")).reviewDraft(id, decision, note);
  const params = new URLSearchParams({ status, [result.ok ? "msg" : "error"]: result.message });
  revalidatePath("/review");
  redirect(`/review?${params.toString()}`);
}

export async function saveTierMappingAction(formData: FormData) {
  const store = await authedStore("/settings");
  const tiers: TierMapping = {};
  try {
    for (const tier of MODEL_TIERS) {
      const list = parseTargetList(String(formData.get(`tier_${tier}`) ?? ""));
      if (list.length) tiers[tier] = list;
    }
  } catch (err) {
    back("/settings", { ok: false, message: (err as Error).message });
  }
  back("/settings", await store.saveTierMapping(tiers));
}

export async function saveProviderAction(formData: FormData) {
  const store = await authedStore("/settings");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const tierModels: Partial<Record<ModelTier, string>> = {};
  for (const tier of MODEL_TIERS) {
    const model = str(`model_${tier}`);
    if (model) tierModels[tier] = model;
  }
  const priority = Number(str("priority") || "100");
  // 注意：API Key 只在这里出现一次，加密后存库，之后不会再返回给浏览器
  const result = await store.saveProviderCredential({
    id: str("id") || undefined,
    name: str("name").toLowerCase(),
    baseUrl: str("baseUrl"),
    apiKey: str("apiKey") || undefined,
    clearKey: formData.get("clearKey") === "on",
    tierModels,
    priority: Number.isFinite(priority) ? Math.max(0, Math.min(10_000, Math.round(priority))) : 100,
    enabled: formData.get("enabled") === "on",
  });
  back("/settings", result);
}

export async function deleteProviderAction(formData: FormData) {
  const store = await authedStore("/settings");
  back("/settings", await store.deleteProviderCredential(String(formData.get("id") ?? "")));
}

export async function logoutAction() {
  if (!isDemoMode()) {
    const jar = await cookies();
    await (await getAuthService()).logout(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
  }
  redirect(isDemoMode() ? "/" : "/login");
}
