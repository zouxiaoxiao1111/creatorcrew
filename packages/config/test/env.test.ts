import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src";

function readDotenv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

describe("parseEnv", () => {
  it(".env.example 可以直接通过校验", () => {
    const env = parseEnv(readDotenv(path.resolve(import.meta.dirname, "../../../.env.example")));
    expect(env.CC_EDITION).toBe("selfhost");
    expect(env.CC_REQUIRE_APPROVAL).toBe(true);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("非法 edition 给出中文错误", () => {
    expect(() => parseEnv({ CC_EDITION: "pro" })).toThrowError(/CC_EDITION/);
  });
});
