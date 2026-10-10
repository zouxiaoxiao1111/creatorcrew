# Bot 模板格式（creatorcrew/v1）

模板是一个 YAML（或 JSON）文件，schema 定义在 [`packages/agents/src/schema.ts`](../packages/agents/src/schema.ts)。

```yaml
apiVersion: creatorcrew/v1
kind: Bot
metadata:
  name: topic-radar            # 小写字母、数字、短横线
  displayName: 选题雷达
  version: 0.1.0               # 语义化版本号
  author: official
  tags: [选题]
spec:
  persona: 你是一名 AI 领域的选题编辑……
  instructions: 只输出结构化结果……   # 可选，会和 persona 一起作为 system prompt
  model:
    tier: cheap                # cheap | mid | strong | local（只写档位，不写模型名）
    fallback: [mid]            # 主档位全部失败后依次尝试
  tools: [rss.fetch, x.search] # 步骤里用到的工具必须在这里声明
  inputs:
    keywords: { type: "string[]", label: 关键词, default: ["Agent"] }
    topic:    { type: string, label: 选题, required: true }
  steps:
    - id: rss                  # 步骤 id：小写字母、数字、下划线
      type: tool
      tool: rss.fetch
      optional: true           # 工具不可用时跳过
      with: { feeds: "{{ inputs.rss_feeds }}" }
    - id: topics
      type: llm
      tier: mid                # 可覆盖 spec.model.tier
      output: json             # text | json
      prompt: |
        素材：{{ steps.rss.output }}
    - id: review
      type: human_review       # 产出草稿的模板必须有这一步
  output:
    kind: topic_list           # topic_list | inspiration_batch | draft | text
  routine: { cron: "0 8 * * *", timezone: Asia/Shanghai, budget_usd: 0.5 }
  review: { required: false }
```

## 变量

- `{{ inputs.xxx }}`：输入值（数组会用「、」连接）；
- `{{ steps.<id>.output }}`：前面步骤的输出（对象会序列化为 JSON）；
- 在工具参数里，如果整个值就是一个 `{{ ... }}`，会保留原始类型（例如数组）。

## 内置工具（v0.1）

| 工具 | 说明 |
|---|---|
| `rss.fetch` | 抓取 RSS / Atom |
| `x.search` | X 官方 API 最近搜索（需要 `X_API_BEARER`，否则不可用） |
| `web.fetch` | 抓取用户提供的链接正文 |
| `inspiration.search` | 检索灵感库（v0.1 为关键词检索） |
| `inspiration.pending` / `inspiration.update` | 读取待整理灵感 / 写回摘要、标签、时效 |

## 校验规则

- schema 校验（字段类型、档位、名称格式、语义化版本号）；
- 步骤 id 不能重复，工具必须在 `spec.tools` 中声明；
- `output.kind: draft` 或 `review.required: true` 时必须包含 `human_review` 步骤；
- 模板中不能包含疑似密钥（`sk-...`、GitHub / Slack Token、`api_key: ...` 等）。

运行 `pnpm validate-templates` 校验全部模板。
