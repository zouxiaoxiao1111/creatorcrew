import { z } from "zod";
import { MODEL_TIERS } from "@creatorcrew/core/domain";

/**
 * bot.yaml 模板格式 v1（apiVersion: creatorcrew/v1, kind: Bot）。
 * Bot = 人设 + 指令 + 工具 + 模型策略 + 输入/输出 schema + 步骤。
 */
export const TierSchema = z.enum(MODEL_TIERS);

export const InputSpecSchema = z.object({
  type: z.enum(["string", "string[]", "text", "markdown", "number", "boolean", "url"]),
  label: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

const stepId = z.string().regex(/^[a-z][a-z0-9_]*$/, "步骤 id 只能用小写字母、数字和下划线");

export const LlmStepSchema = z.object({
  id: stepId,
  type: z.literal("llm"),
  title: z.string().optional(),
  /** 不写则使用 spec.model.tier */
  tier: TierSchema.optional(),
  prompt: z.string().min(1),
  output: z.enum(["text", "json"]).default("text"),
  temperature: z.number().min(0).max(2).optional(),
});

export const ToolStepSchema = z.object({
  id: stepId,
  type: z.literal("tool"),
  title: z.string().optional(),
  tool: z.string(),
  with: z.record(z.string(), z.unknown()).default({}),
  /** 工具不可用（例如没有 X API Token）时跳过而不是失败 */
  optional: z.boolean().default(false),
});

export const HumanReviewStepSchema = z.object({
  id: stepId,
  type: z.literal("human_review"),
  title: z.string().optional(),
  instructions: z.string().optional(),
});

export const StepSchema = z.discriminatedUnion("type", [
  LlmStepSchema,
  ToolStepSchema,
  HumanReviewStepSchema,
]);

export const OUTPUT_KINDS = ["topic_list", "inspiration_batch", "draft", "text"] as const;

export const BotTemplateSchema = z
  .object({
    apiVersion: z.literal("creatorcrew/v1"),
    kind: z.literal("Bot"),
    metadata: z.object({
      name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "name 只能用小写字母、数字和短横线"),
      displayName: z.string().min(1),
      version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, "version 需要是语义化版本号"),
      author: z.string().default("community"),
      description: z.string().optional(),
      tags: z.array(z.string()).default([]),
      license: z.string().optional(),
    }),
    spec: z.object({
      persona: z.string().min(1),
      instructions: z.string().optional(),
      model: z.object({
        tier: TierSchema,
        fallback: z.array(TierSchema).default([]),
      }),
      tools: z.array(z.string()).default([]),
      inputs: z.record(z.string(), InputSpecSchema).default({}),
      steps: z.array(StepSchema).min(1),
      output: z.object({
        kind: z.enum(OUTPUT_KINDS),
        schema: z.record(z.string(), z.unknown()).optional(),
      }),
      routine: z
        .object({
          cron: z.string(),
          timezone: z.string().optional(),
          budget_usd: z.number().nonnegative().optional(),
        })
        .optional(),
      review: z.object({ required: z.boolean().default(false) }).default({ required: false }),
    }),
  })
  .superRefine((tpl, ctx) => {
    const ids = new Set<string>();
    tpl.spec.steps.forEach((s, i) => {
      if (ids.has(s.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "steps", i, "id"],
          message: `步骤 id「${s.id}」重复`,
        });
      }
      ids.add(s.id);
      if (s.type === "tool" && !tpl.spec.tools.includes(s.tool)) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "steps", i, "tool"],
          message: `工具「${s.tool}」没有在 spec.tools 中声明`,
        });
      }
    });
    const hasReview = tpl.spec.steps.some((s) => s.type === "human_review");
    // 默认规则：会产出对外内容（草稿）的模板必须包含人工审核步骤
    if ((tpl.spec.output.kind === "draft" || tpl.spec.review.required) && !hasReview) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "steps"],
        message: "产出草稿的模板必须包含 human_review（人工审核）步骤",
      });
    }
  });

export type BotTemplate = z.infer<typeof BotTemplateSchema>;
export type BotStep = z.infer<typeof StepSchema>;
export type InputSpec = z.infer<typeof InputSpecSchema>;
