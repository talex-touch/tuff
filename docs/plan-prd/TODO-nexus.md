# Nexus Performance TODO

> 更新时间：2026-07-04
> 范围：`apps/nexus` 文档站、生态站、Dashboard、Provider Registry、Data Governance 与公开控制台性能收口。

## Goal

```text
1. 扫描整个 nexus 优化性能，自行测试各种报告。目前加载超级缓慢，希望每个页面切换都很快，而且固定各种模板，拆分，该静态的静态。
2. 各种文档加载也特别慢，对应目前 aireview 组件还没有审批完的全部都要好好优化一下，依次修复，分批做提交，做截图+性能加载 playwright 分析报告等。
```

## 当前口径

- Nexus 性能线与 CoreApp / AI / R3 分开推进，不混入其它 dirty files。
- `output/playwright/` 只作为 ignored evidence 目录，不纳入提交。
- 每批保持小切片：Playwright screenshot/HAR/Markdown/JSON、focused 验证或等价静态检查、`git diff --check`。
- production 结论必须用 production build / preview HAR，不用 dev-only HAR 替代。
- 当前整体 goal 约 `98%`，剩余是 production preview/HAR、pending / aireview 组件继续拆分、首页 warnings 与少量 dev-only 慢点；不再从聊天上下文恢复范围。

## 日期 Goal 进度记录

- 2026-07-04：当前 Nexus performance separate thread 按既定 goal 约 `98%`。本轮已把 sidebase auth runtime、route matrix、docs production chunk/payload/CSS、PWA precache trim、Cloudflare root SQL dump、bfcache lifecycle blocker 与 local Wrangler runtime smoke 收到 guarded 状态；相关 source guard、runtime evidence checker、deployed preview collector dry-run / non-local / HTTPS guard 与 Nexus-only 复验均已同步。
- 2026-07-04：该进度不是完成声明。仍缺 deployed Cloudflare Pages preview HAR、真实 provider callback smoke、authenticated dashboard runtime smoke、真实 bfcache hit，以及 pending / aireview 组件继续拆分、首页 warnings 与 dev SSR TTFB / Nuxt macro 后续批次。
- 2026-07-04：下一次回来先讨论是否修改或拆分 goal；若 goal 继续保持原范围，则 production chunk/CSS 最终结论仍以 `node build/check-runtime-evidence.mjs --require-deployed-preview` 通过为准。

## 已完成摘要

- docs route 首屏重型链路已完成主要止血：
  - sidebar metadata 延迟加载
  - docs metadata 避免全量 MDC parse
  - i18n locale messages 懒加载
  - route-local locale messages 拆分
  - dev route-local CSS 污染过滤
  - component docs dev metadata fast path
  - sidebar / pager full-body prefetch 可取消化
  - docs Assistant context 按用户意图构建
  - pending 长文档后半段 deferred render
  - code copy header 原生 DOM 增强
  - toast feedback 动态加载
  - public docs auth/profile graph 移出首访
  - legacy sonner CSS 移出首访
- docs production static shell / payload 已完成一轮收口：
  - 所有 docs detail route 生产 SSR 改为 metadata-only (`body=0`)，`/docs` 与 `/docs/index` 保持完整 SSR。
  - docs 正文通过客户端 idle/full-body fetch 拉取，避免每个 docs HTML 重复携带完整 MDC body。
  - docs navigation 改为 client lazy fetch，component docs 仍只请求 `scope=components`，避免静态 HTML 重复注入全量 nav tree。
  - docs engagement tracker 已移除 `beforeunload` flush，保留 `visibilitychange` / `pagehide` flush，避免 docs 公共页面主动引入 bfcache blocker。
  - `node apps/nexus/build/check-worker-bundle.mjs`：`dist total=37.07 MiB`，worker executable JS `8.93 MiB`，gzip `2.15 MiB`，worker JS 文件 `649` 个，静态路由排除 `19` 条通过。
  - `build:analyze-worker` 现在同时守卫 route files、docs detail HTML payload、docs/store/landing/auth/public-info CSS boundary、public route-family 初始 JS/CSS budget 与 HTML 初始资产引用断链；当前静态路由文件 `19/19` 通过。
  - docs detail HTML 全量守卫：`452` 个 docs detail page 最大约 `19.9 KiB`，无 full body marker，无 `/api/docs/navigation` payload；`/docs` 与 `/docs/index` 作为完整 SSR 例外保留。
  - docs deferred runtime API 静态证据已补：`output/playwright/nexus-docs-runtime-route-guard-2026-06-28.{json,md}`，Worker 产物中 `/api/docs/page`、navigation、sidebar-components、view、feedback、comments、engagement 路由 chunks `10/10` 存在；该证据不替代 Cloudflare / wrangler runtime HAR。
  - 初始资产静态证据已补：`output/playwright/nexus-initial-asset-budget-2026-06-25.{json,md}`，docs/store/landing/auth route family 全部未超预算；该证据不替代 Cloudflare / wrangler runtime smoke。
  - public route asset budget 静态证据已补：`output/playwright/nexus-public-route-asset-budget-2026-06-28.{json,md}`，docs/store/landing/public-info/auth 共 `5` 个 route family、`468` 个静态 HTML 全部未超预算，CSS boundary finding `0`；该证据不替代 Cloudflare / wrangler production HAR。
  - 本地生产静态产物 HAR / screenshot smoke 已补：`output/playwright/nexus-local-prod-static-runtime-smoke-2026-06-28.{json,md}`，覆盖 `/`、`/next/`、`/store/`、docs detail、`/pricing/`、`/sign-in/`；该证据为 `PARTIAL`，landing 的 media abort 与 docs full-body `/api/docs/page` 404 来自静态 server 不执行 Worker API，仍需 Cloudflare / wrangler runtime HAR。
  - PWA precache trim 静态证据已补：`output/playwright/nexus-local-prod-pwa-precache-trim-2026-06-28.{json,md}`，`sw.js` precache 从 `1428` 条收敛到 `9` 条，docs route `456 -> 0`，route HTML-like `456 -> 0`，`_nuxt` chunk/asset `958 -> 0`（仅允许 `2` 条 Nuxt build metadata）；public routes 本地 HAR docs request `0`，不再出现千级 docs / `_nuxt` precache fan-out；`check-runtime-evidence` 也守卫 public route `_nuxt` / HTML-like / failed request 预算与 docs detail 静态 serving 预期 API 404 allowlist。该证据仍不替代 Cloudflare / wrangler runtime HAR。
  - Nuxt Content Cloudflare runtime 依赖 dist root `dump.app.sql`、`dump.docs.sql`、`dump.guides.sql` 初始化 D1；`trim-content-assets.mjs` 不再删除 root SQL dump，只删除 duplicate sqlite wasm，并守卫 root dump 与 `__nuxt_content/<collection>/sql_dump.txt` 内容一致。PWA 仍排除 `dump.*.sql`、`__nuxt_content/**`、sqlite/wasm runtime assets。
  - 本地 Wrangler Pages runtime smoke 已补：`output/playwright/nexus-wrangler-prod-runtime-smoke-2026-07-03.{json,md}`，使用本地 D1/KV/R2 bindings；API probes `8/8` OK（含 docs full body、docs navigation、auth session/providers、auth callback error boundary、dashboard auth boundary），route probes `8/8` OK（含 `/`、`/next/`、`/store/`、`/pricing/`、`/sign-in/`、docs detail、dashboard unauth shell、app auth callback shell），`sw.js` precache `9` 条、docs/route HTML/`_nuxt` chunk/content runtime entries 均 `0`，public route docs request `0`，单个 public route `_nuxt` asset 最大 `90`。`node build/check-runtime-evidence.mjs` 已可重复校验 local Wrangler 与 PWA JSON/MD/HAR evidence sidecars、Markdown 摘要关键数值、API payload / redirect budget、route-level 请求预算 / translation key leak 与当前 warning budget（2 个既有 hydration mismatch、未观察到真实 bfcache、public `_nuxt` 正常资产计数）；`node build/check-runtime-evidence.mjs --print-deployed-preview-template` / `check:runtime-evidence:template` 可打印最终 Cloudflare Pages preview evidence schema；`node scripts/collect-deployed-preview-evidence.mjs` / `collect:runtime-evidence:deployed` 默认 dry-run，显式 HTTPS `--base-url` 才采集 deployed preview route/API/HAR/bfcache 骨架，并拒绝本地或非 HTTPS base URL；`node build/check-runtime-evidence.mjs --require-deployed-preview` / `check:runtime-evidence:deployed` 已作为最终 production gate 预留，会强制要求 `nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD`、非本地 base URL、真实 provider callback、authenticated dashboard 与真实 bfcache hit。该证据为 local Wrangler preview，仍不替代 deployed Cloudflare Pages preview HAR、真实 provider callback 与 authenticated dashboard smoke。
  - docs bfcache lifecycle 静态证据已补：`output/playwright/nexus-docs-bfcache-lifecycle-guard-2026-06-28.{json,md}`，source 与重建后 client artifact 均确认 docs tracker `beforeunload` absent，`pagehide` / `visibilitychange` flush present；`build:analyze-worker` 也守卫 `452` 个 docs detail HTML 的初始 JS 不注册 `beforeunload`；仍需 production preview back/forward cache smoke。
  - 本地 docs -> store/pricing -> back smoke 已补在 `nexus-local-prod-static-runtime-smoke-2026-06-28` 与 `nexus-wrangler-prod-runtime-smoke-2026-07-03`：返回路径正确且 navigation type 为 `back_forward`，但 `pageshow.persisted=false`，未证明真实 bfcache 命中。
- sidebase auth runtime 已完成 guarded 收口：
  - Nuxt 仍保留 `@sidebase/nuxt-auth` server/authjs 能力与 `#auth` server import。
  - sidebase client plugin 与 named `auth` middleware 都在 Nuxt `app:resolve` / `app:templates` 阶段移出 app-side runtime，客户端显式 auth flow 走 `useNexusAuth()`。
  - `build:analyze-worker` 已守卫 `_nuxt` client JS 与 `sw.js`：`SessionRequired`、`nuxt-auth-app-side`、`useAuthState`、`navigateToAuthPages` 等 sidebase app-side marker 不得进入客户端产物。
  - `build:analyze-worker` 已守卫 runtime-only route chunks：`/api/auth/**`、`/api/auth/me`、`/api/app-auth/device/start`、`/api/app-auth/device/poll`、`/api/app-auth/device/approve` 必须存在于 Worker 产物。
  - 静态证据已补：`output/playwright/nexus-worker-runtime-route-guard-2026-06-25.{json,md}`，required worker route chunks `6/6` 通过；`output/playwright/nexus-sidebase-runtime-artifact-guard-2026-06-25.{json,md}` 扫描客户端 runtime 文件 `698` 个，sidebase app-side marker `0`，runtime route chunks `6/6`。
  - 本地 Wrangler smoke 已覆盖 `/api/auth/session`、`/api/auth/providers`、`/api/auth/callback/github?error=AccessDenied` 与 `/auth/app-callback/` shell；仍不替代真实 provider callback flow。
  - Auth handler 已改为模块级 singleton，避免每次 request 重建 `NuxtAuthHandler`；`build:analyze-worker` 已加入 source guard，本地 Wrangler auth probes 未再出现 `You setup the auth handler for a second time` 日志。
  - 守卫覆盖 public docs、`/sign-in`、OAuth callback、protected dashboard、`/team/join`、`/auth/admin-bootstrap` 与 header user menu。
- route matrix 二轮已完成静态路由单一来源：
  - `build/nexus-static-routes.mjs` 作为 production prerender 与 worker budget guard 的共享来源。
  - `/new`、`/login`、`/sign-in`、`/store`、docs API routes 等进入同一 public/static route matrix。
  - 本地 static dist route matrix smoke 已补：`output/playwright/nexus-static-route-matrix-2026-06-24.{json,md}`，`19/19` 路由 OK，sidebase marker `0`，CSS boundary finding `0`，docs detail 样本最大 HTML `20,347` bytes。
  - `/next` 已纳入 landing route-local locale chunk，避免 production hydration 后落回 `landing.hero.heading` 等 key；本地 Wrangler route smoke 中 `/next/` H1 为 `A local desktop Agent center, one touch away.`。
  - `build:analyze-worker` 已守卫 worker-owned app routes 不得被静态化：`/dashboard`、`/dashboard/team`、`/dashboard/admin/provider-registry`、`/dashboard/admin/governance`、`/auth/app-callback`、`/auth/stepup-callback`、`/auth/admin-bootstrap`、`/team/join`。
  - route ownership 静态证据已补：`output/playwright/nexus-worker-owned-route-matrix-2026-06-28.{json,md}`，worker-owned routes `8/8` 通过。
  - 桌面 / 移动 viewport 截图样本已补：home、store、docs detail、sign-in 首屏均可渲染；该证据仅代表 `apps/nexus/dist` 静态文件，不替代 Cloudflare / wrangler runtime。
- authenticated dashboard runtime 下限已补静态守卫：
  - `build:analyze-worker` 已守卫 dashboard smoke 代表性 API route chunks：`/api/dashboard/plugins`、`/api/dashboard/team`、`/api/dashboard/provider-registry/providers`、`/api/dashboard/governance/summary`、`/api/dashboard/storage/status`、`/api/dashboard/telemetry/me` 必须存在于 Worker 产物。
  - 静态证据已补：`output/playwright/nexus-dashboard-runtime-route-guard-2026-06-28.{json,md}`，dashboard runtime route chunks `6/6` 通过；该证据不替代 authenticated Cloudflare / wrangler dashboard runtime smoke。
  - 本地 Wrangler unauth boundary 已补：`/api/dashboard/team` 返回 `401`，`/dashboard/` shell 返回 `200` 并显示登录入口；authenticated dashboard runtime smoke 仍待真实 session。
- `/en/docs/dev/components/tabs` 当前关键状态：
  - 页面 200
  - 3.5s HAR 中 Assistant / dompurify / sonner / current-user profile graph 为 0
  - `typedPages=false` A/B 已证明不是 Nuxt dev macro 请求根因
  - 剩余共同慢点是 Nuxt dev macro scan、admin macro、auth page macro 与 `@sidebase/nuxt-auth` module-level client runtime
- pending / aireview 工作表：`../engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`

## 未完成

| 主题 | 状态 | 下一步 |
| --- | --- | --- |
| docs 文档内容加载 | guarded | docs detail static shell 已扩到全 docs；生产 SSR metadata-only、nav lazy fetch、deferred full-body Worker route chunks、build budget / HTML 抽样证据均已补。下一步继续拆可见区 demo / API table lazy boundary。 |
| AI review / aireview 未审批组件 | partial | 基于 pending 组件工作表，对组件按静态化、懒加载、首屏移出、模板合并、删除/后置分组处理。 |
| dev SSR TTFB / Nuxt macro | partial | 区分 Nuxt transform/cache、Content query/frontmatter fast path、i18n init、store memory init、auth/middleware 与 route payload。 |
| sidebase auth runtime | guarded | sidebase client plugin + named `auth` middleware 已移出客户端产物，explicit auth/protected routes 有静态守卫；local Wrangler 已覆盖 auth session/providers/callback error boundary 与 app callback shell，仍需真实 provider callback smoke。 |
| route matrix 二轮 | guarded | public/static routes 已合并到 `nexus-static-routes.mjs`；本地 static desktop/mobile smoke、worker-owned route matrix、dashboard runtime chunk guard、docs bfcache blocker artifact guard、local static back/forward smoke 与 local Wrangler route smoke 已补。仍需 deployed Cloudflare preview、authenticated dashboard 与 bfcache 命中实测。 |
| production chunk / payload / CSS | guarded | docs/store/dashboard/landing/public-info/auth source boundary、docs metadata-only payload、静态 route files、初始 JS/CSS budget、worker/dist budget、PWA precache trim、local static HAR/screenshot smoke 与 local Wrangler runtime smoke 已有守卫；仍需 deployed Cloudflare Pages preview HAR 作为最终结论。 |
| 首页 warnings | open | 单独定位 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope`，不混入 docs 文档批次。 |

## 下批建议顺序

1. 跑 deployed Cloudflare Pages preview HAR：先用 `cd apps/nexus && node scripts/collect-deployed-preview-evidence.mjs` dry-run 核对采集计划，再用 `--base-url https://<cloudflare-pages-preview-host>`、必要的 `--auth-state output/playwright/<storage-state>.json` 与真实 OAuth 回调摘要 `--provider-callback-evidence output/playwright/<provider-callback-evidence>.json` 采集 docs / store / dashboard / landing / `/new` / auth callback smoke，生成 `output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD.{json,md}` 与 HAR sidecars，然后跑 `cd apps/nexus && node build/check-runtime-evidence.mjs --require-deployed-preview` 作为 production 结论最终证据。
2. pending / aireview 页面继续按组件工作表分批拆 demo/report/preview lazy boundary。
3. dev SSR TTFB / Nuxt macro 深化。
4. 首页 warnings 单独收口。
5. Back/forward cache 与 authenticated dashboard 二轮实测。

## 验证要求

- 每批至少保留一份 Playwright/HAR 或等价静态证据。
- 文档内容加载优化必须对比 before / after 请求数、failed count、关键 runtime chunk、visible shell。
- production chunk/CSS 最终结论必须跑 production preview；当前仅能标记为 guarded，不能标记 done。
- 2026-07-04 Nexus-only 复验通过：`node apps/nexus/build/check-runtime-evidence.mjs`、`node apps/nexus/build/check-worker-bundle.mjs`、`cd apps/nexus && node build/check-server-api-route-tree.mjs`、targeted `vitest` 53 tests、`nuxt typecheck`、`git diff --check -- "apps/nexus" "docs/plan-prd/TODO-nexus.md"`。
- `git diff --check` 必须通过。
