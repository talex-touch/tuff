# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV NITRO_PRESET=node-server
ENV NUXT_USE_WORKSPACE_SOURCE=true
ENV NUXT_FULL_ICON_SAFELIST=false

WORKDIR /workspace

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --filter "@talex-touch/tuff-pilot..."
RUN pnpm -C "apps/pilot" run build

RUN pnpm --config.inject-workspace-packages=true --filter "@talex-touch/tuff-pilot" deploy --prod "/opt/pilot-runtime"
RUN cp -R "apps/pilot/.output" "/opt/pilot-runtime/.output" \
  && rm -rf \
  "/opt/pilot-runtime/.nuxt" \
  "/opt/pilot-runtime/.pnpm-store" \
  "/opt/pilot-runtime/app" \
  "/opt/pilot-runtime/dist" \
  "/opt/pilot-runtime/public" \
  "/opt/pilot-runtime/scripts" \
  "/opt/pilot-runtime/server" \
  "/opt/pilot-runtime/types" \
  && rm -f \
  "/opt/pilot-runtime/.env" \
  "/opt/pilot-runtime/.env.example" \
  "/opt/pilot-runtime/.env.local" \
  "/opt/pilot-runtime/eslint.config.js" \
  "/opt/pilot-runtime/nuxt.config.ts" \
  "/opt/pilot-runtime/pnpm-lock.yaml" \
  "/opt/pilot-runtime/shims-compat.d.ts" \
  "/opt/pilot-runtime/tsconfig.json" \
  "/opt/pilot-runtime/uno.config.ts" \
  "/opt/pilot-runtime/vitest.config.ts" \
  "/opt/pilot-runtime/wrangler.toml"

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3300
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3300

COPY --from=builder /opt/pilot-runtime ./

EXPOSE 3300

CMD ["node", ".output/server/index.mjs"]
