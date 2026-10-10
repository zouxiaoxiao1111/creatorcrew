import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // workspace 内的包直接以 TS 源码形式引用，由 Next 负责编译
  transpilePackages: [
    "@creatorcrew/core",
    "@creatorcrew/agents",
    "@creatorcrew/llm",
    "@creatorcrew/db",
    "@creatorcrew/ui",
    "@creatorcrew/config",
  ],
  serverExternalPackages: ["pg-boss", "postgres", "@node-rs/argon2"],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
};

export default nextConfig;
