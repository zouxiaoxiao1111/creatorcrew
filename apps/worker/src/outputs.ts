/** 把 Bot 运行结果转换成业务数据（纯函数，便于测试）。 */

export interface DraftFields {
  title: string;
  body: string;
  titleOptions: string[];
  coverPrompt: string | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 长文写作：正文取 draft 步骤，标题和封面取 packaging 步骤（JSON）。 */
export function toDraft(outputs: Record<string, unknown>, fallbackTitle: string): DraftFields {
  const body = typeof outputs.draft === "string" ? outputs.draft : "";
  const packaging = asRecord(outputs.packaging);
  const titleOptions = Array.isArray(packaging.titles)
    ? packaging.titles.map(String).filter(Boolean).slice(0, 5)
    : [];
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    title: titleOptions[0] ?? heading ?? fallbackTitle,
    body,
    titleOptions,
    coverPrompt: typeof packaging.cover_prompt === "string" ? packaging.cover_prompt : null,
  };
}

export interface TopicFields {
  title: string;
  angle: string | null;
  reason: string | null;
  urls: string[];
  score: string | null;
}

export function toTopics(output: unknown): TopicFields[] {
  const list = Array.isArray(output) ? output : asRecord(output).topics;
  if (!Array.isArray(list)) return [];
  return list
    .map(asRecord)
    .filter((t) => typeof t.title === "string" && t.title.trim())
    .map((t) => ({
      title: String(t.title).trim(),
      angle: typeof t.angle === "string" ? t.angle : null,
      reason: typeof t.reason === "string" ? t.reason : null,
      urls: Array.isArray(t.urls) ? t.urls.map(String) : [],
      score: typeof t.score === "number" && Number.isFinite(t.score) ? t.score.toFixed(2) : null,
    }));
}
