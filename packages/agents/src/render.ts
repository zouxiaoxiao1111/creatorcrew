/**
 * 极简模板渲染：{{ inputs.keywords }}、{{ steps.outline.output }}。
 * 数组用「、」连接，对象序列化为 JSON。故意不支持逻辑语句，保持模板可读。
 */
export function renderPrompt(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, expr: string) => {
    const value = expr.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, scope);
    if (value === undefined || value === null) return "";
    if (Array.isArray(value) && value.every((v) => typeof v !== "object")) return value.join("、");
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });
}
