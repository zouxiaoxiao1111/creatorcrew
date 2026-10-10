import type { Tool } from "@creatorcrew/core/domain";
import type { ChatResult, RoutedChatRequest } from "@creatorcrew/llm";
import { renderPrompt } from "./render";
import { resolveInputs } from "./loader";
import type { BotStep, BotTemplate } from "./schema";

/** runtime 只依赖 router 的 chat 方法，方便测试替换。 */
export interface ChatRouter {
  chat(req: RoutedChatRequest): Promise<ChatResult>;
}

export interface StepRecord {
  id: string;
  type: BotStep["type"];
  status: "succeeded" | "skipped" | "failed" | "awaiting_review";
  prompt?: string;
  output?: unknown;
  error?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  startedAt: Date;
  finishedAt: Date;
}

export interface RunBotOptions {
  inputs?: Record<string, unknown>;
  router: ChatRouter;
  tools?: Record<string, Tool>;
  workspaceId: string;
  budget?: RoutedChatRequest["budget"];
  signal?: AbortSignal;
  onStep?: (step: StepRecord) => void | Promise<void>;
}

export interface RunBotResult {
  status: "succeeded" | "awaiting_review" | "failed";
  steps: StepRecord[];
  /** 最后一个有输出的步骤的输出 */
  output: unknown;
  /** 每个步骤的输出，key 为步骤 id */
  outputs: Record<string, unknown>;
  error?: string;
}

function tryParseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return text;
  }
}

/**
 * v0.1 的 Bot 运行时：按顺序执行模板里的步骤。
 * - llm：按档位路由调用模型
 * - tool：调用连接器（不可用且 optional 时跳过）
 * - human_review：停下来，等人工审核（产出进入「草稿审核」）
 * TODO(v0.2)：总管 Bot 的多级调度、并行步骤、批注后按段重写。
 */
export async function runBot(template: BotTemplate, opts: RunBotOptions): Promise<RunBotResult> {
  const inputs = resolveInputs(template, opts.inputs);
  const stepOutputs: Record<string, { output: unknown }> = {};
  const records: StepRecord[] = [];
  let lastOutput: unknown;

  const system = [template.spec.persona, template.spec.instructions].filter(Boolean).join("\n\n");

  const record = async (r: StepRecord) => {
    records.push(r);
    await opts.onStep?.(r);
  };

  const outputs = () =>
    Object.fromEntries(Object.entries(stepOutputs).map(([k, v]) => [k, v.output]));

  for (const step of template.spec.steps) {
    const startedAt = new Date();
    const scope = { inputs, steps: stepOutputs, bot: template.metadata };
    try {
      if (step.type === "human_review") {
        await record({
          id: step.id,
          type: step.type,
          status: "awaiting_review",
          output: lastOutput,
          startedAt,
          finishedAt: new Date(),
        });
        return {
          status: "awaiting_review",
          steps: records,
          output: lastOutput,
          outputs: outputs(),
        };
      }

      if (step.type === "tool") {
        const tool = opts.tools?.[step.tool];
        const unavailable = !tool ? `工具「${step.tool}」未注册` : tool.unavailableReason;
        if (unavailable) {
          if (step.optional) {
            stepOutputs[step.id] = { output: [] };
            await record({
              id: step.id,
              type: step.type,
              status: "skipped",
              error: unavailable,
              startedAt,
              finishedAt: new Date(),
            });
            continue;
          }
          throw new Error(unavailable);
        }
        const args = Object.fromEntries(
          Object.entries(step.with).map(([k, v]) => [
            k,
            typeof v === "string" && /^\{\{\s*[\w.]+\s*\}\}$/.test(v)
              ? resolveExpr(v, scope)
              : typeof v === "string"
                ? renderPrompt(v, scope)
                : v,
          ]),
        );
        const output = await tool!.run(args, {
          workspaceId: opts.workspaceId,
          signal: opts.signal,
        });
        stepOutputs[step.id] = { output };
        lastOutput = output;
        await record({
          id: step.id,
          type: step.type,
          status: "succeeded",
          output,
          startedAt,
          finishedAt: new Date(),
        });
        continue;
      }

      const prompt = renderPrompt(step.prompt, scope);
      const res = await opts.router.chat({
        tier: step.tier ?? template.spec.model.tier,
        fallback: template.spec.model.fallback,
        budget: opts.budget,
        signal: opts.signal,
        temperature: step.temperature,
        responseFormat: step.output,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      const output = step.output === "json" ? tryParseJson(res.text) : res.text;
      stepOutputs[step.id] = { output };
      lastOutput = output;
      await record({
        id: step.id,
        type: step.type,
        status: "succeeded",
        prompt,
        output,
        provider: res.provider,
        model: res.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        startedAt,
        finishedAt: new Date(),
      });
    } catch (err) {
      const message = (err as Error).message;
      await record({
        id: step.id,
        type: step.type,
        status: "failed",
        error: message,
        startedAt,
        finishedAt: new Date(),
      });
      return {
        status: "failed",
        steps: records,
        output: lastOutput,
        outputs: outputs(),
        error: message,
      };
    }
  }
  return { status: "succeeded", steps: records, output: lastOutput, outputs: outputs() };
}

/** 整个值就是一个 {{expr}} 时保留原始类型（例如数组）。 */
function resolveExpr(v: string, scope: Record<string, unknown>): unknown {
  const expr = v.replace(/^\{\{\s*|\s*\}\}$/g, "");
  return expr.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, scope);
}
