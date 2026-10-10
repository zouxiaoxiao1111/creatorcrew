import { MODEL_TIERS, MODEL_TIER_LABELS, formatTargetList } from "@creatorcrew/core/domain";
import { describeProviders } from "@creatorcrew/llm";
import { Badge, Card, EmptyState, PageHeader, inputClass } from "@creatorcrew/ui";
import { deleteProviderAction, saveTierMappingAction } from "../actions";
import { ProviderForm } from "@/components/provider-form";
import { Flash, pick, type SearchParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { features } from "@/lib/env";
import { isDemoMode } from "@/lib/db-context";
import { authedStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const FEATURE_LABELS: [keyof ReturnType<typeof features>, string][] = [
  ["multiTenant", "多租户"],
  ["signup", "开放注册"],
  ["billing", "计费（ee）"],
  ["templateMarketplace", "模板市场（ee）"],
  ["requireApproval", "导出前必须审核"],
  ["autoPublish", "自动发帖（v0.1 不支持）"],
  ["xConnector", "X API 连接器"],
];

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const store = await authedStore("/settings");
  const [settings, credentials] = await Promise.all([
    store.getSettings(),
    store.listProviderCredentials(),
  ]);
  const demo = isDemoMode();
  const providers = describeProviders(process.env);
  const f = features();

  return (
    <>
      <PageHeader
        title="设置"
        description="模板只声明需要哪个档位的模型，具体用哪个模型由你在这里决定。"
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">模型 Provider 凭据</h2>
            <p className="mt-1 text-xs text-zinc-500">
              这里保存的 Provider
              优先于环境变量里的同名配置。档位映射为空时，按优先级（数字越小越优先）使用这里填写的模型。
            </p>
          </div>
          {demo ? (
            <Badge tone="amber">演示模式：Key 不会被保存</Badge>
          ) : (
            <Badge tone="green">AES-256-GCM 加密存储</Badge>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {credentials.length === 0 ? (
            <EmptyState
              title="还没有保存任何 Provider"
              description="在下面添加第一个，例如 OpenAI 兼容接口、OpenRouter 或本地 Ollama"
            />
          ) : (
            credentials.map((p) => (
              <details key={p.id} className="group rounded-lg border border-zinc-200">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-mono font-medium text-zinc-900">{p.name}</span>
                  <span className="truncate font-mono text-xs text-zinc-500">{p.baseUrl}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {Object.keys(p.tierModels).map((t) => (
                      <Badge key={t} tone="blue">
                        {t}
                      </Badge>
                    ))}
                    <Badge tone={p.hasKey ? "zinc" : "amber"}>{p.maskedKey ?? "无 Key"}</Badge>
                    {p.enabled ? null : <Badge tone="red">已停用</Badge>}
                  </span>
                </summary>
                <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
                  <ProviderForm provider={p} />
                  <form action={deleteProviderAction} className="border-t border-zinc-100 pt-3">
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      pendingText="删除中…"
                    >
                      删除这个 Provider（连同已保存的 Key）
                    </SubmitButton>
                  </form>
                </div>
              </details>
            ))
          )}
        </div>
        <details
          className="mt-4 rounded-lg border border-dashed border-zinc-300"
          open={credentials.length === 0}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700">
            ＋ 添加 Provider
          </summary>
          <div className="border-t border-zinc-100 px-4 py-4">
            <ProviderForm />
          </div>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="text-sm font-semibold">模型档位映射（高级，可选）</h2>
          <p className="mt-1 text-xs text-zinc-500">
            每行或用逗号分隔一个 <code className="font-mono">provider:model</code>，按顺序作为
            fallback 链：第一个报错或限流时自动切到下一个。
          </p>
          <form action={saveTierMappingAction} className="mt-5 space-y-5">
            {MODEL_TIERS.map((tier) => (
              <label key={tier} className="block">
                <div className="mb-1.5 flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-zinc-500">{tier}</span>
                  <span className="text-zinc-800">{MODEL_TIER_LABELS[tier]}</span>
                </div>
                <textarea
                  name={`tier_${tier}`}
                  rows={2}
                  defaultValue={formatTargetList(settings.tiers?.[tier]).replaceAll(", ", "\n")}
                  placeholder={
                    tier === "local" ? "ollama:qwen2.5:7b" : "openai:模型名\nopenrouter:模型名"
                  }
                  className={`${inputClass} font-mono`}
                />
              </label>
            ))}
            <div className="flex items-center gap-3">
              <SubmitButton pendingText="保存中…">保存</SubmitButton>
              <span className="text-xs text-zinc-400">
                费用单价表和预算上限在 v0.1 后续版本（额度管家）里配置。
              </span>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">模型 Provider</h2>
            <p className="mt-1 text-xs text-zinc-500">
              v0.1 通过环境变量配置 Key（UI 中加密存储在后续版本提供）。
            </p>
            <ul className="mt-4 space-y-3">
              {providers.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <div className="text-zinc-800">{p.label}</div>
                    <div className="font-mono text-xs text-zinc-400">{p.id}</div>
                  </div>
                  <Badge tone={p.configured ? "green" : "zinc"}>
                    {p.configured ? "已配置" : "未配置"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">版本与功能开关</h2>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-zinc-500">CC_EDITION</span>
              <Badge tone={f.edition === "cloud" ? "violet" : "zinc"}>{f.edition}</Badge>
              <Badge tone={f.eeLoaded ? "blue" : "zinc"}>
                {f.eeLoaded ? "ee 已加载" : "无 ee"}
              </Badge>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {FEATURE_LABELS.map(([key, label]) => (
                <li key={key} className="flex justify-between">
                  <span className="text-zinc-600">{label}</span>
                  <span className={f[key] ? "text-emerald-600" : "text-zinc-400"}>
                    {f[key] ? "开启" : "关闭"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
