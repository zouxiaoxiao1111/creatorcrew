# 参与贡献 CreatorCrew

感谢你愿意参与！这份文档说明怎么搭开发环境、怎么提交代码和模板。

## 行为准则

- 友善、就事论事；
- 不讨论、不提交任何灰产相关内容：批量养号、刷量、绕过平台风控、洗稿等；
- 不要在 Issue / PR / 模板里贴任何 API Key、Token 或账号信息。

## 开发环境

- Node.js 22+、pnpm 10、（可选）Docker
- `pnpm install` 后用 `pnpm dev` 启动 web 和 worker；不设置 `DATABASE_URL` 时 web 使用演示数据

提交前请确保以下命令全部通过（CI 也会跑）：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate-templates
```

另外 CI 会在**删除 `ee/` 目录**的情况下再构建一次——核心代码（`apps/`、`packages/`）**不能静态引用 `ee/`**，只能通过 `@creatorcrew/core` 的 `getFeatures()` / `loadEE()` 使用。

## 代码约定

- TypeScript strict，ESM；workspace 包以 TS 源码形式直接被引用（无需单独构建）；
- UI 和 API 不直接判断 `CC_EDITION`，统一读取 `getFeatures()`；
- 所有业务表都带 `workspace_id`；修改 `packages/db/src/schema.ts` 后运行 `pnpm db:generate` 并提交生成的 migration；
- 模型只按档位（`cheap / mid / strong / local`）使用，不在代码或模板里硬编码具体模型名和单价；
- 界面文案以中文为主；
- 新功能请附带测试（vitest）。

## 贡献模板

见 [templates/README.md](templates/README.md)。社区模板使用 MIT 许可证。

## 好上手的任务

带有 `good first issue` 标签的 Issue：新增连接器、新增模板、文档和翻译。

## 许可证与 CLA

- 提交到核心代码的贡献以 [AGPL-3.0](LICENSE) 发布；
- 提交到 `templates/` 的模板以 [MIT](templates/LICENSE) 发布；
- `ee/` 目录使用单独的商业许可证，一般不接受外部贡献；
- 首次贡献代码时需要签署贡献者许可协议（CLA），以便项目未来可以提供商业授权（CLA Assistant 将在首次公开发布前接入）。

## 提交 PR

1. Fork 并基于 `main` 新建分支；
2. 提交信息简洁说明「做了什么、为什么」；
3. PR 描述中附上截图（UI 改动）或运行结果（模板改动）。
