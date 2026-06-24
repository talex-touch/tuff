# Nexus Performance TODO

> 更新时间：2026-06-24
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
  - `pnpm -C "apps/nexus" run build:analyze-worker`：`dist total=36.20 MiB`，worker executable JS `8.93 MiB`，gzip `2.14 MiB`，worker JS 文件 `649` 个，静态路由排除 `19` 条通过。
  - `build:analyze-worker` 现在同时守卫 route files、docs detail HTML payload、docs/store/landing/auth CSS boundary、public route-family 初始 JS/CSS budget 与 HTML 初始资产引用断链；当前静态路由文件 `19/19` 通过。
  - docs detail HTML 全量守卫：`452` 个 docs detail page 最大约 `19.9 KiB`，无 full body marker，无 `/api/docs/navigation` payload；`/docs` 与 `/docs/index` 作为完整 SSR 例外保留。
  - 初始资产静态证据已补：`output/playwright/nexus-initial-asset-budget-2026-06-25.{json,md}`，docs/store/landing/auth route family 全部未超预算；该证据不替代 Cloudflare / wrangler runtime smoke。
- sidebase auth runtime 已完成 guarded 收口：
  - Nuxt 仍保留 `@sidebase/nuxt-auth` server/authjs 能力与 `#auth` server import。
  - sidebase client plugin 与 named `auth` middleware 都在 Nuxt `app:resolve` / `app:templates` 阶段移出 app-side runtime，客户端显式 auth flow 走 `useNexusAuth()`。
  - `build:analyze-worker` 已守卫 `_nuxt` client JS 与 `sw.js`：`SessionRequired`、`nuxt-auth-app-side`、`useAuthState`、`navigateToAuthPages` 等 sidebase app-side marker 不得进入客户端产物。
  - `build:analyze-worker` 已守卫 runtime-only route chunks：`/api/auth/**`、`/api/auth/me`、`/api/app-auth/device/start`、`/api/app-auth/device/poll`、`/api/app-auth/device/approve` 必须存在于 Worker 产物。
  - 静态证据已补：`output/playwright/nexus-worker-runtime-route-guard-2026-06-25.{json,md}`，required worker route chunks `6/6` 通过；`output/playwright/nexus-sidebase-runtime-artifact-guard-2026-06-25.{json,md}` 扫描客户端 runtime 文件 `698` 个，sidebase app-side marker `0`，runtime route chunks `6/6`。
  - 上述证据不替代 Cloudflare / wrangler runtime auth callback smoke。
  - 守卫覆盖 public docs、`/sign-in`、OAuth callback、protected dashboard、`/team/join`、`/auth/admin-bootstrap` 与 header user menu。
- route matrix 二轮已完成静态路由单一来源：
  - `build/nexus-static-routes.mjs` 作为 production prerender 与 worker budget guard 的共享来源。
  - `/new`、`/login`、`/sign-in`、`/store`、docs API routes 等进入同一 public/static route matrix。
  - 本地 static dist route matrix smoke 已补：`output/playwright/nexus-static-route-matrix-2026-06-24.{json,md}`，`19/19` 路由 OK，sidebase marker `0`，CSS boundary finding `0`，docs detail 样本最大 HTML `20,347` bytes。
  - 桌面 / 移动 viewport 截图样本已补：home、store、docs detail、sign-in 首屏均可渲染；该证据仅代表 `apps/nexus/dist` 静态文件，不替代 Cloudflare / wrangler runtime。
- `/en/docs/dev/components/tabs` 当前关键状态：
  - 页面 200
  - 3.5s HAR 中 Assistant / dompurify / sonner / current-user profile graph 为 0
  - `typedPages=false` A/B 已证明不是 Nuxt dev macro 请求根因
  - 剩余共同慢点是 Nuxt dev macro scan、admin macro、auth page macro 与 `@sidebase/nuxt-auth` module-level client runtime
- pending / aireview 工作表：`../engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`

## 未完成

| 主题 | 状态 | 下一步 |
| --- | --- | --- |
| docs 文档内容加载 | guarded | docs detail static shell 已扩到全 docs；生产 SSR metadata-only 与 nav lazy fetch 已有 build budget / HTML 抽样证据。下一步继续拆可见区 demo / API table lazy boundary。 |
| AI review / aireview 未审批组件 | partial | 基于 pending 组件工作表，对组件按静态化、懒加载、首屏移出、模板合并、删除/后置分组处理。 |
| dev SSR TTFB / Nuxt macro | partial | 区分 Nuxt transform/cache、Content query/frontmatter fast path、i18n init、store memory init、auth/middleware 与 route payload。 |
| sidebase auth runtime | guarded | sidebase client plugin + named `auth` middleware 已移出客户端产物，explicit auth/protected routes 有静态守卫；仍需 production preview 中跑登录/callback smoke。 |
| route matrix 二轮 | guarded | public/static routes 已合并到 `nexus-static-routes.mjs`；本地 static desktop/mobile smoke 已补。仍需 production preview、authenticated dashboard 与 back/forward cache 实测。 |
| production chunk / payload / CSS | guarded | docs/store/dashboard/landing/auth source boundary、docs metadata-only payload、静态 route files、初始 JS/CSS budget 与 worker/dist budget 已有守卫；仍需 production preview HAR 作为最终结论。 |
| 首页 warnings | open | 单独定位 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope`，不混入 docs 文档批次。 |

## 下批建议顺序

1. 跑 production preview HAR：docs / store / dashboard / landing / `/new` / auth callback smoke，作为 production 结论最终证据。
2. pending / aireview 页面继续按组件工作表分批拆 demo/report/preview lazy boundary。
3. dev SSR TTFB / Nuxt macro 深化。
4. 首页 warnings 单独收口。
5. Back/forward cache 与 authenticated dashboard 二轮实测。

## 验证要求

- 每批至少保留一份 Playwright/HAR 或等价静态证据。
- 文档内容加载优化必须对比 before / after 请求数、failed count、关键 runtime chunk、visible shell。
- production chunk/CSS 最终结论必须跑 production preview；当前仅能标记为 guarded，不能标记 done。
- `git diff --check` 必须通过。
