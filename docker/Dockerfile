# syntax=docker/dockerfile:1.7
# CreatorCrew：web 和 worker 共用同一个镜像，用不同的命令启动（web / worker / migrate）。

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.6 && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- 依赖 ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/agents/package.json packages/agents/
COPY packages/config/package.json packages/config/
COPY packages/connectors/package.json packages/connectors/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/llm/package.json packages/llm/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- 构建 ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- 运行 ----
# TODO：改用 Next.js standalone 输出 + pnpm deploy 精简镜像体积
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CC_TEMPLATES_DIR=/app/packages/agents/templates \
    CC_MIGRATIONS_DIR=/app/packages/db/drizzle
COPY --from=build /app /app
COPY docker/entrypoint.sh /usr/local/bin/cc-entrypoint
RUN chmod +x /usr/local/bin/cc-entrypoint && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "cc-entrypoint"]
CMD ["web"]
