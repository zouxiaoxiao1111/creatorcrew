# CreatorCrew（暂定名）

> **给 AI 自媒体创作者的开源「虚拟编辑部」**：一个总管 Bot 负责派活，多个专职 Bot 分别负责选题、整理和写作；人只做最后的判断和润色。

[English](#english) · [快速开始](#快速开始) · [开发](#本地开发) · [版本说明](#自部署版与在线版) · [路线图](#路线图) · [贡献](#参与贡献)

> ⚠️ 当前是 **v0.1 早期骨架**，功能还不完整，接口随时可能变化。`CreatorCrew` 是暂定名，正式发布前会更换。

---

## 它能做什么

| | |
|---|---|
| 🛰 **选题雷达** | 定时扫描关键词、对标账号（X 官方 API，可选）、RSS 和灵感库，按收藏潜力排序给出选题清单和理由 |
| ✦ **灵感库** | 链接、笔记、想法统一收进来；「灵感库整理」Bot 自动摘要、打标签、标注时效；pgvector 向量存储，供检索（RAG） |
| ✍️ **长文写作** | 选题 + 素材 + 个人风格档案 → 去 AI 味的「保姆级」初稿、5 个标题备选、封面图提示词 |
| ✅ **人工审核流** | `草稿 → 待审核 → 需修改 → 已通过 → 已导出`；**任何导出都必须先经过你审核**（默认开启） |
| 🎚 **按档位用模型** | 模板只声明 `cheap / mid / strong / local` 档位，你在设置里映射到具体模型；一个 Provider 报错或限流时按 fallback 链自动切换 |
| 📊 **用量计量** | 每次模型调用记录 token 和估算费用（单价表由你配置，不硬编码），为预算告警打基础 |
| 🧩 **模板即 YAML** | `bot.yaml` 可导入导出、可分享，社区模板使用 MIT 许可证，欢迎「抄作业」 |

支持的模型 Provider：OpenAI 及任何 OpenAI 兼容接口、OpenRouter、Ollama（本地模型）。

**明确不做**：批量养号、刷量、绕过平台风控的爬虫；在没有官方 API 的平台上自动发帖（v0.1 只导出 Markdown / 复制）。

## 快速开始

需要 Docker（含 Compose v2.24+）。

```bash
git clone <your-fork-url> creatorcrew && cd creatorcrew
cp .env.example .env        # 至少填一个模型 Provider 的 Key，并设置 CC_SECRET_KEY
docker compose up -d        # 启动 db（Postgres + pgvector）、web、worker
```

打开 <http://localhost:3000>：

1. 在 **设置** 里把模型档位映射到具体模型（例如 `openai:<模型名>`，每行一个，按顺序 fallback）；
2. 在 **灵感库** 收进几条素材；
3. 在 **工作台** 点「立即运行」，或开启「选题雷达」的定时任务；
4. 在 **草稿审核** 里通过或退回稿件，通过后导出 Markdown。

首次启动会自动执行数据库 migration（启用 pgvector），并用官方模板创建 3 个 Bot。升级：`docker compose pull && docker compose up -d`（启动时自动 migrate）。

可选的本地模型：`docker compose --profile ollama up -d`，并在 `.env` 中设置 `OLLAMA_BASE_URL=http://ollama:11434/v1`。

## 本地开发

需要 Node.js 22+ 和 pnpm 10（`corepack enable` 或 `npm i -g pnpm`）。

```bash
pnpm install
pnpm dev            # 同时启动 web（http://localhost:3000）和 worker
```

- 不设置 `DATABASE_URL` 时，Web 会进入 **演示模式**（内存示例数据），方便只改 UI；
- 需要真实数据库时，可以只启动数据库：`docker compose up -d db`，然后设置
  `DATABASE_URL=postgres://creatorcrew:creatorcrew@localhost:5432/creatorcrew`。

常用命令：

| 命令 | 作用 |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 代码检查 / 类型检查 / 单元测试 / 构建（Turborepo） |
| `pnpm validate-templates` | 校验官方模板和 `templates/` 下的社区模板（schema + 密钥检测） |
| `pnpm db:generate` | 修改 `packages/db/src/schema.ts` 后生成 migration |
| `pnpm db:migrate` | 手动执行 migration |

### 目录结构

```
creatorcrew/
├─ apps/
│  ├─ web/          # Next.js（App Router）：工作台 UI + Server Actions / API
│  └─ worker/       # pg-boss 队列与定时任务，执行 Bot（与 web 同一个镜像）
├─ packages/
│  ├─ core/         # 领域模型、Edition 配置与功能开关、审核状态机、密钥加密、队列接口
│  ├─ agents/       # bot.yaml 模板 schema / 加载 / 校验、Bot 运行时、官方模板
│  ├─ llm/          # OpenAI 兼容 Provider、档位路由 + fallback 链、预算、计量
│  ├─ connectors/   # RSS、X 官方 API（可选）、网页正文抓取
│  ├─ db/           # Drizzle schema、migration（含 pgvector）、种子数据
│  ├─ ui/           # 共享 UI 组件（Tailwind，shadcn/ui 风格）
│  └─ config/       # tsconfig 基础配置、环境变量 schema（zod）
├─ ee/              # 商业版功能（占位），独立许可证，运行时按需加载
├─ templates/       # 社区模板（MIT）
├─ docker/          # Dockerfile、entrypoint
└─ docs/            # 文档
```

架构说明见 [docs/architecture.md](docs/architecture.md)，模板格式见 [docs/templates.md](docs/templates.md)。

## 自部署版与在线版

**同一套代码**，通过环境变量 `CC_EDITION` 切换：

| | 自部署（`selfhost`，默认） | 在线版（`cloud`） |
|---|---|---|
| 租户 | 单租户（一个默认 workspace） | 多租户（`workspace_id` 隔离 + Postgres RLS，规划中） |
| 模型 Key | 自己提供 | 自带 Key 或使用平台托管额度 |
| 计费 / 模板市场支付 / SSO | 无 | 由 `ee/` 提供 |
| 许可证 | AGPL-3.0 | AGPL-3.0 核心 + `ee/` 商业许可证 |

- 代码里不直接判断 edition，统一读取 `@creatorcrew/core` 的 `getFeatures()`；
- `ee/` 不是 workspace 包，核心代码不会静态引用它，只在运行时按需动态加载；
- **删掉 `ee/` 目录后项目仍可完整构建和运行**，CI 的 `build-without-ee` 任务会持续验证。

## 许可证

- 核心代码：[GNU AGPL-3.0](LICENSE)。个人自部署、自己使用不受影响；如果你修改后以网络服务形式提供给他人，需要按 AGPL 公开修改后的源码。
- `ee/` 目录：单独的商业许可证（[ee/LICENSE](ee/LICENSE)，目前为占位文本）。
- `templates/` 目录：[MIT](templates/LICENSE)。

> 许可证方案正式确定前会咨询熟悉开源协议的律师。

## 路线图

**v0.1（MVP，约 6 周）**：一位 AI 创作者每天拿到选题清单，并在 1 小时内产出一篇可以发的长文。

- [x] monorepo 骨架、Drizzle schema（含 pgvector）、Edition 配置、docker-compose
- [x] LLM 抽象层（OpenAI 兼容 / OpenRouter / Ollama）、档位映射 + fallback 链、用量计量
- [x] bot.yaml 模板解析 / 校验、Bot 运行时、pg-boss 队列与定时任务
- [x] 官方模板：选题雷达、灵感库整理、长文写作（含人工审核）
- [x] 工作台、灵感库、草稿审核、模型设置页面；导出 Markdown
- [ ] 登录（Auth.js；自部署单管理员账号）
- [ ] 在 UI 中加密保存 API Key、单价表与预算设置、额度看板
- [ ] 灵感库：截图 OCR、向量检索（embedding 生成）、去重
- [ ] 运行日志详情页（每一步的 Prompt 和输出）、批注后按段重写

**v0.2**：长内容拆解（yt-dlp + Whisper）、爆款对标、多平台分发内容包（X / 小红书 / 公众号）、总管 Bot 自动调度、额度管家自动降级、Git URL 导入模板、在线版多租户内测。

**v0.3**：涨粉复盘、个人风格档案、模板市场、浏览器插件 / 邮件 / Telegram 采集、团队协作与审计日志。

## 参与贡献

欢迎提 Issue 和 PR，尤其是：新模板、新连接器、文档和翻译。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。贡献代码需要签署 CLA（为未来的双授权保留可能，发布前上线 CLA Assistant）。

---

## English

**CreatorCrew** (working title) is an open-source "virtual newsroom" for AI content creators: a set of reusable bot templates that take you from **topic discovery → research → long-form drafting → human review → export**.

- **Bots as YAML templates** (`bot.yaml`): persona, steps, tools, model *tier* (`cheap / mid / strong / local`) and I/O schema. Templates never name concrete models.
- **Model routing**: map each tier to an ordered chain of `provider:model` (OpenAI-compatible, OpenRouter, Ollama); automatic fallback on errors/rate limits; per-call token & cost metering.
- **Human-in-the-loop**: drafts must be approved before export (on by default). No auto-posting in v0.1.
- **One codebase, two editions**: `CC_EDITION=selfhost` (default, single tenant) or `cloud` (multi-tenant; commercial features live in `ee/` and are loaded at runtime only when present — the project builds and runs with `ee/` deleted).
- **Stack**: pnpm + Turborepo, TypeScript (strict), Next.js App Router, Postgres 16 + pgvector, Drizzle, pg-boss (no Redis required), Docker.

**Quick start**: `cp .env.example .env && docker compose up -d`, then open <http://localhost:3000>.
**Dev**: `pnpm install && pnpm dev` (without `DATABASE_URL` the web app runs in an in-memory demo mode).

**License**: core under AGPL-3.0, `ee/` under a separate commercial license (placeholder), community templates under MIT. Contributions require a CLA — see [CONTRIBUTING.md](CONTRIBUTING.md).
