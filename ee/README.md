# ee/ — CreatorCrew 商业版功能（Enterprise / Cloud Edition）

这个目录存放**只在官方在线版（`CC_EDITION=cloud`）或获得商业授权的私有部署中启用**的功能，例如：

- 计费与订阅（`ee/billing`，Stripe；国内支付另行评估）
- 多租户管理后台
- 模板市场支付与作者分成
- SSO、审计日志等团队功能

> **v0.1 状态：只有占位代码，没有任何实际功能。**

## 许可证

`ee/` 目录下的代码**不适用**仓库根目录的 AGPL-3.0，而是使用单独的商业许可证，见 [`ee/LICENSE`](./LICENSE)（目前为占位文本，正式条款发布前请勿在生产环境使用本目录代码）。

## 加载机制

- 核心代码**不会静态 import** `ee/` 里的任何文件；`ee/` 也不是 pnpm workspace 包。
- 运行时由 `@creatorcrew/core` 的 `findEEDir()` / `loadEE()` 按需查找并动态加载 `ee/index.mjs`：
  1. 如果设置了 `CC_EE_DIR`，只在该目录查找；
  2. 否则从当前工作目录逐级向上查找 `ee/index.mjs`；
  3. 设置 `CC_DISABLE_EE=true` 时始终视为不存在。
- 功能开关统一从 `getFeatures()` 读取：`billing`、`marketplacePayments`、`templateMarketplace` 只有在 **`CC_EDITION=cloud` 且 ee 存在**时才会开启。
- **删掉整个 `ee/` 目录后，项目仍然可以完整安装、构建和运行**。CI 中的 `build-without-ee` 任务专门保证这一点。

## 模块约定

`ee/index.mjs` 默认导出一个对象：

```js
export default {
  name: "creatorcrew-ee",
  version: "0.0.0",
  async register({ features, log }) {
    // 根据 features 注册计费、市场等功能
  },
};
```
