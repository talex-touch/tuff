# Nexus docs 静态交付收尾：边缘缓存、404.html、/docs 静态重定向

父任务：`09-23-nexus-docs-perf-cms-remediation`。

## Goal

让已经预渲染好的 docs 在线上真正表现得像静态站：不存在的 docs 路径返回真正的 404；`/docs/**` 的入口重定向不再进 Worker；docs 根路径也拿到缓存头；边缘缓存以可测量、可回退的方式启用；把 `08-27-nexus-docs-body-ssg` 用今天的线上证据归档。

## Background（已确认的事实）

证据全文：`../09-23-nexus-docs-perf-cms-remediation/research/audit-2026-09-23.md` §1–§3、§6。

- docs 已是 Pages 静态直出：预渲染由 `build/docs-prerender-routes.ts` 枚举，`nuxt.config.ts:448-456` 把 `/en/docs/*`、`/zh/docs/*`、`/api/docs/page/*` 排除出 Worker；线上 `button` 页正文在 HTML 内，带斜杠 URL 308 归一，`_headers` docs 规则生效。
- 软 404：`dist/` 没有 `404.html`，Cloudflare 官方文档明确"没有顶层 404.html 时 Pages 视为 SPA，把所有未命中路径匹配到根"；实测 `/en/docs/<不存在>` 返回 `index.html` 且 200。`app/pages/[...all].vue:23-27` 对所有路径 `setResponseStatus(404)`，而 Nitro 预渲染对非 200/3xx 响应不落盘（`node_modules/nitropack/dist/core/index.mjs:2115-2141`），所以直接把 `/404.html` 加进预渲染列表不会产出文件。Nitro cloudflare 预设在 `404.html` 存在时会在 `_redirects` 顶部写 `/* /404.html 404`（`presets/cloudflare/utils.mjs:114-118`）。
- `/docs` 与 `/docs/**` 的 308 由 `server/middleware/docs-legacy-redirect.ts` 在 Worker 内处理（本机 ttfb 3～5 s）；`dist/_redirects` 只有 `/terms /license 307`。Nitro 只把 routeRules 的 redirect 写进 `_redirects`，且不会把 `to` 里的 `/**` 转成 `:splat`（`presets/cloudflare/utils.mjs:120-128`）。Pages `_redirects` 支持 `/docs/* /en/docs/:splat 308`，动态规则上限 100 条，静态规则应排在动态规则之前，规则作用于静态资源响应。
- docs 根路径 `/en/docs`、`/zh/docs` 拿到的是 Pages 默认 `max-age=0, must-revalidate`：`build/nexus-static-routes.mjs:70` 的 `docsStaticHtmlHeaderRoutes = ['/en/docs/**', '/zh/docs/**']` 不匹配根本身。
- 边缘缓存：docs HTML / JSON / `.md` / `_i18n` 全部 `cf-cache-status: DYNAMIC`，`/_nuxt/*` 为 MISS→HIT。Cloudflare 有两层：Pages 自带的按数据中心资产缓存（部署即失效，`cf-cache-status` 不体现）与 zone CDN 缓存（只按扩展名默认缓存，HTML/JSON 需要 Cache Rule）。官方文档同时警告：给 Pages 自定义域加缓存"可能让缓存响应先于 Pages 的重定向/Functions 生效"，且 zone 缓存不随 Pages 部署清除。`.trellis/spec/frontend/nexus-docs-static-delivery.md` 当前把 `s-maxage=3600` 描述为已生效的"edge 1 h"，并断言"部署后旧 HTML 引用的资源仍存在"，两者与线上不符：Pages 每次部署替换资产，变更过的 chunk 旧哈希会消失。
- 门禁：`build/check-worker-bundle.mjs` 当前对 dist 退出码 1（基线 findings 见证据 §6）；其中 `checkStaticCacheHeaders` 8/8、`Static route files 32/32`、`_headers` 25 rules 均通过；`routeToDistPath`（:399）把公共路由映射为 `<route>.html`。
- 部署证据链：`scripts/collect-deployed-preview-evidence.mjs` 以 Playwright 采集 preview 部署证据；zone 级 Cache Rule 只对生产自定义域生效，preview 域测不到。
- `08-27-nexus-docs-body-ssg` 状态 in_progress，`task.json.meta.blocker` = "需要已部署的 SSG 正文证据"。

## Requirements

- R1 真 404：构建产出 `dist/404.html`，内容必须是服务端渲染好的 Nuxt 404 页面（不能是空壳）；线上 `/en/docs/<不存在>` 返回 404 与该页面；Worker 路径下的 404 行为不变。实现口径（2026-09-24 验证后修正）：直接预渲染 `/404.html` 会被 Nuxt 当单页回退壳输出（`#__nuxt` 为空），因此改为预渲染私有路由 `/__not-found` 再由 `build/materialize-not-found.mjs` 复制为 `404.html`。复核（trellis-check，2026-09-24）发现 `/* /404.html 404` 在 Pages `_redirects` 里是非法状态码（wrangler 警告并丢弃），404 来自 Pages 对顶层 `404.html` 的原生处理，所以不写回退行，写入脚本还会剔除 Nitro 可能写出的这类非法行。
- R2 `/docs/**` 静态 308：`_redirects` 含 `/docs /en/docs 308` 与 `/docs/* /en/docs/:splat 308`，位于 `/*` 回退之前；`.md` 后缀随 splat 保留；**`/docs` 与 `/docs/*` 同时写进 `cloudflare.pages.routes.exclude`**，因为 Pages 只对自己服务的请求应用 `_redirects`，留在 Worker 份额里的请求会先到中间件、静态规则永远不触发（2026-09-24 wrangler 实测）。`docs-legacy-redirect.ts` 保留给 dev（node-server 预设）与 Worker 兜底。
- R3 docs 根路径缓存头：`/en/docs`、`/zh/docs` 与 `/en/docs/**` 同一 `DOCS_STATIC_CACHE_CONTROL`；`_headers` 规则数仍 < 100。
- R4 边缘缓存实验（老板在 Cloudflare dashboard 操作，代码侧交付 runbook + 探针）：
  - runbook 写进 spec：Cache Rule 表达式限定 `/en/docs/*`、`/zh/docs/*`、`/api/docs/page/*`、`/api/docs/navigation/*`、`/api/docs/search/*`、`/api/docs/sidebar-components/*`、`/api/docs/component-sync`、`/_i18n/*`；Edge TTL 用"忽略 origin、固定 5 分钟"，不设 stale-while-revalidate，避免部署后旧 HTML 引用已消失的 chunk；不要覆盖 `/api/docs/view|comments|feedback|engagement|assistant`。
  - 探针脚本 `scripts/probe-docs-edge-cache.mjs`：对生产 URL 列表各请求两次，输出 `cf-cache-status`、ttfb，落盘 `output/evidence/docs-edge-cache-<date>.json`；规则开启前后各跑一次作为对照。
  - 保留规则的判据：第二次请求 HIT/STALE，ttfb p50 下降；出现 chunk 404 事故则回退并记录。
- R5 spec 校正：`nexus-docs-static-delivery.md` 的"Static docs responses carry an edge cache window"一节改为与线上一致的两层描述、部署失效风险与 Cache Rule 前提；新增"404.html 与 _redirects"一节。
- R6 归档 `08-27-nexus-docs-body-ssg`：把 2026-09-23 的线上探测（HTML 含正文、hydration 零正文请求）写入其 `verify/RESULTS.md` 末尾并用 `task.py archive` 归档。
- R7 门禁：`check-worker-bundle.mjs` 新增 `_redirects` 断言（docs 两条规则存在且在 `/*` 之前、`404.html` 存在），`routeToDistPath` 正确处理 `/404.html`；不新增基线之外的 findings。

## Acceptance Criteria

- [x] `pnpm -C apps/nexus run build` 后：`dist/404.html` 存在、`#__nuxt` 非空且含 `aria-label="404"`；`dist/_redirects` 为 `/docs /en/docs 308`、`/terms /license 307`、`/docs/* /en/docs/:splat 308`，不含任何非法状态码行；`dist/_routes.json` exclude 含 `/docs`、`/docs/*`；`dist/_headers` 含 `/en/docs`、`/zh/docs` 两个块。
- [x] `npx wrangler pages dev dist` 本地：`/docs/dev` → 308 `/en/docs/dev`；`/docs/dev/components/button.md` → 308 `/en/docs/dev/components/button.md`；`/en/docs/nope` → 404 且正文为 404 页；`/en/docs/dev/components/button` → 200 含正文。
- [x] 部署后线上复测同样四条，且 `/docs/dev` 的 ttfb 与 `/en/docs/dev` 静态文件同量级。
- [x] `node build/check-worker-bundle.mjs`：新增断言通过，findings 不多于基线。
- [x] R4 有开启前后两份探针记录；spec 已按 R5 更新；`08-27` 任务已归档。
- [x] `docs-prerender-routes.test.ts`、`static-cache-headers.test.ts`、`check-worker-bundle.test.ts`、`materialize-docs-index-aliases.test.ts` 通过；typecheck、eslint、`git diff --check` 通过。

## Out of Scope

- 画廊与样式表数量（子任务 `09-23-nexus-gallery-css-graph-slimming`）。
- `__NUXT_DATA__` 正文重复、`payloadExtraction`。
- Cache Rule 的实际创建（老板操作）；部署后自动清缓存流水线（如实验证明必要再立项）。
- `check-worker-bundle.mjs` 基线里已有的 findings。

## Open Questions

- 无阻塞项。R4 需要老板在 dashboard 建规则，代码侧先交付 runbook 与探针。
