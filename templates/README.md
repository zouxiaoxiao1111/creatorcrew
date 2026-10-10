# 社区模板（templates/）

这里存放社区贡献的 Bot 模板（`bot.yaml`，也支持 JSON）。官方模板在 [`packages/agents/templates`](../packages/agents/templates)。

## 许可证

**本目录下的所有模板使用 [MIT 许可证](./LICENSE)**，与仓库核心代码的 AGPL-3.0 不同——我们希望大家放心地「抄作业」、修改和二次分发模板。提交 PR 即表示你同意以 MIT 许可证发布你的模板。

## 怎么贡献一个模板

1. 在 `templates/<你的 GitHub 用户名>/` 下新建一个 `xxx.yaml`（一个文件一个 Bot）；
2. 格式参考官方模板，例如 [`30-longform-writer.yaml`](../packages/agents/templates/30-longform-writer.yaml)：
   - `apiVersion: creatorcrew/v1`、`kind: Bot`；
   - `metadata.name` 只能用小写字母、数字和短横线，`version` 用语义化版本号；
   - 模型只写档位（`cheap / mid / strong / local`），**不要写具体模型名**；
   - 产出草稿（`output.kind: draft`）的模板**必须**包含 `human_review` 步骤；
3. 本地校验：`pnpm validate-templates`；
4. 提交 PR。CI 会自动校验 schema，并检查模板里有没有带密钥。

## 注意

- **不要**在模板里放任何 API Key、Token、密码或账号信息；
- 不接受批量养号、刷量、绕过平台风控、洗稿类的模板；
- 引用他人内容的模板，请在提示词里要求注明出处。
