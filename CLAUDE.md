# CreatorCrew — 接手说明（给 Claude / 其他编码 Agent）

CreatorCrew（暂定名）是给 AI 自媒体创作者用的开源「虚拟编辑部」：总管 Bot 分派专职 Bot（选题雷达、灵感库、长文写作等），所有产出默认经过人工审核。同一套代码支持自部署（单用户）和在线版（多租户）。

## 背景资料
- 产品与技术方案：`docs/planning/product-plan.md`
- X 上 AI 自媒体人群调研：`docs/planning/ai-creators-x-research.md`
- 架构：`docs/architecture.md`；模板格式：`docs/templates.md`

## 技术栈与结构
- pnpm + Turborepo monorepo，TypeScript strict，Node 22（必需），TypeScript 固定 6.0.x（lint 工具暂不支持 7.0）。
- `apps/web`：Next.js 16 App Router（工作台、灵感库、草稿审核、设置、用量、登录/初始化）。
- `apps/worker`：pg-boss 任务与定时执行。
- `packages/`：core（版本开关、特性开关、ee 加载、审核状态机、AES-GCM 加密）、agents（bot.yaml schema、加载器、运行时、官方模板）、llm（OpenAI 兼容 provider、档位路由 cheap/mid/strong/local、回退链、预算、计价）、connectors（rss、x.search、web.fetch）、db（Drizzle、pgvector 迁移、种子）、ui、config。
- `ee/`：在线版付费功能，存在时才加载；CI 会删掉 `ee/` 再构建，保证开源核心独立可用。
- 只依赖 Postgres（16+，带 pgvector），不需要 Redis。

## 常用命令
- `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm validate-templates`
- 自部署：复制 `.env.example` 为 `.env`，设置 `CC_SECRET_KEY`，然后 `docker compose up`。
- 不设 `DATABASE_URL` 时 web 以演示模式运行（内存示例数据，无需登录）。

## 已确定的决定
- 版本开关：`CC_EDITION=selfhost|cloud`。
- 协议：核心 AGPL-3.0；`ee/` 商业授权（目前是占位文本，需律师定稿）；社区模板 MIT。
- 模板里的 `budget_usd` = 每个 Bot 每天的上限（按 `CC_TIMEZONE` 计日）。
- 登录：自部署单管理员，argon2id，会话存 Postgres（只存 token 哈希），首次运行走 `/setup`。未用 Auth.js（其邮箱密码模式不支持数据库会话）。
- API Key 在设置页保存，用 `CC_SECRET_KEY` 做 AES-256-GCM 加密，前端只显示后四位；数据库配置优先于环境变量。
- 合规：不做小红书/公众号自动发帖和爬虫，只生成可复制的内容包；X 连接器可选、用用户自己的 token；产品文案不出现「不封号/国内直连」。

## 下一步（按优先级）
1. 模型价格表设置界面（目前没价格时花费显示「—」，每日预算不生效）。
2. 找回/重置密码（计划做成命令行工具）。
3. 灵感库语义搜索（embedding + pgvector，向量列目前固定 1536 维）、去重、截图文字识别。
4. 总管 Bot 自动派活；按审核意见重写草稿；运行步骤详情页；静默时段。
5. 在线版：多用户、Postgres 行级安全隔离、邮箱/GitHub/Google 登录（目前显示「即将支持」）、计费、模板市场。
6. 登录限流目前在内存里，多进程/重启会失效，可移到 Postgres。
7. Docker 镜像瘦身（目前复制整个仓库），确定镜像发布名称；实际跑一次 `docker compose build && up`（尚未在真实 Docker 上验证）。
8. LLM 层目前用原生 fetch，可考虑换 Vercel AI SDK。
9. 剩余模板：长内容拆解、爆款对标、多平台分发、涨粉复盘、额度管家。
