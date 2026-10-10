import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // workspace 内的包是 TS 源码，打进 bundle；第三方依赖保持 external（在 package.json 中声明）
  noExternal: [/^@creatorcrew\//],
});
