import { MODEL_TIERS, MODEL_TIER_LABELS } from "@creatorcrew/core/domain";
import { inputClass } from "@creatorcrew/ui";
import { saveProviderAction } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/submit-button";
import type { ProviderCredentialView } from "@/lib/store";

const BASE_URL_PRESETS = [
  "https://api.openai.com/v1",
  "https://openrouter.ai/api/v1",
  "http://ollama:11434/v1",
  "http://localhost:11434/v1",
];

/** 新增 / 编辑 Provider 凭据。编辑时不会回显 Key，只显示后 4 位。 */
export function ProviderForm({ provider }: { provider?: ProviderCredentialView }) {
  const listId = `base-url-presets-${provider?.id ?? "new"}`;
  return (
    <form action={saveProviderAction} className="space-y-3" autoComplete="off">
      {provider ? <input type="hidden" name="id" value={provider.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">名称</span>
          <input
            name="name"
            required
            defaultValue={provider?.name}
            placeholder="openai / openrouter / my-gateway"
            pattern="[a-z0-9][a-z0-9_\-]{0,39}"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">Base URL（OpenAI 兼容）</span>
          <input
            name="baseUrl"
            required
            type="url"
            list={listId}
            defaultValue={provider?.baseUrl}
            placeholder="https://api.openai.com/v1"
            className={`${inputClass} font-mono`}
          />
          <datalist id={listId}>
            {BASE_URL_PRESETS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">API Key</span>
        <input
          name="apiKey"
          type="password"
          autoComplete="new-password"
          placeholder={
            provider?.maskedKey
              ? `已保存 ${provider.maskedKey}，留空则保持不变`
              : "sk-…（本地 Ollama 可以留空）"
          }
          className={`${inputClass} font-mono`}
        />
        <span className="mt-1 block text-xs text-zinc-400">
          使用 CC_SECRET_KEY 以 AES-256-GCM 加密后保存，之后只显示后 4 位，不会再返回给浏览器。
        </span>
      </label>
      {provider?.hasKey ? (
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input type="checkbox" name="clearKey" /> 删除已保存的 Key
        </label>
      ) : null}
      <fieldset>
        <legend className="mb-1 text-sm text-zinc-600">
          服务哪些档位（填写该档位使用的模型名，留空表示不服务）
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODEL_TIERS.map((tier) => (
            <label key={tier} className="block">
              <span className="text-xs text-zinc-500">
                <span className="font-mono">{tier}</span> · {MODEL_TIER_LABELS[tier]}
              </span>
              <input
                name={`model_${tier}`}
                defaultValue={provider?.tierModels[tier]}
                placeholder="模型名"
                className={`${inputClass} mt-0.5 font-mono`}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          优先级
          <input
            name="priority"
            type="number"
            min={0}
            max={10000}
            defaultValue={provider?.priority ?? 100}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" name="enabled" defaultChecked={provider?.enabled ?? true} /> 启用
        </label>
        <SubmitButton size="sm" pendingText="保存中…" className="ml-auto">
          {provider ? "保存修改" : "添加 Provider"}
        </SubmitButton>
      </div>
    </form>
  );
}
