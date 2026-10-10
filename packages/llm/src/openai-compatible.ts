import { LLMError, isRetryableStatus } from "./types";
import type { ChatRequest, LLMProvider, ProviderResponse } from "./types";

export interface OpenAICompatibleOptions {
  id: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** 便于测试注入 */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * OpenAI 兼容的 /chat/completions 实现，可用于 OpenAI、OpenRouter、Ollama（/v1）、
 * 以及各类国内外兼容接口。
 */
export function createOpenAICompatibleProvider(opts: OpenAICompatibleOptions): LLMProvider {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");

  return {
    id: opts.id,
    async chat(model: string, req: ChatRequest): Promise<ProviderResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
      req.signal?.addEventListener("abort", () => controller.abort(), { once: true });

      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
      };
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
      if (req.responseFormat === "json") body.response_format = { type: "json_object" };

      let res: Response;
      try {
        res = await doFetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
            ...opts.headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        throw new LLMError(`[${opts.id}] 网络错误：${(err as Error).message}`, {
          provider: opts.id,
          retryable: true,
          cause: err,
        });
      } finally {
        clearTimeout(timer);
      }

      let json: OpenAIChatResponse = {};
      try {
        json = (await res.json()) as OpenAIChatResponse;
      } catch {
        // 有些网关出错时返回非 JSON
      }

      if (!res.ok) {
        throw new LLMError(
          `[${opts.id}] HTTP ${res.status}：${json.error?.message ?? res.statusText}`,
          { provider: opts.id, status: res.status, retryable: isRetryableStatus(res.status) },
        );
      }

      const text = json.choices?.[0]?.message?.content ?? "";
      return {
        text,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
