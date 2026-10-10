"use server";

import { MODEL_TIERS, parseTargetList, type TierMapping } from "@creatorcrew/core/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";

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
  back("/", await getStore().triggerRun(botId, inputs));
}

export async function toggleRoutineAction(formData: FormData) {
  const routineId = String(formData.get("routineId") ?? "");
  const enabled = formData.get("enabled") === "true";
  back("/", await getStore().setRoutineEnabled(routineId, enabled));
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
  back(
    "/inspiration",
    await getStore().addInspiration({
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
  const result = await getStore().reviewDraft(id, decision, note);
  const params = new URLSearchParams({ status, [result.ok ? "msg" : "error"]: result.message });
  revalidatePath("/review");
  redirect(`/review?${params.toString()}`);
}

export async function saveTierMappingAction(formData: FormData) {
  const tiers: TierMapping = {};
  try {
    for (const tier of MODEL_TIERS) {
      const list = parseTargetList(String(formData.get(`tier_${tier}`) ?? ""));
      if (list.length) tiers[tier] = list;
    }
  } catch (err) {
    back("/settings", { ok: false, message: (err as Error).message });
  }
  back("/settings", await getStore().saveTierMapping(tiers));
}
