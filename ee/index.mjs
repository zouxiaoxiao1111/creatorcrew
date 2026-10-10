// CreatorCrew ee/ 入口（占位）。许可证见 ee/LICENSE，不适用 AGPL。
// 由 @creatorcrew/core 的 loadEE() 在运行时按需动态加载；核心代码不会静态引用本文件。

export default {
  name: "creatorcrew-ee",
  version: "0.0.0-placeholder",
  /** @param {{ features: Record<string, unknown>, log: (msg: string) => void }} ctx */
  async register({ features, log }) {
    if (features.edition !== "cloud") {
      log("[ee] 当前为自部署版，商业功能不启用");
      return;
    }
    // TODO(v0.2)：billing（Stripe）、多租户管理后台、模板市场支付、SSO
    log("[ee] 在线版商业功能尚未实现（占位）");
  },
};
