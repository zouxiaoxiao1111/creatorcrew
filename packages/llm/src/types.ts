import type { ModelTier } from "@creatorcrew/core/domain";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResponse {
  text: string;
  usage: TokenUsage;
}

/** 所有 Provider 都实现这个最小接口（OpenAI 兼容 / OpenRouter / Ollama / 以后的 Anthropic、Gemini）。 */
export interface LLMProvider {
  id: string;
  chat(model: string, req: ChatRequest): Promise<ProviderResponse>;
}

export interface ChatResult extends ProviderResponse {
  provider: string;
  model: string;
  tier: ModelTier;
  latencyMs: number;
  /** 这次调用之前失败过的尝试（用于运行日志） */
  attempts: AttemptRecord[];
}

export interface AttemptRecord {
  provider: string;
  model: string;
  tier: ModelTier;
  ok: boolean;
  error?: string;
}

export interface UsageRecord {
  provider: string;
  model: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  /** 根据单价表估算；没有配置单价时为 null */
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export class LLMError extends Error {
  readonly provider: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { provider: string; status?: number; retryable: boolean; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "LLMError";
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

/** 429 / 5xx / 408 / 网络错误 → 可以切到下一个；其他 4xx（参数错误、鉴权失败）也切，但会记录。 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
