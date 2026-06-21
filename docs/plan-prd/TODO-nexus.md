# Nexus Performance TODO

> 更新时间：2026-06-21
> 范围：`apps/nexus` 文档站、生态站、Dashboard、Provider Registry、Data Governance 与公开控制台的性能收口。
> 当前状态：Nexus 第 46 批 docs pending / Nuxt macro evidence 已完成 Playwright CLI screenshot/HAR/Markdown/JSON、Node fetch smoke 与文档回填；本批先验证第 45 批后的 `typedPages` 假设，A/B 证明关闭 `experimental.typedPages` 并不会减少 `/en/docs/dev/components/tabs` 的 Nuxt dev `?macro=true` 请求，因此配置已恢复，不落无收益代码改动。随后抽样 `tabs`、`auto-sizer`、`scroll`：三页 status 200、failed 0、`body=1` 0、demo registry 0、Assistant/dom 0、sonner 0、current-user profile graph 0；剩余共同慢点是 Nuxt dev 全页面 macro 扫描 61 条、admin macro 15 条、auth page macro 3 条，以及 `@sidebase/nuxt-auth` 模块级 client runtime 12 条。正式 pending / aireview 组件性能工作表已落到 `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`。当前扫描 216 个本地化组件文档、108 个组件条目，按 `syncStatus != reviewed || verified != true` 口径得到 76 个 pending 组件条目；后续 docs 文档内容加载、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、sidebase auth runtime 拆分、生产 chunk / payload / CSS 复核全部从本文任务树领取，不再从聊天上下文临时恢复范围。

## Goal 原句

```text
/goal 1. 扫描整个 nexus 优化性能 你自行测试各种报告啥的 目前加载超级缓慢！ 我希望每个页面切换都很快 而且固定各种模板 拆分 该静态的静态
2. 各种文档加载也特别慢 对应目前 aireview 组件还没有审批完的全部都要好好优化一下 依次修复 分批做提交 做截图+性能加载 playwright 分析报告等！
```

本次收尾追加要求：

```text
做完当前批 后续 docs 文档内容 aireview 等相关的 全部都丢到 TODO-nexus.md 快速完成当前任务收尾 丢到 md 的还有当前 goal 原句 相关内容 子任务等 详细丢进去
```

补充触发页：

- `http://localhost:3200/en/docs/dev/components/tabs`
- 当前本地验证 dev server：第 18 批使用 `http://localhost:3210`，历史触发页原端口为 `http://localhost:3200`。
- 第 19 批本地验证 dev server：`http://localhost:3211`。
- 第 20 批本地验证 dev server：`http://localhost:3212`。
- 第 21 批本地验证 dev server：`http://localhost:3213`。
- 第 22 批本地验证 dev server：`http://localhost:3200`。
- 第 28 批本地验证 dev server：`http://localhost:3214`。
- 第 30 批本地验证 dev server：`http://localhost:3200`。
- 第 33 批本地验证 dev server：`http://127.0.0.1:3216`；注意 `pnpm -C "apps/nexus" run dev -- --host 127.0.0.1 --port 3215` 会被 package script 固定到 3200 且本轮曾返回 Nuxt Welcome，不能作为 Nexus 性能证据。
- 第 34 批本地验证 dev server：`http://127.0.0.1:3217`。
- 第 38 批本地验证 dev server：`http://127.0.0.1:3219`。
- 第 39 批本地验证 dev server：`http://127.0.0.1:3220`。
- 第 41 批 baseline dev server：`http://127.0.0.1:3222`；after dev server：`http://127.0.0.1:3223`。
- 第 42 批 baseline dev server：`http://127.0.0.1:3224`；after dev server：`http://127.0.0.1:3225`。
- 第 43 批本地验证 dev server：`http://127.0.0.1:3226`。
- 第 44 批本地验证 dev server：`http://127.0.0.1:3227`。
- 第 45 批本地验证 dev server：`http://127.0.0.1:3228`。
- 第 46 批本地验证 dev server：`http://127.0.0.1:3229`。

## 当前批收尾冻结（第 45 批 docs aside shell evidence / TODO handoff）

本批目的：按用户最新要求快速完成当前任务收尾；先用 Playwright/HAR 验证第 44 批后的 `share/engagement/comment/right rail` 余项，确认右侧 assistant shell 没有进入 tabs 首访图谱后，不做无收益代码改动，只把后续 docs 文档内容、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、production chunk / payload / CSS 复核和首页 warning 全部固定到本文，不继续混入更多 pending 逐页拆分。

后续领取入口固定如下：

- P0-1 `docs 文档内容加载继续拆分`：固定 docs template 静态壳、审计 `body=0` payload 字段、复核 components index/detail 共用模板、继续拆可见区 demo / API table lazy boundary。
- P0-2 `AI review / aireview 未审批组件优化`：以 `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md` 为工作表，继续对 76 个 pending 组件分组为可静态化、可懒加载、应移出首屏、应合并模板、应删除或后置。
- P0-3 `dev SSR TTFB 深化`：覆盖 `/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect，区分 Nuxt transform/cache、Content query/frontmatter fast path、i18n init、store memory init、auth/middleware 与 route payload；第 45 批确认 right rail shell / Assistant 不在 tabs 3.5s 首访 HAR 内，下一刀优先看 Nuxt dev `?macro=true` 全页面 meta 扫描、route manifest transform、docs layout/page setup 仍需同步 import 的非首屏图谱。
- P0-4 `全站 route matrix 二轮`：补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` Playwright screenshot/HAR。
- P1-1 `production chunk / payload / CSS 复核`：检查 docs/store/dashboard/landing 是否互相污染；若存在，优先修 import boundary、layout boundary 或 component registration；第 44 批已将 `vue-sonner` 从 docs 首访 HAR 清零，第 45 批确认 docs right rail shell 不进首访图谱，后续继续查其它 CSS/chunk 污染。
- P1-2 `首页剩余 warning`：单独定位 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope`，不混入 docs 文档批次。

当前批验证边界：

- 只允许改动 `docs/plan-prd/TODO-nexus.md`；第 45 批为 evidence-driven docs-only 收尾，不新增业务代码、不新增测试脚手架。
- `output/playwright/` 继续只作为 ignored evidence 引用目录，不纳入提交。
- Nexus 相关代码文件保持第 44 批后的状态；CoreApp / AI dirty files 属于其它任务，不混入本批。
- 当前 goal 原句、触发页、已完成批次、子任务百分比、Playwright/HAR/Markdown/JSON 证据路径、后续任务树均已在本文保留。

## 当前进度

- 本轮 tabs/card 文档链路：约 99%。触发页 `/en/docs/dev/components/tabs` 已修复 500 风险、full-body 抢首屏、组件侧栏链接晚出现、一批 dev route-local CSS 污染、dev-only Vue Devtools bridge 请求、PWA dev client plugin 抢首屏问题，并将右侧 DocsOutline、DocsAsideCardsShell、pending 文档 AI notice、无 code 页面 code block renderer/CSS、docs 主正文 MDC Prose wrapper、Nuxt Content global Prose registry、pending 文档后半段正文、code copy header、toast feedback、公开 docs auth/profile graph、legacy sonner CSS 从首屏重型路径拆出；第 45 批复核 3.5s HAR 确认 aside shell / assistant / dompurify 不进入 tabs 首访图谱；第 46 批确认 `typedPages` 不是 macro 请求根因，并把 `@sidebase/nuxt-auth` 模块级 client runtime 单独拆成下一刀候选。
- 整体 goal 估算：约 96.5%。已完成 docs 路由关键路径止血、一批 dev 模式请求削减、首页 hydration/warning 止血、全站 route matrix 首轮基线、route-local dev runtime dependency reload 止血、`/` / `/new` zh landing route-local locale warning 修复、dev SSR 组件文档 metadata-first 首访、sidebar / pager full-body prefetch 可取消化、component docs dev metadata fast path、docs Assistant 上下文按需构建，`fusion` / `card` pending 长文档后半段 client deferred render，`avatar-variants` 单章节大 demo fallback split，`glass-surface` / `base-anchor` / `select` / `radio` 这类 `migrated + verified` strict pending 页面 deferred body 覆盖，`card` 首屏第二个 demo shell 后置，docs code-block copy header 原生 DOM 化，docs toast feedback 用户意图后加载，public docs auth/profile graph 按 protected route 动态加载，legacy sonner CSS 从 docs 首访清零，right rail shell 假设已用 HAR 排除，`typedPages` no-op 已排除，`auto-sizer` / `scroll` 最新 pending 抽样 failed 0、body=1 0、demo registry 0；后续仍需系统性覆盖剩余 AI review / aireview 未审批组件、dev SSR TTFB / Nuxt macro / sidebase auth runtime 深化、生产构建 chunk/CSS 复核与文档模板静态化。
- 已完成：docs sidebar metadata 延迟加载、docs metadata 避免全量 MDC 解析、i18n locale messages 懒加载、docs highlight 全局插件移除、route-local locale messages 拆分、dev SSR route-local stylesheet 过滤、docs full-body 请求与预取 idle 调度、组件侧栏 metadata 从 8s 延迟改为水合后短延迟、组件侧栏 full-body 预取可取消化、docs route 过滤 new/asset-create/version drawer 类无关 stylesheet、dev 模式 `@vue/devtools-api` noop bridge、DocsOutline 首屏懒挂载、DocsAsideCardsShell 占位按钮 + idle 延迟挂载、AI notice 静态化且不再 eager mount aside cards / shell、code block renderer/style 从无代码文档首屏拆出、docs 主正文禁用默认 MDC Prose 全量映射并保留 heading anchors、Nuxt Content global Prose registry 过滤、policy 页面显式 native prose、普通 dev 模式 PWA module gate 与 `VitePwaManifest` wrapper、首页 sticky attrs warning 修复、waitlist aurora SSR hydration mismatch 修复、`@vueuse/core` / `marked` / `echarts/*` / `dompurify` dev 预打包、locale 切换前预合并当前 route 需要的 route-local message chunk、dev SSR 组件文档 metadata-first、component docs dev `body=0` metadata frontmatter fast path、docs Assistant context 按需构建、pending 长文档后半段渲染延迟到用户意图或静置后、docs code header 原生 DOM 客户端增强、docs toast feedback 动态加载、公开 docs auth/profile graph 延迟到 authenticated protected route、legacy `vue-sonner` 迁移到自研 toast host。
- 当前第 46 批只做 typedPages no-op、pending `auto-sizer` / `scroll` 抽样和 sidebase runtime evidence，不继续混入首页 WebGL warning 修复、production chunk/CSS 复核、认证模块重构或 pending 逐页 demo/API 二刀。后续全部进入 TODO 队列：`@sidebase/nuxt-auth` client plugin 拆分/门控、重型 demo / report / preview lazy boundary、首页 WebGL / lifecycle warning、dev SSR TTFB / Nuxt macro 继续深化、生产构建 chunk 污染复核、全站页面切换矩阵二轮。

## 子任务百分比快照

| 子任务 | 当前进度 | 说明 |
| --- | ---: | --- |
| 当前第 46 批 docs pending / macro evidence | 100% | 3229 dev server tabs / auto-sizer / scroll 3.5s HAR：status 200，failed 0，`body=1` 0，demo registry 0，Assistant/dom 0，sonner 0，current-user 0；tabs requests 416/415/35，auto-sizer 417/416/35，scroll 417/416/35。`typedPages=false` A/B 对 tabs 仍为 requests 425、scripts 405、styles 40、macro 61、adminMacro 15，确认不是有效优化方向；新候选为 Nuxt dev macro 61 条与 `@sidebase/nuxt-auth` module-level client runtime 12 条。本批不改业务代码。 |
| 当前第 45 批 docs aside shell evidence / TODO handoff | 100% | 3228 dev server tabs 3.5s HAR：status 200、requests 425、scripts 405、styles 40、failed 0、DocsAsideCardsShell 0、DocsAsideCards 0、Assistant 0、TxMarkdownView 0、dompurify 0、sonner 0、authGraph 0；2 条 comments/analytics match 是 Nuxt dev `?macro=true` 页面 meta 扫描，已转后续 dev SSR / route macro 专项。本批不改业务代码。 |
| 当前第 44 批 legacy sonner boundary | 100% | sign-in / admin bootstrap 从 `vue-sonner` 迁到自研 `useToast`，移除 sign-in `vue-sonner/style.css` / `Toaster`，并从 Vite dev pre-bundle 移除 `vue-sonner`；tabs after status 200、requests 425、scripts 268、styles 39、sonnerRequests 0、authGraphRequests 0、failed 0。 |
| 当前第 43 批 public docs auth/profile graph | 100% | docs 页不再调用 `useAuthUser({ fetchOnAuth: false, server: false })`，admin 状态改读 shared `auth-user`；app root 仅在 authenticated protected route 后动态 import `fetchCurrentUserProfile`；locale orchestrator 也改为 profile sync / patch 时动态 import current-user API。tabs after status 200、requests 463、authGraphRequests 0、failed 0；`vue-sonner` CSS 仍出现 2 条，已转后续独立项。 |
| 当前第 42 批 docs toast intent | 100% | 移除 docs 页 setup 顶层 `useToast()`，copy/share 后动态 import；tabs after status 200、requests 461、failed 0、toastRequests 0，4 个 warning 为既有 WebGL ReadPixels；`context-menu` code copy 点击后 `toastRequestsAfterClick 1`、toast visible true、7 个 code header/copy button 正常。 |
| 当前第 41 批 dev SSR TTFB 二轮 | 100% | baseline 3222 / after 3223 fresh-server 对比：tabs cold TTFB 4128ms -> 3083ms（25.3%），home 1145ms -> 903ms，store 860ms -> 666ms，sign-in 323ms -> 244ms，dashboard 145ms -> 106ms；Playwright after 覆盖 tabs/home/store/sign-in/dashboard，tabs failed/warnings/errors 0；`context-menu` code header smoke 确认 7 个 code header / copy button 正常生成。 |
| 当前第 40 批 docs-only 收尾冻结 | 100% | 按用户最新要求，把当前 goal 原句、追加收尾要求、触发页、已完成批次、docs 文档内容加载、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、首页 warning、production chunk / payload / CSS 复核和下一批领取边界全部固定到本文；本批不扩业务代码、不新增 Playwright artifact。 |
| 当前第 39 批 strict pending verified 抽样 | 100% | 抽样 `base-anchor` / `select` / `radio`，三页均 initial shell true、initial demos 1、props nodes 0、after deferred true、failed/warnings/errors 0；`tabs` 对照页 shell false，说明第 36/38 批通用规则覆盖更多 `migrated + verified` 页面。 |
| 当前第 38 批 pending demo/API 二刀 | 100% | Playwright-core baseline 证明 `fusion` / `card` API/Props 表首屏节点为 0，demo registry/chunks 为 0；本批只收紧 pending split 点到第二个 demo/API boundary，使 `card` initial demo shells 2 -> 1，`fusion` 保持 1，`tabs` 保持 shell false。 |
| 当前第 37 批 TODO-nexus docs-only 收尾 | 100% | 按用户最新要求，把当前 goal 原句、追加收尾要求、已完成批次、docs 文档内容加载、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核和下一批领取边界全部固定到本文；本批不扩业务代码、不新增 Playwright artifact。 |
| 当前第 36 批 strict pending deferred body | 100% | 将 `syncStatus != reviewed || verified != true` 的 strict pending 口径用于性能 deferred body；`glass-surface` 初始 shell false -> true，initial API/Props false，滚动后 deferred true/API true；`tabs` 仍 shell false，未误伤 reviewed+verified 页面。 |
| 当前第 35 批 docs-only 收尾 | 100% | 按用户最新要求，把当前 goal 原句、追加收尾要求、触发页、真实批次提交、docs 文档内容加载、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核和下一批领取顺序全部固定到本文；本批不扩业务代码、不新增 Playwright artifact。 |
| 当前第 34 批 pending single-section demo fallback split | 100% | `avatar-variants` 顶层只有一个 `h2 Gallery`，第 34 批用首个 demo/API 自定义节点 fallback 切分；initial demo title true -> false、demo-like nodes 22 -> 0，滚动后恢复 22。 |
| 当前第 33 批 pending docs deferred body sections | 100% | `fusion` / `card` 后半段正文在 dev/client 下延迟到用户意图或 3.2s 静置后挂载；Playwright/CDP after 证明初始 API text 为 false、滚动后为 true，failed / warnings / errors 均为 0。 |
| 当前第 32 批 pending / aireview 工作表 | 100% | 正式工作表已落到 `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`；Top 30 记录 sync/verified、正文体量、demo/code/API、已有 Playwright 请求数和下一步动作。 |
| 当前第 30 批 docs assistant context on intent | 100% | docs Assistant context 只在用户打开 Assistant 时通过 shared request state 触发构建；普通 tabs/fusion 首访 `assistantRequests 0`、`dompurifyRequests 0`，点击 Assistant 可打开且不再触发 `dompurify` runtime discovery。 |
| 当前第 31 批 docs-only TODO 收尾 | 100% | 按用户最新要求，当前 goal 原句、追加要求、后续 docs 文档内容、AI review / aireview、route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核全部固定到本文；本批不扩业务代码、不新增 Playwright artifact。 |
| 当前第 29 批 docs-only 收尾 | 100% | 按用户最新要求，确认后续 docs 文档内容、AI review / aireview、route matrix、dev SSR TTFB、生产 chunk / payload / CSS 复核全部落到本文任务树；本批只修正交接状态与领取边界，不扩业务代码。 |
| 当前第 28 批 component docs metadata fast path | 100% | dev 环境下 `/docs/dev/components/**` 的 `body=0` metadata 请求优先读取本地 Markdown frontmatter；API test 证明不再调用 Nuxt Content query / MDC parse，非组件 docs metadata 仍走 Nuxt Content。 |
| 当前第 27 批 docs-only 最终交接 | 100% | 按用户最新要求，当前 goal 原句、追加收尾要求、触发页、已完成批次、性能证据路径、后续 docs / aireview / route matrix / TTFB / chunk 复核子任务和领取规则全部沉淀到本文；本批不继续扩代码。 |
| 当前第 26 批 docs pager full-body prefetch cancel | 100% | 页面底部 Prev / Next pager 现在立即预热 route + `body=0` metadata，full `body=1` 只有持续 hover/focus/touch 意图后进入 idle，并可由 blur / mouseleave / route change / unmount 取消；短 hover after `hoverBody1` 从 1 -> 0。 |
| 当前第 25 批 docs-only 收尾归档 | 100% | 按用户追加要求，把当前 goal 原句、追加收尾要求、触发页、已完成批次、子任务百分比、后续 docs / aireview / route matrix / TTFB / chunk 复核任务和验收口径集中到本文；当前批不继续扩大代码改动。 |
| 当前第 24 批 component docs scoped navigation | 100% | `/en/docs/dev/components/tabs` SSR async-data key 从 `docs-navigation:en` 改为 `docs-navigation:en:components`；navigation API `all -> components` wire bytes 49291 -> 16786，节点 244 -> 110；tabs HTML 107061 -> 86611 bytes；Playwright after failed 0。 |
| 当前第 23 批 TODO 收尾 | 100% | 本批只更新 `docs/plan-prd/TODO-nexus.md`，把当前 goal 原句、用户追加收尾要求、已完成批次、后续 docs / aireview / 矩阵 / chunk / TTFB 子任务和验收口径集中到本文，作为下一轮唯一入口。 |
| 当前第 22 批 sidebar full-body prefetch cancel | 100% | 已完成代码、focused test、scoped ESLint、`git diff --check`、production build sanity、Playwright CLI baseline/after screenshot/HAR/Markdown 报告；`scroll` 1.8s 首访窗口内 `body=1` 从 1 -> 0，demo registry/client renderer 仍为 0。 |
| `/en/docs/dev/components/tabs` 触发链路 | 99% | 页面 200；第 24 批后 tabs SSR payload 不再携带 guide/api/architecture 全量导航分支；第 41 批将 tabs fresh-server cold TTFB 4128ms -> 3083ms，warm 24-31ms；第 43 批确认 auth/profile graph request 为 0；第 44 批确认 sonner requests 为 0；第 45 批确认 aside shell / assistant / dompurify requests 为 0；剩余是 Nuxt dev macro/runtime、`node_modules`、docs demo 模块碎片和 production chunk/CSS 复核。 |
| docs 内容加载拆分 | 98% | `body=0` / idle `body=1` 已落地；第 21 批把 dev SSR 组件文档首访切到 metadata-first，production SSR 保持 full body；第 22 / 26 批把 sidebar 与 pager full-body 预取改为可取消；第 24 批把 component docs navigation SSR async-data 缩到 components 分支；第 28 批把 component docs dev `body=0` metadata 请求切到 frontmatter fast path；第 30 批把 Assistant context 抽文本后置到用户意图；第 33 批把 pending 长文档后半段渲染后置到用户意图或静置后；第 34 批补上单章节大 demo fallback split；第 36 批补上 strict pending verified 页面；第 38 批补上首段多 demo 的 second-boundary split；第 41 批把 code-block copy header 从 SSR Vue render graph 拆成客户端原生 DOM 增强；第 42 批把 toast feedback 移到 copy/share 用户意图后；第 43 批把 public docs auth/profile graph 移出首访；第 44 批把 legacy sonner CSS 移出首访；第 45 批确认 right rail 非首屏图谱未污染 tabs；模板静态 shell、production CSS/chunk 与更多页面复核仍待做。 |
| AI review / aireview 未审批组件 | 62% | 已完成 pending 口径、高风险文档清单、正式 Top 30 工作表、fusion/card/avatar-variants/tabs Playwright baseline、gradual-blur/auto-sizer/scroll baseline、glass-surface/base-anchor/select/radio baseline/after、AI notice eager mount 修复、无代码 pending 页 code block renderer eager load 修复、pending 长文档 MDC Prose wrapper / global Prose registry / PWA dev client 削减、dev SSR metadata-first、sidebar / pager full-body 预取可取消化、component docs metadata fast path、Assistant context 按需构建、fusion/card section-level deferred render、avatar-variants 单章节大 demo deferred render、strict pending verified 页面 deferred render、card 首段第二个 demo 后置、right rail 首访污染排除；剩余 pending 页面逐页 demo/模板/section split 待做。 |
| 全站页面切换矩阵 | 42% | 第 18 批已覆盖 `/`、`/en/docs`、tabs、card、`/store`、dashboard redirect、Provider Registry redirect、Data Governance redirect、home -> store；第 19 批补了 home/store/sign-in/dashboard-overview/docs-tabs；第 20 批补了 zh landing home；第 21 批补了 fusion/card/avatar-variants/tabs baseline/after；第 22 批补了 gradual-blur/auto-sizer/scroll baseline/after screenshot/HAR；第 41 批补了 dev SSR TTFB 二轮 `/`、`/store`、tabs、`/sign-in`、未登录 dashboard redirect 的 curl 与 Playwright after；第 43 批补了 tabs auth/profile graph screenshot/HAR；第 44 批补了 tabs sonner boundary screenshot/HAR；第 45 批补了 tabs aside shell / macro scan evidence。下一步要做 authenticated dashboard、移动端和 production preview 口径。 |
| 生产构建 chunk 复核 | 25% | 第 10/11/12/13/14/15/16/17/18/19/20/21/22/24/26/28/30 批均已通过 production build sanity；第 33 批为 dev/client-only section split，未重跑 production build；完整 chunk/payload/CSS 深查待做。 |
| TODO 与交接文档 | 100% | 当前 goal 原句、批次、证据路径、后续子任务已沉淀在本文。 |

## 已完成批次

| 批次 | 提交 | 内容 | 状态 |
| --- | --- | --- | --- |
| 1 | `1d324e031` | `perf(nexus): defer docs sidebar metadata` | 已完成 |
| 2 | `0764e15c9` | `perf(nexus): avoid full mdc parse for docs metadata` | 已完成 |
| 3 | `791d408dc` | `perf(nexus): lazy load i18n locale messages` | 已完成 |
| 4 | `fe129d49e` | `perf(nexus): remove global docs highlight plugin` | 已完成 |
| 5 | `3213bcba0` | `perf(nexus): split route-local locale messages` | 已完成 |
| 6 | `ec0d41e29` | `perf(nexus): filter route-local dev stylesheets` | 已完成 |
| 7 | `e46541119` | `perf(nexus): defer docs full body prefetch` | 已完成 |
| 8 | `15f2d288c` | `perf(nexus): load component sidebar metadata sooner` | 已完成 |
| 9 | `926ae0818` | `perf(nexus): filter more docs dev stylesheets` | 已完成 |
| 10 | `a8b21aaae` | `perf(nexus): noop vue devtools api in dev` | 已完成 |
| 11 | `5fb01c7ba` | `perf(nexus): lazy mount docs outline` | 已完成 |
| 12 | `468b1ae63` | `perf(nexus): lazy mount docs aside shell` | 已完成 |
| 13 | `ff2c69610` | `perf(nexus): keep docs ai notice static` | 已完成 |
| 14 | `7a5e8be14` | `perf(nexus): lazy load docs code block renderer` | 已完成 |
| 15 | `2026db6d8` | `perf(nexus): use native docs prose tags` | 已完成 |
| 16 | `9e2d0145c` | `perf(nexus): filter mdc prose globals` | 已完成 |
| 17 | `6ee64dc98` | `perf(nexus): gate pwa module in dev` | 已完成 |
| 18 | `ec2202497` | `perf(nexus): stabilize landing route matrix` | 已完成 |
| 19 | `090f4a818` | `perf(nexus): prebundle route local dev deps` | 已完成 |
| 20 | `a5285a4bd` | `perf(nexus): preload route locale chunks on locale switch` | 已完成 |
| 21 | `3c6975c35` | `perf(nexus): split dev ssr component docs body` | 已完成 |
| 22 | `60e5d952a` | `perf(nexus): cancel sidebar full body prefetch` | 已完成 |
| 23 | docs-only | `docs(nexus): record current goal handoff` | 已完成 |
| 24 | `1075acd34` | `perf(nexus): scope component docs navigation` | 已完成 |
| 25 | `8bd9a9c51` | `docs(nexus): archive performance followups` | 已完成 |
| 26 | `1c54878ba` | `perf(nexus): cancel docs pager full body prefetch` | 已完成 |
| 27 | docs-only | `docs(nexus): finalize performance handoff` | 已完成 |
| 28 | `68f8266be` | `perf(nexus): fast path component docs metadata` | 已完成 |
| 29 | docs-only | `docs(nexus): consolidate performance followups` | 已完成 |
| 30 | `a067e140f` | `perf(nexus): build docs assistant context on intent` | 已完成 |
| 31 | docs-only | `docs(nexus): record nexus performance followups` | 已完成 |
| 32 | `0e9715e9d` | `docs(nexus): add pending component worktable` | 已完成 |
| 33 | `4793a0240` | `perf(nexus): defer pending docs body sections` | 已完成 |
| 34 | `03de407dd` | `perf(nexus): defer single-section docs demos` | 已完成 |
| 35 | `15df6cca1` | `docs(nexus): finalize performance TODO handoff` | 已完成 |
| 36 | `bf4b46692` | `perf(nexus): defer strict pending docs sections` | 已完成 |
| 37 | docs-only | `docs(nexus): finalize docs aireview todo` | 已完成 |
| 38 | `da283b466` | `perf(nexus): tighten pending docs demo split` | 已完成 |
| 39 | `929b850a2` | `docs(nexus): record strict pending verified sample` | 已完成 |
| 40 | `00123227f` | `docs(nexus): freeze performance followups` | 已完成 |
| 41 | `3d2a0d549` | `perf(nexus): simplify docs code headers` | 已完成 |
| 42 | `6475b8e23` | `perf(nexus): load docs toast on intent` | 已完成 |
| 43 | `7446f9e4b` | `perf(nexus): defer public docs auth profile graph` | 已完成 |
| 44 | `9e4d2a8bb` | `perf(nexus): remove legacy sonner from docs graph` | 已完成 |
| 45 | docs-only | `docs(nexus): record aside shell performance handoff` | 已完成 |

## 本轮收尾结论

- `/en/docs/dev/components/tabs` 当前页切换已从“切换时立即竞争 full-body Markdown parse / sidebar full-body prefetch”改为“先轻 metadata，后 idle full body”。
- 第 7 批已提交：`e46541119 perf(nexus): defer docs full body prefetch`。
- 第 9 批已提交：`926ae0818 perf(nexus): filter more docs dev stylesheets`。
- 第 10 批已提交：`a8b21aaae perf(nexus): noop vue devtools api in dev`。
- 第 11 批已提交：`5fb01c7ba perf(nexus): lazy mount docs outline`；右侧 `DocsOutline` 从首屏同步挂载改为轻量 skeleton 壳 + idle 延迟挂载，移动端目录按钮仍立即挂载真实 outline。
- 第 12 批已提交：`468b1ae63 perf(nexus): lazy mount docs aside shell`；右侧 `DocsAsideCardsShell` 从首屏同步 import 改为 `LazyDocsAsideCardsShell` + 轻量占位按钮 + idle 延迟挂载，占位按钮点击仍可立即打开 Assistant。
- 第 13 批已提交：`ff2c69610 perf(nexus): keep docs ai notice static`；migrated / 未 verified 组件文档的 AI notice 改由 docs layout 静态渲染，不再为了 notice 提前挂载 `DocsAsideCards` / `DocsAsideCardsShell`。
- 第 14 批已提交：`7a5e8be14 perf(nexus): lazy load docs code block renderer`；`TuffCodeBlock` 改为无样式 async shell，真实 renderer/highlight/mermaid/CSS 只在真实 code block 或 demo code 展开时加载。
- 第 15 批已提交：`2026db6d8 perf(nexus): use native docs prose tags`；docs 主正文 `ContentRenderer` 禁用默认 Prose 全量映射，用轻量 heading wrapper 保留锚点，减少一批 MDC prose dev requests。
- 第 16 批已提交：`9e2d0145c perf(nexus): filter mdc prose globals`；Nuxt Content 生成的默认 MDC Prose global components 已从 component registry 过滤，`tabs` / `fusion` / `card` / policy 页面 clean first visit 均为 `mdcProse 0`。
- 第 17 批已提交：`6ee64dc98 perf(nexus): gate pwa module in dev`；普通 dev 不再加载 `@vite-pwa/nuxt` 与 `pwa.client`，根组件改用 `NexusPwaManifest` wrapper，production / `dev:pwa` 保持 PWA manifest 行为，并修复禁用模块后的 `VitePwaManifest` warning。
- 第 18 批已提交：`ec2202497 perf(nexus): stabilize landing route matrix`；首页 sticky bar attrs warning 和 waitlist aurora hydration mismatch 已清理，`@vueuse/core` 不再触发 Vite runtime dependency discovery，route matrix after 显示 docs tabs/card 仍 0 warning / 0 failed。
- 第 19 批已提交：`090f4a818 perf(nexus): prebundle route local dev deps`；`marked`、`echarts/core`、`echarts/charts`、`echarts/components`、`echarts/renderers`、`vue-sonner` 加入 Vite dev pre-bundle，3211 dev server 页面访问后未再出现这些依赖的 runtime discovery / reload。
- 第 20 批已提交：`a5285a4bd perf(nexus): preload route locale chunks on locale switch`；把 route-local chunk 判定抽到共享 helper，并在 locale 切换前预合并当前 route 所需 chunk，`Accept-Language: zh-CN` 下 `/` 与 `/new` 不再输出 `landing.*` missing key warning。
- 第 21 批已提交：`3c6975c35 perf(nexus): split dev ssr component docs body`；dev SSR 下组件文档首访使用 metadata-only `body=0`，客户端 hydration/idle 后再拉 `body=1` 填正文，production SSR 保持 full body。
- 第 22 批已提交：`60e5d952a perf(nexus): cancel sidebar full body prefetch`；sidebar 链接现在立即预热 route component + `body=0` metadata，full `body=1` 只在持续 hover/focus/touch 意图后请求，并可由 blur / mouseleave 取消。
- 第 24 批已提交：`1075acd34 perf(nexus): scope component docs navigation`；component docs route 现在请求 `/api/docs/navigation?scope=components`，SSR payload 只包含组件导航分支，tabs HTML 107061 -> 86611 bytes，after HTML 不再包含 Architecture / Guide payload。
- 第 25 批为 docs-only 收尾：后续 docs 文档内容、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、生产 chunk / payload / CSS 复核全部只从本文任务树领取；当前批不再继续扩大代码改动。
- 第 26 批已提交：`1c54878ba perf(nexus): cancel docs pager full body prefetch`；底部 Prev / Next pager 现在先预热目标 route + `body=0` metadata，full `body=1` 只在持续意图后请求，并可由 blur / mouseleave 取消。
- 第 27 批为 docs-only 最终交接：按用户要求把后续 docs 文档内容、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、生产 chunk / payload / CSS 复核全部固定到本文任务树；当前批只做文档收尾，不继续混入代码、Playwright 新采样或 unrelated 文件。
- 第 28 批已提交：`68f8266be perf(nexus): fast path component docs metadata`；component docs dev `body=0` metadata 请求优先走本地 frontmatter fast path，不再为了几百字节 metadata 触发 Nuxt Content query；非组件 docs metadata 仍保持 Nuxt Content 路径。
- 第 29 批为 docs-only 收尾：按用户最新要求，把后续 docs 文档内容、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核全部固定到本文任务树；当前批不继续扩代码、不新增 Playwright artifact。
- 第 30 批已提交：`a067e140f perf(nexus): build docs assistant context on intent`；docs Assistant context 只在用户打开 Assistant 时按需构建，`dompurify` 加入 dev pre-bundle，点击 Assistant 不再触发 Vite runtime dependency discovery。
- 第 31 批为 docs-only 收尾：按用户最新要求，明确当前批不继续扩大代码改动；后续 docs 文档内容加载、AI review / aireview 未审批组件、全站切换矩阵、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核全部从下方任务树领取。
- 第 32 批为 docs-only 工作表：正式输出 pending / aireview 组件工作表，Top 30 使用 `:::TuffDemoWrapper` 计数，并回填已有 Playwright 请求数；当前 Top 3 仍是 `fusion`、`card`、`avatar-variants`。
- 第 33 批已提交：`4793a0240 perf(nexus): defer pending docs body sections`；`fusion` / `card` 在 dev/client 下只先渲染前两段正文，后半段通过静态 skeleton 壳占位，并在用户滚动/键盘/触摸意图或 3.2s 静置后挂载；hash 直达仍立即展开目标段。
- 第 34 批已提交：`03de407dd perf(nexus): defer single-section docs demos`；`avatar-variants` 顶层只有一个 `h2 Gallery`，第 33 批第二个 `h2` 规则覆盖不到；本批在首个 demo/API 组件边界 fallback 切分，并把 demo 前的 `h3` 一起后置，避免首屏留下空 demo 标题。
- 第 35 批已提交：`15df6cca1 docs(nexus): finalize performance TODO handoff`；按用户最新要求，把当前 goal 原句、追加收尾要求、后续 docs 文档内容、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核和下一批领取顺序全部固定到本文。
- 第 36 批为 strict pending deferred body：把性能 deferred body 从 UI verified 状态拆出，按 strict pending 口径覆盖 `syncStatus: migrated + verified: true` 的 `glass-surface`；`tabs` 作为 reviewed+verified 触发页保持 shell false，不误伤。
- 第 37 批为 docs-only 收尾：按用户最新要求，不再继续扩大当前批；后续 docs 文档内容加载、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、首页 warning、生产 chunk / payload / CSS 复核全部从本文任务树领取。
- 第 38 批为 pending demo second-boundary split：Playwright-core baseline 证明 `fusion` / `card` 的 API/Props 表和 demo registry 不在首屏 eager 路径；本批把 pending split 点收紧到第二个 demo/API boundary 与第二个 `h2` 的较早者，`card` initial demo shells 2 -> 1，`fusion` 保持 1，`tabs` 不启用 deferred shell。
- 第 39 批为 strict pending verified sample：抽样 `base-anchor` / `select` / `radio`，确认这些 `migrated + verified` 页面均 initial shell true、initial demos 1、props nodes 0、after deferred true；本批没有发现需要新增代码的回退点，只回填证据和工作表。
- 第 43 批为 public docs auth/profile graph：公开 docs 页不再直接调用 `useAuthUser`，app root 和 locale orchestrator 只在 protected/authenticated profile 场景动态 import current-user API；tabs Playwright after 记录 auth graph requests 0。
- 第 44 批为 legacy sonner boundary：sign-in / admin bootstrap 不再直接 import `vue-sonner`，统一使用自研 `useToast` host；tabs Playwright after 记录 sonner requests 0。
- 第 45 批为 docs aside shell evidence / TODO handoff：3228 dev server tabs 3.5s HAR 证明 `DocsAsideCardsShell`、`DocsAsideCards`、Assistant、`TxMarkdownView`、`dompurify`、`vue-sonner`、auth/profile graph 均为 0；剩余 2 条 comments/analytics match 是 Nuxt dev `?macro=true` page meta 扫描，不是 docs runtime import，转入后续 dev SSR / route macro 专项。
- 当前工作树存在 CoreApp 相关未提交改动，属于其它任务范围；Nexus 本轮收尾不混入这些文件。
- `output/playwright/` 继续作为 ignored evidence 目录，只在本文引用报告路径，不纳入 git。
- 下一阶段不再继续扩大当前批次；所有 docs 内容、AI review / aireview 未审批组件和全站矩阵二轮都按下方 TODO 分批处理。
- 仍需继续追的已知剩余瓶颈：tabs 首屏 script request 仍偏高；第 10 批已将 Vue Router / Pinia devtools bridge 请求从 18 降到 3，第 16 批将 MDC Prose registry 请求归零，第 17 批将普通 dev 的 PWA client plugin 请求归零，第 18 批将首页 Vue attrs / aurora hydration warning 清理并预打包 `@vueuse/core`，第 19 批清理 `marked` / `echarts/*` runtime discovery，第 20 批清理 zh landing route-local warning，第 21 批降低 dev SSR 组件文档首访正文体量，第 22 批收紧 sidebar full-body 预取，第 43 批移除 public docs auth/profile graph，第 44 批移除 legacy sonner CSS 首访，第 45 批排除 right rail shell 首访污染；但 Nuxt dev `?macro=true` page meta 扫描、Nuxt runtime、`node_modules`、docs demo 模块碎片、移动端/production preview 和首页剩余 warning 仍待继续拆。下一批必须先用 Playwright / HAR 验证有效收益，再决定是否落代码。

## 第 28 批收口记录

目标：领取 P0 pending / aireview 工作表与 component docs metadata fast path 小切片。第 27 批后 TODO 已固定后续入口；本批先按当前 `.mdc` 文件与既有 Playwright 证据重排 pending 高收益页面，然后优化 component docs 在 dev 下的 `body=0` metadata 请求，让 sidebar hover、pager hover 和 route metadata 预热不再先进入 Nuxt Content query / MDC pipeline。

改动范围：

- `apps/nexus/server/api/docs/page.get.ts`
- `apps/nexus/test/api/docs/page.get.test.ts`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- 新增 `shouldPreferDevDocsMetadataFileLookup(docPath, includeBody)`，只在 `NODE_ENV === 'development'`、`body=0`、`/docs/dev/components/**` 时启用。
- component docs metadata fast path 复用既有 `readDevDocsPageFallback()` / `parseFrontmatterMetadata()`，只读本地 Markdown frontmatter，不 import `@nuxtjs/mdc/runtime`，不调用 Nuxt Content query。
- 非组件 docs 的 dev metadata 请求继续走 Nuxt Content，避免 guide / policy / 其它 docs 丢失 Nuxt Content 派生 metadata。
- 不改变 production SSR full body，不改变 production SEO，不改变 `body=1` 正文加载。

pending 排序快照：

- 本批重新按 `syncStatus`、`verified`、英文/中文正文体量、TuffDemoWrapper、code block、API table 粗排 pending 页面；当前前 6 位仍是 `fusion`、`card`、`avatar-variants`、`glass-surface`、`gradual-blur`、`auto-sizer`。
- 复核后发现真实 demo 标记是 `:::TuffDemoWrapper`，之前 TODO 中的 demo 数继续作为人工候选说明保留；后续工作表需要用 `:::TuffDemoWrapper` 计数，不再用 `::demo`。
- 当前最适合下一刀的页面仍是 `fusion` / `card` / `avatar-variants`，但 `TuffDemoWrapper` 已经是点击 Run 后才加载 demo registry，本批不重复拆已完成的 demo registry 首屏移出。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "test/api/docs/page.get.test.ts" "app/pages/docs/docs-page-performance.test.ts"`，2 files / 36 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "server/api/docs/page.get.ts" "test/api/docs/page.get.test.ts" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/server/api/docs/page.get.ts" "apps/nexus/test/api/docs/page.get.test.ts" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、Sass legacy API、Nuxt module preload sourcemap、node externalized、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- HTTP smoke（3214 dev server）：
  - `fusion body=0` 564 bytes / TTFB 12.9ms；`fusion body=1` 66951 bytes。
  - `tabs body=0` 455 bytes / TTFB 12.5ms；`tabs body=1` 48511 bytes。
  - `card body=0` 615 bytes / TTFB 5.6ms；`card body=1` 79683 bytes。
  - `/en/docs/dev/components/tabs` 为 200；HTML 85345 bytes；标题 `Tabs | Tuff Docs`。
- Playwright first visit after：
  - 报告：`output/playwright/nexus-docs-metadata-fastpath-b28-after-3214-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-metadata-fastpath-b28-after-3214-2026-06-21.json`
  - 截图/HAR：同前缀 `fusion`、`card`、`tabs` 的 `.png` / `.har`。
  - fusion：status 200，requests 434，failed 0，warnings/errors 0，docs API `body=1` 66951 bytes，demo registry/client renderer 0。
  - card：status 200，requests 432，failed 0，warnings/errors 0，docs API `body=1` 79683 bytes，demo registry/client renderer 0。
  - tabs：status 200，requests 427，failed 0，warnings/errors 0，docs API `body=1` 48511 bytes，demo registry/client renderer 0。
- Playwright hover metadata after：
  - 报告：`output/playwright/nexus-docs-metadata-fastpath-b28-hover-3214-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-metadata-fastpath-b28-hover-3214-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-metadata-fastpath-b28-hover-3214-2026-06-21.png`
  - HAR：`output/playwright/nexus-docs-metadata-fastpath-b28-hover-3214-2026-06-21.har`
  - tabs hover `FusionAI migrated`：status 200，requests 426，scripts 421，styles 35，failed 0，warnings/errors 0，docs API total 2，`body=0` count 1 / 447 bytes，`body=1` count 1 / 48511 bytes；hover window 只请求 `fusion body=0` metadata。

下一批建议：

1. P0：补真正的 pending 工作表文件或 TODO 表格，使用 `:::TuffDemoWrapper` 计数，列出 Top 30 的 sync/verified/体量/demo/API/首屏请求/动作。
2. P0：针对 `fusion` 或 `card` 做 section-level split / API table visible-only 试验，不再重复拆 demo registry 首屏路径。
3. P0：dev SSR TTFB 二轮，区分 Nuxt transform、Content query、frontmatter fast path、i18n 和 store init。

## 第 29 批收口记录

目标：按用户最新要求快速完成当前任务收尾。当前批只更新 `docs/plan-prd/TODO-nexus.md`，把第 28 批真实提交状态、当前 goal 原句、追加要求、后续 docs 文档内容加载、AI review / aireview 未审批组件、全站页面切换矩阵二轮、dev SSR TTFB、首页剩余 warning、生产 chunk / payload / CSS 复核全部固定在本文，作为后续唯一领取入口。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 第 28 批提交已修正为 `68f8266be perf(nexus): fast path component docs metadata`，不再显示 `pending` / 待提交。
- 当前第 29 批为 docs-only 收尾，不新增业务代码、不新增测试文件、不新增 Playwright artifact、不触碰 CoreApp / AI dirty files。
- 后续 docs 文档内容、AI review / aireview 相关工作统一从 `后续任务树` 领取，不再从聊天上下文临时恢复范围。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；优先 `fusion` / `card` / `avatar-variants` section-level split、pending 工作表正式化、dev SSR TTFB 二轮或 route matrix 二轮。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- `output/playwright/` 继续作为 ignored evidence 目录，只引用路径，不纳入 git。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 30 批收口记录

目标：继续收敛 docs 组件文档首访后的后台 CPU / 依赖加载。第 29 批后 TODO 已固定后续入口；本批领取一个小切片，把 docs Assistant 的长正文 context 构建从“每个文档页就绪后自动扫描整篇 `renderDoc.body`”改为“用户打开 Assistant 时才按需构建”，同时修复打开 Assistant 时 TuffEx markdown viewer 触发 `dompurify` runtime dependency discovery / reload 的 dev 慢点。

改动范围：

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`
- `apps/nexus/nuxt.config.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- docs layout 新增 `docs-assistant-context-request` shared state；只有 `openDocsAssistantFromShell()` 被触发时递增，作为 Assistant context 构建意图信号。
- docs page 移除页面就绪后自动 `scheduleAssistantContextBuild(renderDoc.value?.body, 700)` 的路径；普通阅读、route switch、pending 长文档首访不再自动抽取整篇正文。
- 当 Assistant 意图发生但 full body 尚未就绪时，复用既有 `startFullDocFetchForRoute()`；正文到达后再构建 context。
- `dompurify` 加入 `vite.optimizeDeps.include`，避免点击 Assistant 加载 `TxMarkdownView` 时触发 Vite runtime dependency discovery / reload。
- 不改变 Assistant 显式点击路径，不改变生产 SSR 正文，不改变 docs full-body API 合同。

验证证据：

- Baseline Playwright：
  - 报告：`output/playwright/nexus-docs-assistant-context-b30-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-assistant-context-b30-baseline-3200-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`fusion` 的 `.png` / `.har`。
  - tabs：status 200，requests 427，failed 0，warnings/errors 0，demo renderer 0。
  - fusion：status 200，requests 427，failed 0，warnings/errors 0，demo renderer 0。
- After Playwright：
  - 报告：`output/playwright/nexus-docs-assistant-context-b30-after-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-assistant-context-b30-after-3200-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`fusion`、`tabs-assistant` 的 `.png` / `.har`。
  - tabs：status 200，requests 434，failed 0，warnings/errors 0，`assistantRequests 0`，`dompurifyRequests 0`，demo renderer 0。
  - fusion：status 200，requests 427，failed 0，warnings/errors 0，`assistantRequests 0`，`dompurifyRequests 0`，demo renderer 0。
  - tabs-assistant：status 200，failed 0，warnings/errors 0，Assistant dialog visible，open 约 1316ms，`assistantRequests 4`，`dompurifyRequests 0`。
  - dev server after 日志：页面访问和 Assistant 打开后未再出现 `Vite discovered new dependencies ... dompurify`。
- HTTP smoke：
  - baseline `tabs`：status 200，TTFB 2.804s，HTML 85345 bytes。
  - baseline `fusion`：status 200，TTFB 33.7ms，HTML 86025 bytes。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts" "app/components/content/demo-client-boundary.test.ts"`，2 files / 44 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/layouts/docs.vue" "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts" "app/components/content/demo-client-boundary.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/layouts/docs.vue" "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "apps/nexus/app/components/content/demo-client-boundary.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；生产仍输出 Cloudflare Pages / Nitro 构建，并保留 PWA 生成。构建中仍有既有 browserslist、Sass legacy API、Nuxt module preload sourcemap、node externalized、chunk size 等 warning，不归因于本批。

下一批建议：

1. P0：正式 pending 工作表文件或 TODO 表格，使用 `:::TuffDemoWrapper` 计数，列 Top 30 的 sync/verified/体量/demo/API/首屏请求/动作。
2. P0：针对 `fusion` 或 `card` 做 section-level split / API table visible-only 试验。
3. P0：dev SSR TTFB 二轮，区分 Nuxt transform、Content query、frontmatter fast path、i18n 和 store init。

## 第 31 批收口记录

目标：按用户最新要求快速完成当前任务收尾。当前批只更新 `docs/plan-prd/TODO-nexus.md`，把当前 goal 原句、追加要求、触发页、已完成批次、子任务百分比，以及后续 docs 文档内容加载、AI review / aireview 未审批组件、全站页面切换矩阵二轮、dev SSR TTFB、首页剩余 warning、生产 chunk / payload / CSS 复核全部固定在本文。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 第 30 批已修正为 `a067e140f perf(nexus): build docs assistant context on intent`，不再显示待提交或代码验证中。
- 当前第 31 批为 docs-only 收尾，不新增业务代码、不新增测试文件、不新增 Playwright artifact、不触碰 CoreApp / AI dirty files。
- 后续 docs 文档内容、AI review / aireview 相关工作统一从 `后续任务树` 领取，不再从聊天上下文临时恢复范围。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；优先 pending 工作表正式化、`fusion` / `card` section-level split、dev SSR TTFB 二轮或 route matrix 二轮。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- `output/playwright/` 继续作为 ignored evidence 目录，只引用路径，不纳入 git。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 32 批收口记录

目标：正式输出 pending / aireview 组件工作表。第 31 批已经把后续事项全部固定到本文；本批领取 P0 工作表小切片，只做文档和报告，不改业务代码、不新增长期审计脚手架、不新增 Playwright artifact。

改动范围：

- `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`
- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 扫描 `apps/nexus/content/docs/dev/components/*.mdc`：216 个本地化文件，108 个组件条目。
- pending 判定继续使用 `syncStatus != reviewed || verified != true`；当前 pending 组件条目为 76 个。
- localized 文件状态：`migrated` 152 个，`reviewed` 64 个；`verified: true` 92 个，未 verified 124 个。
- 工作表使用真实 `:::TuffDemoWrapper` 计数 demo，不再使用旧的 `::demo` 粗略口径。
- Top 30 每行记录 `syncStatus`、`verified`、正文体量、demo 数、fenced code block 数、API table、已有 Playwright 首屏请求数和下一步动作。
- 已采样页面回填现有 Playwright JSON：`fusion`、`card`、`avatar-variants`、`gradual-blur`、`auto-sizer`、`scroll`；未采样页面明确标记 `not sampled`，后续改代码前必须先跑 baseline。
- 当前 Top 3：`fusion`、`card`、`avatar-variants`；下一批代码优化优先从这三页领取。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md" "docs/plan-prd/TODO-nexus.md"`。

## 第 33 批收口记录

目标：继续领取 P0 pending / aireview 长文档优化小切片。第 32 批工作表确认当前 Top 2 是 `fusion` 与 `card`；本批不改 demo registry、不碰 DocApiTable、不扩首页 warning / dev SSR / 生产 chunk 方向，只把 pending 组件长正文后半段从页面切换后的立即渲染路径拆出。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- 只在 `import.meta.dev && import.meta.client && component docs && docSyncStatus !== verified` 且正文足够长时启用 deferred body section。
- `renderDoc.body` full body 到达后，先按第二个 `h2` 切分，只把首段交给第一段 `ContentRenderer`。
- 后半段保留静态 `docs-deferred-body-shell` 占位，避免页面切换后立即解析和挂载所有 usage / API / demo 内容。
- 用户滚动、滚轮、键盘、触摸意图会立即挂载后半段；若用户静置，3.2s 后自动补齐；hash 直达仍立即展开并滚动到目标段。
- 兼容 Nuxt Content minimark `body.value` 与常规 `body.children` 两种结构，避免只支持 `children` 导致 split 空跑。
- production SSR 合同不变；verified 文档不启用本批 dev-only deferred 行为。

验证证据：

- HTTP smoke（3216 dev server）：
  - `/en/docs/dev/components/fusion` status 200，HTML 86013 bytes，标题 `Fusion | Tuff Docs`，确认不是 Nuxt Welcome。
  - `fusion body=0` 447 bytes JSON；`fusion body=1` 66951 bytes。
  - `card body=0` 501 bytes JSON；`card body=1` 79683 bytes。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 28 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Playwright/CDP after（MCP Playwright navigation 本轮仍 300s 超时，改用系统 Chrome DevTools Protocol 采集真实浏览器证据）：
  - 报告：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21.json`
  - Fusion 截图：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-fusion.png`
  - Fusion 滚动后截图：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-fusion-scrolled.png`
  - Fusion HAR：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-fusion.har`
  - Card 截图：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-card.png`
  - Card 滚动后截图：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-card-scrolled.png`
  - Card HAR：`output/playwright/nexus-docs-deferred-body-b33-after-3216-2026-06-21-card.har`
  - fusion：status 200，requests 450，scripts 415，styles 16，failed 0，console warnings/errors 0；`body=1` 66951 bytes；初始 headings 仅 `Fusion / Basic Usage / Fusion`，`shell true`、`deferredRendered false`、`Initial API text false`；滚动后 `deferredRendered true`、`After scroll API text true`。
  - card：status 200，requests 455，scripts 419，styles 16，failed 0，console warnings/errors 0；`body=1` 79683 bytes；初始 headings 仅 `Card / Basic Usage / Basic / Basic slots`，`shell true`、`deferredRendered false`、`Initial API text false`；滚动后 `deferredRendered true`、`After scroll API text true`。

下一批建议：

1. P0：把同一 section-level split 策略扩到 `avatar-variants` / `glass-surface` / `gradual-blur` 前先跑 baseline，再确认是否复用当前通用 docs page 机制已经覆盖。
2. P0：继续查 demo / preview / report 类组件是否还有可见区前 eager import；不要重复拆已确认点击 Run 后才加载的 demo registry。
3. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。

## 第 34 批收口记录

目标：补第 33 批没有覆盖到的单章节大 demo 文档。`avatar-variants` 正文约 36KB，但 Nuxt Content minimark 顶层只有 5 个节点：`h1`、说明段、`h2 Gallery`、`h3 Avatar Variants Gallery`、`tuff-demo-wrapper`；没有第二个 `h2`，所以第 33 批切分规则不生效。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- 保留第 33 批第二个 `h2` 优先切分规则。
- 当没有第二个 `h2` 时，从首个 `TuffDemoWrapper` / API table 类自定义节点 fallback 切分。
- 如果自定义节点前一个节点是 `h3`，把这个 `h3` 一起放入 deferred body，避免首屏留下 demo 空标题。
- 仍只在 dev/client、component docs、未 verified、正文足够长时启用；production SSR 合同不变。

验证证据：

- Baseline Playwright/CDP：
  - 报告：`output/playwright/nexus-docs-avatar-demo-defer-b34-baseline-3217-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-avatar-demo-defer-b34-baseline-3217-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-avatar-demo-defer-b34-baseline-3217-2026-06-21-avatar-variants.png`
  - HAR：`output/playwright/nexus-docs-avatar-demo-defer-b34-baseline-3217-2026-06-21-avatar-variants.har`
  - baseline：status 200，requests 441，failed 0，warnings/errors 0，`body=1` 37249 bytes；initial shell false，deferred false，Gallery true，demo title true，demo-like nodes 22。
- After Playwright/CDP：
  - 报告：`output/playwright/nexus-docs-avatar-demo-defer-b34-after-3217-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-avatar-demo-defer-b34-after-3217-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-avatar-demo-defer-b34-after-3217-2026-06-21-avatar-variants.png`
  - 滚动后截图：`output/playwright/nexus-docs-avatar-demo-defer-b34-after-3217-2026-06-21-avatar-variants-scrolled.png`
  - HAR：`output/playwright/nexus-docs-avatar-demo-defer-b34-after-3217-2026-06-21-avatar-variants.har`
  - after：status 200，requests 450，failed 0，warnings/errors 0，`body=1` 37249 bytes；initial shell true，deferred false，Gallery true，demo title false，demo-like nodes 0；滚动后 deferred true，demo title true，demo-like nodes 22。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 28 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。

下一批建议：

1. P0：`glass-surface` 或 `gradual-blur` 做 demo visible-only / API table visible-only 二轮，先跑 baseline 再确认是否被当前 fallback 覆盖。
2. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。
3. P1：production preview chunk / payload / CSS 复核，确认 dev-only deferred split 没有掩盖生产 chunk 污染。

## 第 35 批收口记录

目标：按用户最新要求快速完成当前任务收尾。当前批只更新 `docs/plan-prd/TODO-nexus.md`，把当前 goal 原句、追加收尾要求、触发页、真实提交 hash、子任务百分比、后续 docs 文档内容加载、AI review / aireview 未审批组件、全站页面切换矩阵二轮、dev SSR TTFB、首页剩余 warning、生产 chunk / payload / CSS 复核全部固定在本文。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 第 33 批真实提交固定为 `4793a0240 perf(nexus): defer pending docs body sections`。
- 第 34 批真实提交固定为 `03de407dd perf(nexus): defer single-section docs demos`。
- 当前 goal 原句、用户追加要求、触发页、已完成批次、当前百分比、Playwright / HAR / Markdown / JSON 证据路径均保留在本文。
- 后续 docs 文档内容和 AI review / aireview 相关事项不再从聊天上下文临时恢复范围，统一从 `后续任务树` 领取。
- 当前批不新增业务代码、不新增测试文件、不新增 Playwright artifact、不触碰 CoreApp / AI dirty files、不继续混入 demo registry、DocApiTable、首页 warning、dev SSR TTFB 或生产 chunk 复核。

下一批领取优先级：

1. P0：`glass-surface` 或 `gradual-blur` demo visible-only / API table visible-only 二轮；先跑 Playwright / HAR baseline，再判断当前 fallback split 是否已经覆盖。
2. P0：dev SSR TTFB 二轮；覆盖 `/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init、middleware 与 route payload。
3. P0：route matrix 二轮；补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot / HAR。
4. P1：production preview chunk / payload / CSS 复核；确认 docs、store、dashboard、landing 是否仍互相污染，若存在优先修 import boundary、layout boundary 或 component registration。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 39 批收口记录

目标：领取 strict pending verified 抽样小批，验证第 36/38 批通用规则是否只覆盖 `glass-surface`，还是也覆盖其它 `syncStatus: migrated + verified: true` 的 AI review / aireview pending 页面。本批只做 Playwright-core 证据和文档回填；没有发现需要新增代码的 eager path。

改动范围：

- `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`
- `docs/plan-prd/TODO-nexus.md`

验证证据：

- HTTP smoke（3220 dev server）：
  - `/en/docs/dev/components/base-anchor` status 200，cold TTFB 3060ms，HTML 85998 bytes。
  - `/en/docs/dev/components/select` status 200，warm TTFB 29ms，HTML 86285 bytes。
  - `/en/docs/dev/components/radio` status 200，warm TTFB 23ms，HTML 86353 bytes。
  - `/en/docs/dev/components/tabs` status 200，warm TTFB 21ms，HTML 85445 bytes。
  - `base-anchor body=0` 711 bytes；`base-anchor body=1` 46244 bytes。
  - `select body=0` 747 bytes；`select body=1` 34543 bytes。
  - `radio body=0` 777 bytes；`radio body=1` 33384 bytes。
- Playwright-core sample：
  - 报告：`output/playwright/nexus-docs-strict-pending-verified-b39-sample-3220-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-strict-pending-verified-b39-sample-3220-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`base-anchor`、`select`、`radio` 的 `*-initial.png`、`*-after-scroll.png`、`.har`。
  - `tabs`：status 200，requests 444，failed/warnings/errors 0，initial shell false，initial demos 7，props nodes 0，after deferred false。
  - `base-anchor`：status 200，requests 436，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true。
  - `select`：status 200，requests 439，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true。
  - `radio`：status 200，requests 438，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true。
- Whitespace：`git diff --check -- "docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md" "docs/plan-prd/TODO-nexus.md"`。

结论：

- 第 36/38 批通用 deferred body 规则已覆盖多个 `migrated + verified` 页面，不需要为 `base-anchor` / `select` / `radio` 新增页面专属代码。
- 本批也再次确认 reviewed+verified 触发页 `tabs` 仍不启用 deferred shell，未误伤已审阅文档。
- 3220 cold `base-anchor` TTFB 约 3.06s，说明下一阶段 dev SSR TTFB 二轮仍值得独立领取；不要混进 docs split 小批。

下一批建议：

1. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。
2. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot / HAR。
3. P1：`fusion` / `card` production chunk / route-switch timing 复核；dev 初始 API/demo eager 路径已 clean。

## 第 40 批收口记录

目标：按用户最新要求快速完成当前任务收尾。本批只更新 `docs/plan-prd/TODO-nexus.md`，把后续 docs 文档内容加载、AI review / aireview 未审批组件优化、全站 route matrix 二轮、dev SSR TTFB、首页剩余 warning、production chunk / payload / CSS 复核全部固定在本文，并把当前 goal 原句、追加要求、触发页、批次状态和下一批领取边界放到顶部可见位置。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 第 39 批真实提交固定为 `929b850a2 docs(nexus): record strict pending verified sample`。
- 当前第 40 批为 docs-only 收尾冻结，不新增业务代码、不新增测试文件、不新增 Playwright artifact、不触碰 CoreApp / AI dirty files。
- 后续 docs 文档内容、AI review / aireview 相关事项统一从 `后续任务树` 和 `当前批收尾冻结（第 40 批 docs-only）` 领取。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；优先 dev SSR TTFB 二轮、route matrix 二轮、production chunk / payload / CSS 复核或 pending 工作表剩余页面分组。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- `output/playwright/` 继续作为 ignored evidence 目录，只引用路径，不纳入 git。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 41 批收口记录

目标：领取 P0 dev SSR TTFB 二轮小切片。先用 fresh-server curl 建 baseline，确认 `/en/docs/dev/components/tabs` 第一跳 cold TTFB 仍为 4.128s，而同 server warm 只有 35-40ms，慢点更像首次 docs SSR import / transform graph，而不是 docs API warm path；本批只移除 docs page 里非首屏必需的 Vue runtime `defineComponent` / `render()` code-block header 增强，改为客户端原生 DOM 生成 copy header。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- `renderCodeHeader()` 不再创建 `CodeHeader` Vue 子组件，不再依赖 `render(vnode, target)` 或 `useNuxtApp().vueApp._context`。
- code block header 继续只在客户端 `enhanceCodeBlocks()` 路径生成，DOM 结构保持 `.docs-code-header`、`.docs-code-language`、`.docs-code-copy`、`.docs-code-copy__icon`。
- code block copy 仍调用 `writeToClipboard()`、toast 成功/失败提示和 `docs:action` telemetry 事件；不改变内容页 SSR 输出、不改变 `TuffCodeBlock` lazy renderer、不引入新测试脚手架。

验证证据：

- Focused Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 29 tests passed。
- Scoped ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Curl fresh-server baseline（3222）：
  - `/en/docs/dev/components/tabs` cold 4128ms，warm 35.5 / 40.5ms，status 200。
  - `/` cold 1145ms，`/store` cold 860ms，`/sign-in` cold 323ms，未登录 `/dashboard` cold 145ms。
- Curl fresh-server after（3223）：
  - `/en/docs/dev/components/tabs` cold 3083ms，warm 30.9 / 24.1ms，status 200，核心收益 -1045ms / 25.3%。
  - `/` cold 903ms（-242ms / 21.1%），`/store` cold 666ms（-194ms / 22.6%），`/sign-in` cold 244ms（-79ms / 24.5%），未登录 `/dashboard` cold 106ms（-39ms / 26.9%）。
- Playwright-core after：
  - 报告：`output/playwright/nexus-dev-ssr-ttfb-b41-after-3223-2026-06-21.md`
  - JSON：`output/playwright/nexus-dev-ssr-ttfb-b41-after-3223-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`home`、`store`、`sign-in`、`dashboard` 的 `.png` / `.har`。
  - tabs：status 200，requests 464，scripts 460，styles 57，failed 0，warnings 0，errors 0。
  - home：status 200，requests 614，failed 2，warnings 8，errors 0；继续归入首页 media / WebGL / lifecycle warning 独立任务，不混入本批 docs 修复。
  - store：status 200，requests 517，failed 0，warnings 0，errors 0。
  - sign-in：status 200，requests 515，failed 0，warnings 0，errors 0。
  - dashboard：Playwright 最终落到 `/sign-in?redirect_url=/dashboard/overview`，curl 保持未登录 302 证据；Playwright status 200，requests 487，failed 0，warnings 0，errors 0。
- Code header smoke：
  - 页面：`/en/docs/dev/components/context-menu`
  - 截图：`output/playwright/nexus-dev-ssr-ttfb-b41-after-3223-2026-06-21-context-menu-code-header.png`
  - status 200，`preCount 7`，`headerCount 7`，`copyCount 7`，warnings/errors 0。

结论：

- 本批证明 `/en/docs/dev/components/tabs` 触发页 500 不复现，且 fresh-server cold TTFB 有明确下降；warm TTFB 继续保持 24-31ms。
- docs API warm path 仍为毫秒级：本批前测得 tabs `body=0` 4.8ms、`body=1` 5.7ms、components navigation 2.6ms；下一阶段继续追 Nuxt/runtime、auto-import、layout/sidebar import graph，而不是重复改 docs API。
- 首页 after 仍有 2 failed / 8 warnings，需要按 TODO 的首页 warning / media failed request 分类独立领取。

下一批建议：

1. P0：dev SSR TTFB 第三刀，继续拆 docs page/layout 的非首屏 auto-import、toast/share、engagement/admin/comment 相关 graph。
2. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot/HAR。
3. P1：首页剩余 warning / failed media 分类，单独处理 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope` 与首屏 media 失败。

## 第 42 批收口记录

目标：领取 P0 dev SSR TTFB 第三刀中的最小安全切片。第 41 批后确认 slow path 主要还在 docs page/layout 首次 SSR import / transform graph；本批只把 docs 页顶层 `useToast()` 从 setup 阶段移走，改为 copy/share 用户意图后动态 import，不继续混入 share UI、engagement、admin、comment、首页 warning 或 pending 逐页二刀。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- docs 页面不再在 setup 顶层调用 `useToast()`。
- 新增 `showDocsToast(type, title)`，仅在客户端 copy/share 成功或失败时动态 `import('~/composables/useToast')`。
- inline code copy、code block header copy、share link copy 的成功/失败反馈保持不变；SSR 输出、docs action telemetry、code header DOM 结构不变。
- 不新增宽泛审计脚手架，不改 `vue-sonner` 全局策略，不扩大到 dashboard/store/landing。

验证证据：

- Focused Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 30 tests passed。
- Scoped ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "docs/plan-prd/TODO-nexus.md"` 通过。
- Curl fresh-server baseline（3224）：
  - `/en/docs/dev/components/tabs` cold 2919.6ms，warm 30.9 / 30.6ms，status 200。
  - `/` cold 914.6ms，`/store` cold 643.4ms，`/sign-in` cold 220.2ms，未登录 `/dashboard` cold 106.8ms。
- Curl fresh-server after（3225）：
  - `/en/docs/dev/components/tabs` cold 2911.8ms，warm 31.1 / 36.8ms，status 200；delta 7.8ms / 0.3%，视为噪声级小幅变化。
  - `/` cold 872.7ms（-41.9ms / 4.6%），`/store` cold 667.8ms（+24.4ms / -3.8%），`/sign-in` cold 219.1ms（-1.1ms / 0.5%），未登录 `/dashboard` cold 128.6ms（+21.8ms / -20.4%）。
- Playwright-core after：
  - 报告：`output/playwright/nexus-docs-toast-intent-b42-after-3225-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-toast-intent-b42-after-3225-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`context-menu-code-copy` 的 `.png` / `.har`。
  - tabs：status 200，requests 461，scripts 457，styles 55，toastRequests 0，failed 0，warnings 4，errors 0；4 个 warning 均为既有 WebGL ReadPixels。
  - context-menu-code-copy：status 200，requests 524，scripts 517，styles 67，toastRequests 1，failed/warnings/errors 0；`preCount 7`、`headerCount 7`、`copyCount 7`、`toastRequestsAfterClick 1`、`toastVisible true`。

结论：

- 本批主要收益不是 TTFB 数字，而是继续清理 docs 首屏 setup 依赖图：toast feedback 只在 copy/share 意图后加载。
- `/en/docs/dev/components/tabs` after 首访不加载 toast 相关请求，真实 code 页面点击 copy 后动态 toast 路径可用。
- 第 42 批不继续处理首页 WebGL warning、production chunk 复核或 pending 组件逐页 demo/API 二刀；这些均从后续任务树领取。

下一批建议：

1. P0：dev SSR TTFB 第四刀，继续拆 docs page/layout 的 share、engagement、admin、comment、right rail 非首屏 graph。
2. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot/HAR。
3. P0：pending / aireview 工作表继续分组，把剩余 76 个 pending 组件拆为可静态化、可懒加载、应移出首屏、应合并模板、应删除或后置。

## 第 43 批收口记录

目标：领取 P0 dev SSR TTFB 第四刀中的最小安全切片。第 42 批后 toast 已从 docs setup 图拆出，本批继续拆公开 docs 首访不需要的用户资料 / admin 判断依赖，把 `useAuthUser` 与 `useCurrentUserApi` 从 public docs first paint graph 移到 authenticated protected route 或 profile sync 意图后加载。

改动范围：

- `apps/nexus/app/app.vue`
- `apps/nexus/app/composables/useLocaleOrchestrator.ts`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- docs 页面不再调用 `useAuthUser({ fetchOnAuth: false, server: false })`；admin state 只读 shared `auth-user` state。
- app root 不再顶层调用 `useAuthUser({ fetchOnAuth: isProtectedRoute, server: false })`；新增 protected route 专用 `fetchProtectedAuthUser()`，只有客户端、authenticated、protected route 同时满足时才动态 import `fetchCurrentUserProfile`。
- locale orchestrator 移除 `fetchCurrentUserProfile` / `patchCurrentUserProfile` 静态 import；仅在 profile sync 或 locale patch 确实发生时动态 import current-user API。
- 保留 protected route 的 admin bootstrap redirect、profile locale sync 和 pending state；公开 docs、landing、store 首访不需要提前拉用户资料模块。
- 不改 `useAuthUser` 组合式函数本体，不改 auth API 合同，不新增宽泛审计脚手架，不混入 share UI、engagement、comment、right rail、首页 warning 或 pending 逐页二刀。

验证证据：

- Focused Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 31 tests passed。
- Scoped ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/app.vue" "app/composables/useLocaleOrchestrator.ts" "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/app.vue" "apps/nexus/app/composables/useLocaleOrchestrator.ts" "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "docs/plan-prd/TODO-nexus.md"` 通过。
- Curl fresh-server / hot-server after（3226）：
  - `/en/docs/dev/components/tabs` fresh-server cold 3081.9ms，hot 42.4ms，hot warm 24.1 / 21.5ms，status 200。
  - `/` fresh-server cold 895.9ms，hot 32.3ms，hot warm 15.9 / 15.5ms，status 200。
  - `/store` fresh-server cold 631.1ms，hot 15.4ms，hot warm 11.3 / 13.7ms，status 200。
  - `/sign-in` fresh-server cold 197.7ms，hot 10.3ms，hot warm 7.9 / 10.9ms，status 200。
  - `/dashboard` fresh-server cold 99.9ms，hot 5.3ms，hot warm 4.9 / 4.5ms，status 302。
- Playwright CLI after：
  - 报告：`output/playwright/nexus-docs-auth-state-b43-after-3226-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-auth-state-b43-after-3226-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-auth-state-b43-after-3226-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-auth-state-b43-after-3226-2026-06-21-tabs.har`
  - tabs：status 200，requests 463，scripts 404，styles 76，authGraphRequestCount 0，failedRequests 0。
  - auth graph narrow patterns：`/composables/useAuthUser.ts`、`/composables/useCurrentUserApi.ts`、`/api/user/me`、`/api/auth/me`、`/api/auth/*`；本批 after 全部为 0。
  - `toastRequestCount 2` 均为 `vue-sonner` CSS，请放到 production chunk / payload / CSS 复核或单独 CSS/import boundary 批次处理，不再扩大第 43 批。
  - Playwright CLI screenshot/HAR 路径不提供 console warning/error，本批不把 console count 当作证据；MCP browser session 曾超时，后续若需要 console 计数应使用独立 CDP 脚本。

结论：

- 本批主要收益是请求/依赖图清理：公开 docs 首访不再引入 auth user composable 与 current-user API graph，tabs after auth graph requests 为 0。
- Fresh-server TTFB 仍然噪声较大，说明下一阶段还要继续拆 Nuxt dev transform、layout/right rail/share/engagement/comment 和 CSS/import boundary。
- 第 43 批不继续处理 `vue-sonner` CSS 首访、首页 WebGL warning、production chunk 复核或 pending 组件逐页 demo/API 二刀；这些均从后续任务树领取。

下一批建议：

1. P0：dev SSR TTFB 第五刀，继续拆 docs page/layout 的 share、engagement、comment、right rail 非首屏 graph，并用 fresh-server curl + Playwright HAR 同步验证。
2. P0：`vue-sonner` CSS 首访来源复核，确认是否来自 ToastContainer、global CSS、pre-bundle side effect 或 Vite dev CSS discovery；不要和 auth/profile graph 批次混做。
3. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot/HAR。
4. P0：pending / aireview 工作表继续分组，把剩余 76 个 pending 组件拆为可静态化、可懒加载、应移出首屏、应合并模板、应删除或后置。

## 第 44 批收口记录

目标：领取第 43 批留下的 `vue-sonner` CSS 首访复核小切片。第 43 批 HAR 证明 public docs auth/profile graph 已清零，但 tabs 首访仍有 2 条 `vue-sonner` CSS；本批只收旧 sonner import boundary，避免继续把 sign-in/auth bootstrap 的通知库扫进 docs first visit。

改动范围：

- `apps/nexus/app/pages/sign-in/index.vue`
- `apps/nexus/app/composables/useSignIn.ts`
- `apps/nexus/app/pages/auth/admin-bootstrap.vue`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- sign-in 页面移除 `import 'vue-sonner/style.css'`、`Toaster` 和对应模板节点。
- `useSignIn()` 改用项目已有 `useToast()`，保留 `notify(error/success/warning, message)` 调用语义。
- admin bootstrap 页面改用 `useToast()`，保留 blocked / required / success / failed toast 语义。
- `vite.optimizeDeps.include` 移除 `vue-sonner`，避免 legacy route-local toast 依赖继续进入 docs dev 首访发现路径。
- focused regression 从“sonner style route-local”升级为“legacy sonner out of first-paint app modules”，同时不新增宽泛审计脚手架。
- 不改变自研 `useToast` / `ToastHost` 合同，不改 dashboard/store 既有 toast 调用，不混入首页 warning、production chunk 复核或 pending 逐页 demo/API 二刀。

验证证据：

- Search：`rg -n "from 'vue-sonner'|vue-sonner/style.css|<Toaster|vue-sonner" "apps/nexus/app" "apps/nexus/nuxt.config.ts"` 只剩 regression 断言，不再有 app runtime import。
- Focused Vitest：`pnpm -C "apps/nexus" exec vitest run "app/components/content/demo-client-boundary.test.ts" "app/pages/docs/docs-page-performance.test.ts"`，2 files / 47 tests passed。
- Scoped ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/sign-in/index.vue" "app/composables/useSignIn.ts" "app/pages/auth/admin-bootstrap.vue" "nuxt.config.ts" "app/components/content/demo-client-boundary.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/sign-in/index.vue" "apps/nexus/app/composables/useSignIn.ts" "apps/nexus/app/pages/auth/admin-bootstrap.vue" "apps/nexus/nuxt.config.ts" "apps/nexus/app/components/content/demo-client-boundary.test.ts" "docs/plan-prd/TODO-nexus.md"` 通过。
- Curl after（3227）：
  - `/en/docs/dev/components/tabs` cold TTFB 2803.9ms，warm TTFB 27.7ms，status 200。
- Playwright CLI after：
  - 报告：`output/playwright/nexus-docs-sonner-boundary-b44-after-3227-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-sonner-boundary-b44-after-3227-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-sonner-boundary-b44-after-3227-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-sonner-boundary-b44-after-3227-2026-06-21-tabs.har`
  - tabs：status 200，requests 425，scripts 268，styles 39，sonnerRequestCount 0，authGraphRequestCount 0，failedRequestCount 0。

结论：

- 第 43 批遗留的 docs 首访 `vue-sonner` CSS 已清零；tabs request count 463 -> 425，styles 76 -> 39。
- 本批是 CSS/import boundary 收口，不代表生产 chunk/CSS 全量复核完成；production preview 和 chunk 污染仍按任务树独立领取。
- 第 44 批不继续处理首页 WebGL warning、production chunk 复核、share/engagement/comment/right rail 或 pending 组件逐页 demo/API 二刀；这些均从后续任务树领取。

下一批建议：

1. P0：先验证 docs page/layout 的 share、engagement、comment、right rail 非首屏 graph 是否仍进入 public docs 首访；若 HAR 证明为 0，不落无收益代码改动，转查 Nuxt dev macro/runtime 噪音。
2. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot/HAR。
3. P1：production chunk / payload / CSS 复核，确认 docs/store/dashboard/landing 是否仍互相污染。

## 第 45 批收口记录

目标：按用户最新要求快速完成当前任务收尾。第 44 批后先领取 dev SSR TTFB 第五刀候选中的最小验证切片，复核 `/en/docs/dev/components/tabs` 首访 3.5s 窗口内是否还会自动拉起 docs right rail / Assistant / comment / analytics graph；HAR 证明 right rail shell 假设不成立，因此本批不做无收益业务代码改动，只把当前 goal 原句、追加要求、Playwright evidence、docs 文档内容加载、AI review / aireview 未审批组件、route matrix、dev SSR TTFB、Nuxt macro 扫描、production chunk / payload / CSS 复核全部继续固定到本文。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

验证证据：

- Dev server：`pnpm -C "apps/nexus" exec nuxi dev --host 127.0.0.1 --port 3228`。
- curl smoke：`curl -sS -o /tmp/nexus-tabs-3228.html -w ... "http://127.0.0.1:3228/en/docs/dev/components/tabs"`，status 200、HTML 85425 bytes、TTFB 3022.4ms、total 3022.7ms。
- Playwright CLI：`npx -y playwright screenshot --browser=chromium --timeout=45000 --wait-for-timeout=3500 --full-page --save-har "output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.har" "http://127.0.0.1:3228/en/docs/dev/components/tabs" "output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.png"`。
- 报告：`output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.md`。
- JSON：`output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.json`。
- 截图：`output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.png`。
- HAR：`output/playwright/nexus-docs-aside-shell-b45-baseline-3228-2026-06-21.har`。

核心数字：

- status 200，requests 425，scripts 405，styles 40，failed 0。
- `DocsAsideCardsShell` requests 0。
- `DocsAsideCards` requests 0。
- `DocsAssistant` requests 0。
- `TxMarkdownView` requests 0。
- `dompurify` requests 0。
- `vue-sonner` / sonner requests 0。
- auth/profile graph requests 0。
- comments / feedback / analytics matches 2；两条均为 Nuxt dev page macro 扫描：`/_nuxt/pages/dashboard/admin/analytics.vue?macro=true`、`/_nuxt/pages/dashboard/admin/doc-comments.vue?macro=true`，不是 docs runtime import。

收口口径：

- 第 45 批不修改 `apps/nexus/**` 业务代码，因为 HAR 没有证明 right rail shell / Assistant 是当前 tabs 首访瓶颈。
- Nuxt dev `?macro=true` 全页面 meta 扫描继续放入 dev SSR / route macro 专项，后续单独判断是否能通过 route manifest、page meta extraction 或 dev-only route split 降低冷启动噪音。
- 后续 docs 文档内容、AI review / aireview 相关工作统一从 `后续任务树` 领取，不再从聊天上下文临时恢复范围。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；优先 Nuxt dev macro 扫描 / dev SSR TTFB、pending 工作表剩余页面分组、production chunk/CSS 复核或 route matrix 二轮。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- `output/playwright/` 继续作为 ignored evidence 目录，只引用路径，不纳入 git。

## 第 46 批收口记录

目标：继续领取第 45 批后的 dev SSR / Nuxt macro 与 pending / aireview 抽样。先做 `experimental.typedPages` A/B，不把无效配置实验落成代码；随后用 Playwright CLI 对 `/en/docs/dev/components/tabs`、`/en/docs/dev/components/auto-sizer`、`/en/docs/dev/components/scroll` 做 3.5s 首访 screenshot/HAR，确认 `auto-sizer` / `scroll` 当前没有 `body=1`、demo registry、Assistant、sonner 或 current-user profile graph 抢首访。

改动范围：

- `docs/plan-prd/TODO-nexus.md`
- `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`

验证证据：

- Dev server：`pnpm -C "apps/nexus" exec nuxi dev --host 127.0.0.1 --port 3229`。
- `typedPages=false` A/B：临时关闭 `apps/nexus/nuxt.config.ts` 的 `experimental.typedPages` 后重跑 tabs Playwright，配置已恢复。
  - JSON：`output/playwright/nexus-docs-typed-pages-b46-after-3229-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-typed-pages-b46-after-3229-2026-06-21.png`
  - HAR：`output/playwright/nexus-docs-typed-pages-b46-after-3229-2026-06-21.har`
- Playwright CLI pending sample：
  - 报告：`output/playwright/nexus-docs-pending-b46-sample-3229-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b46-sample-3229-2026-06-21.json`
  - tabs 截图/HAR：`output/playwright/nexus-docs-pending-b46-sample-3229-2026-06-21-tabs.png` / `.har`
  - auto-sizer 截图/HAR：`output/playwright/nexus-docs-pending-b46-sample-3229-2026-06-21-auto-sizer.png` / `.har`
  - scroll 截图/HAR：`output/playwright/nexus-docs-pending-b46-sample-3229-2026-06-21-scroll.png` / `.har`
- Node fetch smoke（curl 在当前 shell 不可用）：tabs status 200 / header 75.2ms / total 77.0ms；auto-sizer status 200 / header 29.4ms / total 29.9ms；scroll status 200 / header 33.8ms / total 34.1ms。
- Search / source check：`@sidebase/nuxt-auth` client runtime 来源为模块全局 plugin `apps/nexus/node_modules/@sidebase/nuxt-auth/dist/runtime/plugin.js`，不是 docs 业务 `useCurrentUserApi` 回退；`globalAppMiddleware` 默认未开启，但 module plugin 仍会初始化 `useAuthState()` / `useAuth()` / refresh handler。
- `output/playwright/` 已由 `.gitignore` 忽略，临时 `.tmp-b46-pw` 采样尝试也留在 ignored evidence 目录，不纳入提交。

核心数字：

- `typedPages=false` tabs：status 200，requests 425，scripts 405，styles 40，failed 0，macro 61，adminMacro 15；结论是 `typedPages` 不是 `?macro=true` 请求根因。
- tabs current sample：status 200，requests 416，scripts 415，styles 35，failed 0，macro 61，adminMacro 15，authPageMacro 3，`body=1` 0，demo registry 0，Assistant/dom 0，sonner 0，current-user 0，sidebase client runtime 12。
- auto-sizer current sample：status 200，requests 417，scripts 416，styles 35，failed 0，macro 61，adminMacro 15，authPageMacro 3，`body=1` 0，demo registry 0，Assistant/dom 0，sonner 0，current-user 0，sidebase client runtime 12。
- scroll current sample：status 200，requests 417，scripts 416，styles 35，failed 0，macro 61，adminMacro 15，authPageMacro 3，`body=1` 0，demo registry 0，Assistant/dom 0，sonner 0，current-user 0，sidebase client runtime 12。
- `/api/auth/*` request count 为 0；12 条 `@sidebase/nuxt-auth` 是 dev client runtime 模块请求，3 条 auth macro 是 Nuxt dev page meta 扫描。

收口口径：

- 第 46 批不修改 `apps/nexus/**` 业务代码，因为 `typedPages` A/B 无收益，`auto-sizer` / `scroll` 已证明首访没有 `body=1` / demo registry / current-user 回退，sidebase runtime 拆分属于认证模块边界变更，需要独立批次验证 sign-in / dashboard。
- `@sidebase/nuxt-auth` module-level client runtime 是新的 P0 候选：目标是让公开 docs 首访不下载 auth client runtime，同时保持 `dashboard`、`team/join`、`auth/admin-bootstrap`、sign-in OAuth callback 和 header user menu 行为正确。
- Nuxt dev `?macro=true` 仍是独立候选；`typedPages=false` 已排除，后续不要重复试同一方向。
- 下一批优先二选一：P0 sidebase auth runtime boundary；P0 production chunk / payload / CSS 复核；P1 unsampled pending `text-transformer` / `base-surface` baseline。

## 第 38 批收口记录

目标：继续领取 P0 `fusion` / `card` demo / API table 二刀。先跑 Playwright-core baseline，不预设代码改动；baseline 证明 `fusion` / `card` 的 API/Props table 首屏节点为 0，demo registry / demo chunks 为 0，真正剩余的首屏 DOM 压力是 `card` Basic Usage 在第二个 `h2` 前保留了 2 个 demo shell。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- `resolveDeferredBodySplitIndex()` 保留原有第二个 `h2` split 语义，同时统计 deferred boundary。
- 对 pending 组件文档，如果第二个 demo/API boundary 早于第二个 `h2`，从第二个 boundary 前的 `h3` 开始后置。
- 这样首屏保留 headline、summary 和第一个 demo shell；第二个 demo、后续 API/Props、code examples 仍等用户意图、滚动或 idle 后挂载。
- `tabs` reviewed+verified 页面仍不走 pending deferred body，不误伤触发页已审核文档。

验证证据：

- HTTP smoke（3219 dev server）：
  - `/en/docs/dev/components/tabs` status 200，warm TTFB 78ms，HTML 85404 bytes。
  - `/en/docs/dev/components/fusion` status 200，warm TTFB 42ms，HTML 86064 bytes。
  - `/en/docs/dev/components/card` status 200，warm TTFB 40ms，HTML 86185 bytes。
  - `fusion body=0` 447 bytes；`fusion body=1` 66951 bytes。
  - `card body=0` 501 bytes；`card body=1` 79683 bytes。
- Baseline Playwright-core：
  - 报告：`output/playwright/nexus-docs-demo-api-b38-baseline-3219-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-demo-api-b38-baseline-3219-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`fusion`、`card` 的 `*-initial.png`、`*-after-scroll.png`、`.har`。
  - `tabs`：status 200，requests 444，failed/warnings/errors 0，initial shell false，initial demos 7，props nodes 0。
  - `fusion`：status 200，requests 436，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true。
  - `card`：status 200，requests 443，failed/warnings/errors 0，initial shell true，initial demos 2，props nodes 0，after deferred true。
- After Playwright-core：
  - 报告：`output/playwright/nexus-docs-demo-api-b38-after-3219-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-demo-api-b38-after-3219-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`fusion`、`card` 的 `*-initial.png`、`*-after-scroll.png`、`.har`。
  - `tabs`：status 200，requests 436，failed/warnings/errors 0，initial shell false，initial demos 7，props nodes 0，确认 reviewed+verified 触发页未被误伤。
  - `fusion`：status 200，requests 436，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true。
  - `card`：status 200，requests 440，failed/warnings/errors 0，initial shell true，initial demos 1，props nodes 0，after deferred true；核心收益为 initial demo shells 2 -> 1。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 28 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md" "docs/plan-prd/TODO-nexus.md"`。

下一批建议：

1. P0：抽样 `base-anchor` / `select` / `radio` 等 strict pending verified 页面，确认第 36/38 批通用规则覆盖更多非 Top 页面。
2. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。
3. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot / HAR。
4. P1：`fusion` / `card` production chunk / route-switch timing 复核；dev 初始 API/demo eager 路径已 clean。

## 第 37 批收口记录

目标：按用户最新要求快速完成当前任务收尾。当前批只更新 `docs/plan-prd/TODO-nexus.md`，把后续 docs 文档内容加载、AI review / aireview 未审批组件优化、全站 route matrix 二轮、dev SSR TTFB、首页剩余 warning、生产 chunk / payload / CSS 复核全部放入本文，作为后续唯一领取入口。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 当前 goal 原句、用户追加要求、触发页、已完成批次、真实提交 hash、子任务百分比、验证证据路径和后续任务树均保留在本文。
- 后续 docs 文档内容和 AI review / aireview 相关事项不再从聊天上下文临时恢复范围，统一从 `后续任务树` 领取。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；禁止一次性混入 docs demo、DocApiTable、section split、首页 warning、TTFB、chunk 复核等多个方向。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- 本批不新增业务代码、不新增测试文件、不新增 Playwright artifact、不触碰 CoreApp / AI dirty files。

下一批领取优先级：

1. P0：`fusion` / `card` demo / API table 二刀，独立确认 DocApiTable / TuffPropsTable 是否仍有 production chunk 污染或首屏 eager import。
2. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。
3. P0：抽样另一个 strict pending verified 页面，例如 `base-anchor` / `select` / `radio`，确认第 36 批规则覆盖不止 `glass-surface`。
4. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot / HAR。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 36 批收口记录

目标：继续领取 pending / aireview 文档优化小切片。第 35 批后 TODO 固定下一步优先 `glass-surface` / `gradual-blur`，本批先跑 Playwright/CDP baseline，发现 `gradual-blur` 已被第 34 批 fallback split 覆盖，但 `glass-surface` 因 `verified: true` 被 `docSyncStatus === verified` 逻辑排除，虽然它仍是 `syncStatus: migrated`，按 strict pending 口径属于 AI review / aireview 待继续优化页面。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- 新增 `isDocPerformancePending`，按 `syncStatus !== reviewed/verified || verified !== true` 控制性能 deferred body。
- 保留 `docSyncStatus`、`isDocVerified`、Verified badge 和 AI migrated banner 的既有 UI 语义，不把展示状态与性能 pending 状态混在一起。
- `syncStatus: reviewed + verified: true` 的触发页 `tabs` 不启用 deferred body，避免把已审阅页面误纳入 pending 性能路径。
- `syncStatus: migrated + verified: true` 的 `glass-surface` 现在启用首屏/后半段 split，API/Props 和后续 demo 延迟到用户滚动/意图或 idle 后挂载。

验证证据：

- HTTP smoke（3218 dev server）：
  - `/en/docs/dev/components/glass-surface` status 200，HTML 86185 bytes，标题 `GlassSurface | Tuff Docs`。
  - `/en/docs/dev/components/gradual-blur` status 200，HTML 85863 bytes，标题 `GradualBlur | Tuff Docs`。
  - `glass-surface body=0` 575 bytes；`glass-surface body=1` 21602 bytes。
  - `gradual-blur body=0` 531 bytes；`gradual-blur body=1` 39915 bytes。
- Baseline Playwright/CDP：
  - 报告：`output/playwright/nexus-docs-pending-b36-baseline-3218-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b36-baseline-3218-2026-06-21.json`
  - 截图/HAR：同前缀 `glass-surface`、`gradual-blur` 的 `.png` / `.har`。
  - `glass-surface`：requests 453，scripts 419，styles 16，failed/warnings/errors 0；initial shell false、API false、demo title false，滚动后 API/demo true。说明该页被 full body 延迟加载但未进入 section-level deferred shell。
  - `gradual-blur`：requests 452，scripts 417，styles 16，failed/warnings/errors 0；initial shell true、API false、demo title false，滚动后 deferred true、API/demo true。说明第 34 批 fallback 已覆盖。
- After Playwright/CDP：
  - 报告：`output/playwright/nexus-docs-pending-b36-after2-3218-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b36-after2-3218-2026-06-21.json`
  - 截图/HAR：同前缀 `tabs`、`glass-surface`、`gradual-blur` 的 `.png` / `.har`。
  - `tabs`：requests 450，scripts 415，styles 16，failed/warnings/errors 0；initial shell false、API true、demo title true，确认 reviewed+verified 触发页未被误伤。
  - `glass-surface`：requests 465，scripts 430，styles 16，failed/warnings/errors 0；initial shell true、API false、demo title false、props-table nodes 0；滚动后 deferred true、API true、demo title true、props-table nodes 126。
  - `gradual-blur`：requests 450，scripts 415，styles 16，failed/warnings/errors 0；initial shell true、API false、demo title false；滚动后 deferred true、API true、demo title true。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 28 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md" "docs/plan-prd/TODO-nexus.md"`。

下一批建议：

1. P0：`fusion` / `card` demo / API table 二刀，独立确认 DocApiTable / TuffPropsTable 是否仍有 production chunk 污染或首屏 eager import。
2. P0：dev SSR TTFB 二轮，区分 Nuxt dev transform、Content query/frontmatter fast path、i18n init、store memory init 与 middleware。
3. P0：抽样另一个 strict pending verified 页面，例如 `base-anchor` / `select` / `radio`，确认第 36 批规则覆盖不止 `glass-surface`。

## 第 27 批收口记录

目标：按用户最新要求快速完成当前任务收尾。当前批只更新 `docs/plan-prd/TODO-nexus.md`，把后续 docs 文档内容加载、AI review / aireview 未审批组件、全站页面切换矩阵二轮、dev SSR TTFB、首页剩余 warning、生产 chunk / payload / CSS 复核等全部放进本文，作为后续唯一领取入口。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 当前 goal 原句、追加收尾要求、触发页、已完成批次、子任务百分比、近期提交和 Playwright / HAR / Markdown / JSON 证据路径均保留在本文。
- 后续 docs 文档内容和 aireview 未审批组件不再从聊天上下文临时恢复范围，统一从 `后续任务树` 领取。
- 下一批只允许选择 1 个 P0 子任务和 1-2 个页面先跑 baseline，再决定是否落代码；禁止一次性混入 docs demo、DocApiTable、section split、首页 warning、TTFB、chunk 复核等多个方向。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- 本批不新增业务代码、不新增测试文件、不新增 Playwright artifact；沿用第 21 / 22 / 24 / 26 批已有性能证据作为最近基线。

下一批领取优先级：

1. P0：pending / aireview 工作表，先按 `syncStatus`、`verified`、正文大小、demo 数、code block 数、API table、首屏请求数排序，再选 `fusion` / `card` / `avatar-variants` 之一做 demo lazy boundary 或 section-level split。
2. P0：dev SSR TTFB 基线，覆盖 `/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect，区分 Nuxt transform、content query、i18n、store memory init 和 middleware。
3. P0：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new` screenshot / HAR。
4. P1：生产 chunk / payload / CSS 复核，确认 docs、store、dashboard、landing 是否仍有互相污染；若存在，优先修 import boundary / layout boundary / component registration。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 26 批收口记录

目标：继续收敛 `/en/docs/dev/components/tabs` 文档页在用户扫过页面底部 Prev / Next pager 时提前预取下一篇完整正文的问题。第 22 批已修 sidebar full-body prefetch，但 docs page 自身 pager 仍会在 hover/focus 后约 220ms 预取目标页 `body=1`，短暂停留也会把下一篇正文排进网络队列。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- pager intent 现在拆成 metadata 与 full body 两段：立即预热目标 route component + `/api/docs/page?body=0` metadata。
- full `body=1` 预取使用 `DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS = 900` 与 idle callback，只在持续 hover/focus/touch 意图后进入。
- 新增 pending timer / idle id map；`blur`、`mouseleave`、route change、unmount 会取消尚未触发的 full-body 预取。
- 已缓存或已 full-body 预取的目标继续去重，避免重复请求。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、Sass legacy API、Nuxt module preload sourcemap、node externalized、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- HTTP smoke：3200 dev server 上 `/en/docs/dev/components/tabs` 为 200；HTML 85548 bytes；`/api/docs/page?body=0` 455 bytes；`/api/docs/page?body=1` 48511 bytes。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-pager-prefetch-b26-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pager-prefetch-b26-baseline-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-pager-prefetch-b26-baseline-3200-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-pager-prefetch-b26-baseline-3200-2026-06-21-tabs.har`
  - baseline：status 200，requests 501，scripts 476，styles 16，failed 0，console warnings/errors 0，docs page API total 3，`body=1` total 2，pager hover window `body=1` 为 1；hover target 为 `Next chapter TagInput`。
- Playwright after：
  - 报告：`output/playwright/nexus-docs-pager-prefetch-b26-after-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pager-prefetch-b26-after-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-pager-prefetch-b26-after-3200-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-pager-prefetch-b26-after-3200-2026-06-21-tabs.har`
  - after：status 200，requests 482，scripts 458，styles 16，failed 0，console warnings/errors 0，docs page API total 2，`body=1` total 1，short pager hover window `body=1` 为 0；hover window 只剩 `tag-input body=0` metadata 请求。

## 第 25 批收口记录

目标：按用户最新追加要求快速完成当前任务收尾，把后续 docs 文档内容加载、AI review / aireview 未审批组件、全站 route matrix、dev SSR TTFB、生产 chunk / payload / CSS 复核等工作全部沉淀到本文；当前批不继续扩展代码改动。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 当前 goal 原句、用户追加要求、触发页、子任务百分比、已完成批次、验证证据路径和后续执行队列均保留在本文。
- 后续 docs / aireview 相关工作统一从 `后续任务树` 领取，不再从聊天上下文临时恢复范围。
- 下一批必须先选 1 个 P0 子任务和 1-2 个页面，跑 Playwright / HAR baseline，再决定是否落代码。
- 每批结束继续回填本文：提交 hash、改动范围、测试命令、核心性能数字、Playwright screenshot / HAR / Markdown / JSON 路径和下一批候选。
- 本批不新增业务代码、不新增测试文件、不新增 Playwright artifact；沿用第 21 / 22 / 24 批已有性能证据作为最近基线。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 24 批收口记录

目标：继续收敛 `/en/docs/dev/components/tabs` 首访慢加载问题。第 23 批后未继续改代码；本批重新用 3200 dev server 验证发现 `/api/docs/navigation?locale=en` 约 49KB，且作为 SSR async-data 注入 HTML，并携带 guide、api、architecture 等对 component docs 首屏无关的导航分支。

改动范围：

- `apps/nexus/server/api/docs/navigation.get.ts`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `docs/plan-prd/TODO-nexus.md`

实现口径：

- `/api/docs/navigation` 新增 `scope=components`，服务端在 locale 过滤后只返回 `/docs/dev/components` 节点分支；未传 scope 的非组件 docs 仍返回完整 docs tree。
- docs page 在 component docs route 下使用 key `docs-navigation:${locale}:components`，query 增加 `scope=components`；非组件 docs 保持 `all` scope。
- `DocsSidebar` 同步使用相同 scope / key，避免页面和侧栏 async-data key 漂移。
- 不改变 component sidebar metadata lazy load，不回退第 22 批的 full-body prefetch cancel 行为。

验证证据：

- HTTP baseline：`/api/docs/navigation?locale=en` 49291 bytes；`/api/docs/page?body=0` 455 bytes；`/api/docs/page?body=1` 48511 bytes；tabs HTML 107061 bytes。
- HTTP after：`/api/docs/navigation?locale=en&scope=components` 16786 bytes，navigation 节点 244 -> 110；tabs HTML 86611 bytes。
- HTML smoke：after HTML 包含 `Tabs` 和 component nav，包含 `docs-navigation:en:components`，不再包含 Architecture / Guide payload。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/components/DocsSidebar.vue" "server/api/docs/navigation.get.ts" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/components/DocsSidebar.vue" "apps/nexus/server/api/docs/navigation.get.ts" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、Sass legacy API、Nuxt module preload sourcemap、node externalized、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-navigation-scope-b24-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-navigation-scope-b24-baseline-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-navigation-scope-b24-baseline-3200-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-navigation-scope-b24-baseline-3200-2026-06-21-tabs.har`
  - baseline：428 requests，failed 0，scripts 408，styles 40，HAR 中 navigationRequests 0（navigation 由 SSR payload 注入）。
- Playwright after：
  - 报告：`output/playwright/nexus-docs-navigation-scope-b24-after-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-navigation-scope-b24-after-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-navigation-scope-b24-after-3200-2026-06-21-tabs.png`
  - HAR：`output/playwright/nexus-docs-navigation-scope-b24-after-3200-2026-06-21-tabs.har`
  - after：429 requests，failed 0，scripts 409，styles 39，body=1 仍为 1，sidebar-components 仍为 1；收益来自 SSR payload 缩小，不表现为额外 request 数下降。

## 第 23 批收口记录

目标：按用户追加要求快速完成当前任务收尾，把后续 docs 文档内容加载、AI review / aireview 未审批组件优化、全站 route matrix、dev SSR TTFB、生产 chunk 复核等全部沉淀到本文，不在当前批继续扩大代码改动。

改动范围：

- `docs/plan-prd/TODO-nexus.md`

收口口径：

- 当前 goal 原句与用户追加要求保留在本文 `Goal 原句` 区块，后续接手时不需要翻聊天记录确认范围。
- 当前总进度继续按约 85% 估算；第 23 批本身为文档收口 100%，不改变代码性能数字。
- 后续 docs / aireview 相关工作统一从 `后续任务树` 领取，按小批次执行：先跑 Playwright / HAR baseline，再落代码，再跑 focused test / scoped ESLint / `git diff --check` / Playwright 报告，最后回填本文并提交。
- 本批不新增业务代码、不新增测试文件、不新增 Playwright artifact；第 21 / 22 批已有截图、HAR、Markdown、JSON 报告继续作为最近性能证据。
- `output/playwright/` 继续保持 ignored evidence，只引用路径，不纳入 git。
- 当前工作树的 CoreApp / AI 改动属于其它任务线，本批不得 stage 或提交。

下一批入口建议：

1. P0 首选：建立 pending 组件工作表，按 `syncStatus`、`verified`、正文体量、demo 数、API table、首屏请求数排序，先拿 `fusion` / `card` / `avatar-variants` 中 1 个页面做 section-level split 或 demo lazy boundary。
2. P0 并行候选：dev SSR TTFB 基线，覆盖 `/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect，区分 Nuxt transform、content query、i18n、store memory init 和 middleware。
3. P0 验收候选：route matrix 二轮，补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache 与 `/new` Playwright screenshot/HAR。
4. P1 候选：生产 chunk / payload / CSS 复核，确认 docs、store、dashboard、landing 是否仍有互相污染；若存在，优先修 import boundary / layout boundary / component registration。

验证证据：

- Markdown whitespace：`git diff --check -- "docs/plan-prd/TODO-nexus.md"`。

## 第 22 批收口记录

目标：收紧 component docs sidebar 的 intent prefetch。第 21 批后页面首访已经 metadata-first，但 sidebar 链接仍会在 hover/focus 后短延迟预取完整 `body=1` 正文；鼠标扫过 pending 组件列表时，会把多篇 30-80KB Markdown 正文请求排进网络队列。

改动范围：

- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- `prefetchDocsTarget()` 继续立即预热 route component 和 `body=0` metadata，保持页面切换链接反馈。
- full `body=1` 预取改为独立的 `scheduleDocsFullBodyPrefetch()`，等待 `COMPONENT_DOCS_FULL_BODY_PREFETCH_DELAY_MS = 900` 后再进入 idle callback。
- 新增 pending timer / idle id map，`blur` / `mouseleave` 调用 `cancelDocsFullBodyPrefetch()` 取消尚未触发的 full-body 预取。
- 已完成 full body 的目标仍用 `prefetchedDocsFullBodyTargets` 去重，避免同一目标重复请求。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/components/DocsSidebar.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/components/DocsSidebar.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；Nuxt client/server/Nitro/PWA 构建完成，生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、UnoCSS web font timeout、node externalized、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- Baseline report：
  - 报告：`output/playwright/nexus-docs-pending-b22-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b22-baseline-3200-2026-06-21.json`
  - 截图/HAR：同前缀 `gradual-blur`、`auto-sizer`、`scroll` 的 `.png` / `.har`。
  - `gradual-blur`：361 requests，failed 0，demo registry/client renderer 0。
  - `auto-sizer`：361 requests，failed 0，demo registry/client renderer 0。
  - `scroll`：423 requests，failed 0，1.8s 窗口内 `body=1` 为 1。
- After report：
  - 报告：`output/playwright/nexus-docs-pending-b22-after-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b22-after-3200-2026-06-21.json`
  - 截图/HAR：同前缀 `gradual-blur`、`auto-sizer`、`scroll` 的 `.png` / `.har`。
  - `scroll`：423 -> 419 requests，420 -> 418 scripts，34 -> 33 styles，failed 0，1.8s 窗口内 `body=1` 1 -> 0。
  - `gradual-blur` / `auto-sizer`：failed 0，demo registry/client renderer 0；request count 有 dev server/HMR/cache 波动，不作为本批收益归因。
  - MCP Playwright `browser_navigate` 再次 300s 超时；本批继续使用 `npx --yes playwright screenshot --save-har` 输出证据，不新增 Playwright 测试文件。

## 第 21 批收口记录

目标：收敛 AI review / aireview pending 组件文档在 dev SSR 首访时同步解析和输出整篇正文的问题。第 21 批 baseline 证明 `fusion` / `card` / `avatar-variants` / `tabs` 没有 API table，demo registry / client renderer 在点击 Run 前也没有首屏请求；真正的当前瓶颈是 dev SSR 仍用 `body=1` 把 37-80KB 正文塞进首访 HTML。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 新增 `shouldRequestMetadataOnlyDocBody = shouldSplitDocBody && (import.meta.client || import.meta.dev)`。
- dev SSR 与 client 组件文档请求 `body=0` metadata；client hydration / idle 继续通过既有 `startFullDocFetchForRoute()` 请求 `body=1` full body。
- production SSR 仍请求 `body=1`，不牺牲生产 SEO、结构化数据和首屏完整正文。
- 不新增宽泛测试脚手架，不改 demo registry，不引入 IntersectionObserver 到 `TuffDemoWrapper`。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；Nuxt client/server/Nitro/PWA 构建完成，生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、node externalized、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- Baseline report：
  - 报告：`output/playwright/nexus-docs-pending-b21-baseline-3213-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b21-baseline-3213-2026-06-21.json`
  - 截图/HAR：同前缀 `fusion`、`card`、`avatar-variants`、`tabs` 的 `.png` / `.har`。
  - API payload：`body=0` 约 455-615 bytes；`body=1` 约 37-80KB。
  - demo registry / `TuffDemoClientRenderer` / demo chunks：初始视图均为 0。
- After report：
  - 报告：`output/playwright/nexus-docs-pending-b21-after-3213-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-b21-after-3213-2026-06-21.json`
  - 截图/HAR：同前缀 `fusion`、`card`、`avatar-variants`、`tabs` 的 `.png` / `.har`。
  - fusion：curl TTFB 2850ms -> 241ms，HTML 185053 -> 109102 bytes。
  - card：HTML 201367 -> 108123 bytes。
  - avatar-variants：HTML 149272 -> 107370 bytes。
  - tabs：HTML 156828 -> 106709 bytes。
  - after HAR：每页仍在 hydration/idle 后有 1 个 `body=1` 请求填正文，failed 0，demo registry / `TuffDemoClientRenderer` / demo chunks 仍为 0。

## 第 20 批收口记录

目标：修复 Playwright / curl 在 zh 首访 landing route 时暴露的 `landing.*` missing key warning。根因不是缺文案，而是 route-local `landing` message chunk 已按默认 locale 合并后，`useLocaleOrchestrator()` 又根据浏览器 / `Accept-Language` 切换到 `zh`，切换前没有补齐当前 route 的 zh route-local chunk。

改动范围：

- `apps/nexus/app/utils/route-locale-chunks.ts`
- `apps/nexus/app/middleware/i18n-route-chunks.global.ts`
- `apps/nexus/app/composables/useLocaleOrchestrator.ts`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 新增共享 `normalizeRouteLocalePath()` / `resolveRouteLocaleChunks()`，把原 middleware 内的 route -> chunk 判定迁到 `route-locale-chunks.ts`。
- `i18n-route-chunks.global.ts` 与 `useLocaleOrchestrator.ts` 共用同一套 route-local chunk 判定，避免 landing / dashboard route 判定漂移。
- `setLocaleSerial()` 在 `setLocale()` 前调用 `ensureCurrentRouteLocaleChunks(normalized)`，确保当前 route 需要的目标语言 chunk 已经 merge 到 composer。
- 不把 `landing` / `dashboard` route-local messages 放回全局 i18n，不补全局大包，不改变 docs route 的 chunk 边界。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/utils/route-locale-chunks.ts" "app/middleware/i18n-route-chunks.global.ts" "app/composables/useLocaleOrchestrator.ts" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/utils/route-locale-chunks.ts" "apps/nexus/app/middleware/i18n-route-chunks.global.ts" "apps/nexus/app/composables/useLocaleOrchestrator.ts" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 完整通过；Nuxt client/server/Nitro/PWA 构建完成，生产仍生成 `sw.js` / `workbox-*.js`。构建中仍有既有 browserslist、chunk size、OpenAI ESM top-level `this` warning，不归因于本批。
- HTTP smoke：3212 dev server 上使用 `Accept-Language: zh-CN,zh;q=0.9,en;q=0.1` 访问 `/` 与 `/new` 均为 200；`/` TTFB 3339ms / total 3341ms / size 188984，`/new` TTFB 3296ms / total 3300ms / size 200374。dev SSR TTFB 仍约 3.3s，继续进入后续 P1，不在本批冒进。
- HTML smoke：`/tmp/nexus-home-zh-3212.html` 与 `/tmp/nexus-new-zh-3212.html` 均为中文 landing 文案，不再包含 `landing.*` key 字符串。
- Dev server after 日志：请求 `/` 与 `/new` 后未出现 `landing.*` missing key warning；仅有既有 browserslist 和 i18n initialized 信息。
- Playwright CLI after：
  - 报告：`output/playwright/nexus-landing-locale-chunk-b20-after-3212-2026-06-21.md`
  - JSON：`output/playwright/nexus-landing-locale-chunk-b20-after-3212-2026-06-21.json`
  - home 截图：`output/playwright/nexus-landing-locale-chunk-b20-after-3212-2026-06-21-home.png`
  - home HAR：`output/playwright/nexus-landing-locale-chunk-b20-after-3212-2026-06-21-home.har`
  - home：status 200, requests 391, failed 0。
  - `/new`：curl / HTML / server log 证据已通过；Playwright screenshot/HAR 尝试因 Chrome target closed 未捕获，留到 route matrix 二轮补截图。

## 第 19 批收口记录

目标：把第 18 批 dev server 日志中仍会运行时发现的 route-local 依赖前移到 Vite dev pre-bundle，避免访问 docs renderer、dashboard chart、sign-in toast 等路由时触发 dependency discovery / reload，减少页面切换中的开发态卡顿。

改动范围：

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`

实现口径：

- 在 `vite.optimizeDeps.include` 中新增 `marked`、`echarts/core`、`echarts/charts`、`echarts/components`、`echarts/renderers`、`vue-sonner`。
- 新增 focused 文本测试，钉住这些依赖继续处于 dev pre-bundle 白名单。
- 不把 `vue-sonner/style.css` 全局化，不改变 production lazy split，不扩大到 docs demo / aireview 逐页优化。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/components/content/demo-client-boundary.test.ts"`，1 file / 16 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/components/content/demo-client-boundary.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/components/content/demo-client-boundary.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 第二次完整通过；第一次曾出现 `packages/tuffex/dist/es/flat-button/index.js` 解析 `./src/TxFlatButton.vue.js` 的瞬时 Rollup resolve 失败，复查文件存在且 `packages/tuffex` 未改，第二次越过该点并完成 Nuxt client/server/Nitro/PWA 构建，判断为缓存/竞态类瞬时失败，后续若复现再单独追。
- HTTP smoke：3211 dev server 上 `/`、`/store`、`/en/docs/dev/components/tabs` 均为 200；curl 采样 `docs-tabs` TTFB 3043ms / total 3071ms，`home` TTFB 3769ms / total 3776ms，`store` TTFB 4030ms / total 4031ms。dev SSR TTFB 仍偏高，已进入后续 TODO。
- Playwright CLI after：
  - 报告：`output/playwright/nexus-route-local-deps-b19-after-3211-2026-06-21.md`
  - JSON：`output/playwright/nexus-route-local-deps-b19-after-3211-2026-06-21.json`
  - HAR/截图：同前缀 `home`、`store`、`sign-in`、`dashboard-overview`、`docs-tabs` 的 `.har` / `.png`。
  - home：requests 441, scripts 438, failed 0, target deps 0。
  - store：requests 507, scripts 505, failed 0, target deps 1。
  - sign-in：requests 515, scripts 513, failed 0, target deps 4。
  - dashboard-overview：requests 488, scripts 483, failed 0, target deps 4。
  - docs-tabs：requests 455, scripts 452, failed 0, target deps 2。
  - 说明：HAR 中的 target deps 是对应 route 的正常预打包脚本 / CSS 请求，不再代表 Vite 运行中发现依赖并 reload。
- Dev server after 日志：
  - 未再出现 `Vite discovered new dependencies` / `New dependencies found` 中的 `marked`、`echarts/*`、`vue-sonner`。
  - 仍有既有 browserslist warning、i18n orchestrator init、D1 memory store 提示。
  - Playwright CLI 默认触发 `zh` locale 时，首页暴露大量 `landing.*` zh message missing warning；已作为后续 P0/P1 队列，不纳入第 19 批继续扩大。

## 第 18 批收口记录

目标：把第 18 批 route matrix baseline 中暴露的首页 warning / hydration mismatch 和 Vite runtime dependency reload 做小范围止血，并把 docs / aireview 后续工作留在 TODO 队列，不继续扩大当前批。

改动范围：

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/tuff/TuffStickyBar.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingAuroraBar.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingWaitlist.vue`
- `apps/nexus/app/components/tuff/landing/landing-performance-boundary.test.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`

实现口径：

- `TuffStickyBar` 显式 `inheritAttrs: false`，并把父级 `class` / `data-reveal` 转发到真实 `.TuffStickyBar` DOM，修复 fragment root attrs warning，同时保留 `useGsapReveal` 的目标选择语义。
- `TuffLandingAuroraBar` 不再在组件 setup/computed 中调用 `Math.random()`；`TuffLandingWaitlist` 使用 index seed 生成稳定条带配置，保留视觉分布但保证 SSR/client 首屏样式一致。
- `@vueuse/core` 加入 `vite.optimizeDeps.include`，修复首页视觉路由首次加载时 Vite 运行中发现 `@vueuse/core` 并触发 reload 的问题。
- 新增 focused 文本测试，钉住 landing SSR deterministic boundary 与 sticky attrs forwarding；扩展 demo boundary 测试，钉住 `@vueuse/core` dev pre-bundle。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/components/tuff/landing/landing-performance-boundary.test.ts" "app/components/content/demo-client-boundary.test.ts"`，2 files / 17 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/components/tuff/TuffStickyBar.vue" "app/components/tuff/landing/TuffLandingAuroraBar.vue" "app/components/tuff/landing/TuffLandingWaitlist.vue" "app/components/tuff/landing/landing-performance-boundary.test.ts" "app/components/content/demo-client-boundary.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/components/tuff/TuffStickyBar.vue" "apps/nexus/app/components/tuff/landing/TuffLandingAuroraBar.vue" "apps/nexus/app/components/tuff/landing/TuffLandingWaitlist.vue" "apps/nexus/app/components/tuff/landing/landing-performance-boundary.test.ts" "apps/nexus/app/components/content/demo-client-boundary.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过；生产 PWA 仍生成 `sw.js` / `workbox-*.js`；构建中仍有既有 browserslist、Sourcemap、node fs externalized、chunk size 与 OpenAI ESM top-level `this` warning，不归因于本批。
- Playwright baseline：
  - 报告：`output/playwright/nexus-route-matrix-b18-baseline-3209-2026-06-21.md`
  - JSON：`output/playwright/nexus-route-matrix-b18-baseline-3209-2026-06-21.json`
  - home：status 200, requests 1017, scripts 890, styles 186, failed 4, warnings 52, nodeModules 466, routeLocale 6。
  - store：status 200, requests 1002, scripts 898, styles 162, failed 9, warnings 0。
  - docs-tabs：status 200, requests 426, scripts 395, failed 0, warnings 0。
  - docs-card：status 200, requests 431, scripts 399, failed 0, warnings 0。
  - dashboard / provider-registry / governance：未登录场景按预期 redirect 到 `/sign-in`。
- Playwright after：
  - 报告：`output/playwright/nexus-route-matrix-b18-after-3210-2026-06-21.md`
  - JSON：`output/playwright/nexus-route-matrix-b18-after-3210-2026-06-21.json`
  - HAR/截图：同前缀 `home`、`docs-index`、`docs-tabs`、`docs-card`、`store`、`dashboard`、`provider-registry`、`governance`、`switch-home-to-store` 的 `.har` / `.png`。
  - home：status 200, requests 579, scripts 515, styles 57, failed 2, warnings 17, nodeModules 234, routeLocale 1；`TuffStickyBar` attrs warning 0，aurora hydration mismatch 0。
  - docs-index：status 200, requests 430, scripts 402, failed 0, warnings 0。
  - docs-tabs：status 200, requests 425, scripts 395, failed 0, warnings 0, H1 `Tabs`。
  - docs-card：status 200, requests 430, scripts 399, failed 0, warnings 0, H1 `Card`。
  - store：status 200, requests 991, scripts 889, failed 1, warnings 0。
  - dashboard：status 200 -> final `/sign-in`, requests 951, scripts 850, failed 1, warnings 0。
  - provider-registry：status 200 -> final `/sign-in`, requests 470, scripts 419, failed 0, warnings 0。
  - governance：status 200 -> final `/sign-in`, requests 489, scripts 434, failed 0, warnings 0。
  - home -> store：status 200, final `/store`, requests 75, scripts 72, failed 0, warnings 0。
- Dev server after 日志：
  - `@vueuse/core` 不再出现在 Vite runtime dependency discovery 中。
  - 剩余 runtime discovery：`marked`、`echarts/core`、`echarts/charts`、`echarts/components`、`echarts/renderers`、`vue-sonner`；已作为后续第 19 批候选，不纳入第 18 批继续扩大。
- 第 18 批 baseline 对比：
  - home：1017 requests / 890 scripts / 186 styles / 52 warnings / 466 nodeModules -> 579 / 515 / 57 / 17 / 234。
  - docs-tabs：426 requests / 395 scripts / warning 0 -> 425 / 395 / warning 0。
  - docs-card：431 requests / 399 scripts / warning 0 -> 430 / 399 / warning 0。
  - switch-home-to-store：681 requests / 586 scripts / 52 warnings -> 75 / 72 / 0 warnings。

## 第 17 批收口记录

目标：减少普通 dev docs 首屏 PWA runtime/plugin 请求，并修复禁用 `@vite-pwa/nuxt` module 后根组件仍渲染 `<VitePwaManifest />` 导致的 Vue warning。PWA 是生产能力，不应在普通 docs dev 调试链路里抢占首屏脚本窗口；需要显式 `pnpm -C "apps/nexus" run dev:pwa` 时才启用 dev PWA。

改动范围：

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/NexusPwaManifest.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 新增 `enablePwaModule = isProd || process.env.VITE_PLUGIN_PWA === 'true'`，普通 dev 的 Nuxt modules 不再注入 `@vite-pwa/nuxt`。
- 保留 production 和 `dev:pwa`：生产构建仍启用 PWA module，`dev:pwa` 继续显式走 `VITE_PLUGIN_PWA=true nuxt dev`。
- 新增 `NexusPwaManifest.vue` wrapper：只有 `import.meta.env.PROD` 或 `import.meta.env.VITE_PLUGIN_PWA === 'true'` 时才解析 `VitePwaManifest`，普通 dev 渲染空节点，避免 module 未启用时的未知组件 warning。
- `app.vue` 从直接渲染 `<VitePwaManifest />` 改为显式 import `<NexusPwaManifest />`。
- 扩展 docs page performance focused test，钉住 PWA module gate、`dev:pwa` 显式入口、root wrapper 和不直接 import `@vite-pwa/nuxt` runtime。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 27 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/app.vue" "app/components/NexusPwaManifest.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/app.vue" "apps/nexus/app/components/NexusPwaManifest.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过；输出显示 PWA generateSW 仍生成 `sw.js` / `workbox-*.js`，确认生产 PWA 行为未被 dev gate 误伤。构建中仍有既有 browserslist、UnoCSS web-font fetch timeout、chunk size 与 OpenAI ESM top-level `this` warning，不归因于本批。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-b17-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b17-baseline-3200-2026-06-21.json`
  - tabs：status 200, requests 419, scripts 400, stylesheets 17, failed 0。
  - fusion：status 200, requests 419, scripts 400, stylesheets 17, failed 0。
  - card：status 200, requests 424, scripts 404, stylesheets 18, failed 0。
  - avatar-variants：status 200, requests 432, scripts 412, stylesheets 18, failed 0。
- Playwright first after（3207）：
  - 报告：`output/playwright/nexus-docs-b17-pwa-dev-gate-3207-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b17-pwa-dev-gate-3207-2026-06-21.json`
  - tabs：requests 413, scripts 394, `pwaClient 0`, failed 0, H1 `Tabs`。
  - fusion：requests 413, scripts 394, `pwaClient 0`, failed 0。
  - card：requests 418, scripts 398, `pwaClient 0`, failed 0。
  - avatar-variants：requests 425, scripts 405, `pwaClient 0`, failed 0。
  - tabs -> card：settled 52ms, requests 418, scripts 398, `pwaClient 0`, failed 0。
- Playwright clean after（3208 wrapper 修复后）：
  - 报告：`output/playwright/nexus-docs-b17-pwa-dev-gate-clean-3208-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b17-pwa-dev-gate-clean-3208-2026-06-21.json`
  - HAR/截图：同前缀 `tabs`、`fusion`、`card`、`avatar-variants`、`switch-tabs-to-card` 的 `.har` / `.png`。
  - tabs：status 200, requests 415, scripts 395, failed 0, `pwaClient 0`, console warning/error 0, H1 `Tabs`。
  - fusion：status 200, requests 415, scripts 395, failed 0, `pwaClient 0`, console warning/error 0, H1 `Fusion`。
  - card：status 200, requests 420, scripts 399, failed 0, `pwaClient 0`, console warning/error 0, H1 `Card`。
  - avatar-variants：status 200, requests 428, scripts 407, failed 0, `pwaClient 0`, console warning/error 0, H1 `Avatar Variants`。
  - tabs -> card：status 200, requests 427, scripts 403, failed 0, `pwaClient 0`, console warning/error 0, H1 `Card`。
- Dev server terminal：3208 页面访问期间无 `Failed to resolve component: VitePwaManifest` warning；仅有既有 browserslist warning 和 i18n orchestrator init log。
- 第 17 批 baseline 对比：
  - tabs：419 requests / 400 scripts -> 413 / 394（3207 first after）且 clean wrapper 后 `pwaClient 0`、warning 0。
  - fusion：419 / 400 -> 413 / 394。
  - card：424 / 404 -> 418 / 398。
  - avatar-variants：432 / 412 -> 425 / 405。
  - 3208 clean 报告使用系统 Chrome 与 bundled Playwright 采样，stylesheet/mdcProse 计数口径与 3207 脚本略不同；本批验收以 `pwaClient 0`、failed 0、warning 0、H1 正确、production PWA build 保持为准。

## 第 16 批收口记录

目标：收口第 15 批遗留的 Nuxt Content generated `#content/components` 默认 Prose registry。第 15 批已经把 docs 主正文 runtime prose 映射改成 native tags，但 clean after 仍有 `mdcProse: 23`，来源是 `@nuxt/content` 生成的 global Prose components；第 16 批单独验证并过滤这一路径。

改动范围：

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/pages/license.vue`
- `apps/nexus/app/pages/privacy.vue`
- `apps/nexus/app/pages/protocol.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 在 `components:extend` ignored patterns 中过滤 `@nuxtjs/mdc/dist/runtime/components/prose/`，避免 Nuxt Content 生成 `#content/components` 时重新注入默认 `Prose*` globals。
- `license.vue`、`privacy.vue`、`protocol.vue` 的 `ContentRenderer` 显式加 `:prose="false"`，确保 policy 页面不依赖被过滤的默认 MDC Prose wrapper。
- 扩展 docs page performance focused test，钉住 registry filter 与所有 `ContentRenderer` 页面 native prose 约束。
- 顶层 `mdc.components.prose=false` 实验无效：`@nuxt/content` module dependency 会覆盖 MDC prose 设置；有效边界是 `components:extend` 过滤 Nuxt component registry。

验证证据：

- Prepare：`pnpm -C "apps/nexus" run prepare` 通过；生成的 `apps/nexus/.nuxt/content/components.ts` 中 `export const globalComponents: string[] = []`。
- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 26 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/pages/license.vue" "app/pages/privacy.vue" "app/pages/protocol.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/pages/license.vue" "apps/nexus/app/pages/privacy.vue" "apps/nexus/app/pages/protocol.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 client/server/Nitro/PWA/content asset trim 均可完成。
- Playwright clean after：
  - 报告：`output/playwright/nexus-docs-b16-mdc-prose-filter-3206-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b16-mdc-prose-filter-3206-2026-06-21.json`
  - HAR/截图：同前缀 `tabs`、`fusion`、`card`、`license`、`privacy`、`switch-tabs-to-card` 的 `.har` / `.png`。
  - tabs：status 200, requests 424, scripts 405, stylesheets 17, `mdcProse 0`, failed 0, heading anchors 21。
  - fusion：status 200, requests 421, scripts 402, stylesheets 17, `mdcProse 0`, failed 0, heading anchors 25。
  - card：status 200, requests 428, scripts 408, stylesheets 18, `mdcProse 0`, failed 0, heading anchors 35, codeBlock 5。
  - license：status 200, requests 430, scripts 406, stylesheets 23, `mdcProse 0`, failed 0。
  - privacy：status 200, requests 427, scripts 402, stylesheets 24, `mdcProse 0`, failed 0。
- Playwright client-side route switch：
  - 报告：`output/playwright/nexus-docs-b16-mdc-prose-filter-3206-2026-06-21-client-switch.md`
  - JSON/HAR/截图：同名 `.json` / `.har` / `.png`。
  - tabs -> card：URL / network idle 60ms, requests 19, scripts 17, stylesheets 0, `mdcProse 0`, failed 0, heading `Card`, heading anchors 35。
- 第 15 批 after 对比：
  - tabs：443 requests / 423 scripts / `mdcProse 23` -> 424 / 405 / `mdcProse 0`。
  - fusion：442 / 423 / `mdcProse 23` -> 421 / 402 / `mdcProse 0`。
  - card：447 / 427 / `mdcProse 23` -> 428 / 408 / `mdcProse 0`。

## 第 15 批收口记录

目标：继续拆 `fusion` / `card` / `avatar-variants` / `tabs` 组件文档首屏中的 Nuxt Content / MDC 请求。第 15 批 baseline 证明 demo lazy boundary 已有效：`fusion` 首屏 demo registry 0、demo chunk 0、demo client renderer 0；真实瓶颈转向 `ContentRenderer` / MDC Prose wrapper dev 模块。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/docs/DocsProseHeading.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- docs 主正文 `ContentRenderer` 传入 `:prose="false"`，避免默认把全部 Markdown HTML tag 映射到 MDC Prose wrapper。
- 新增轻量 `DocsProseHeading.vue`，只负责 `h1-h6` 原生标签和 `#id` anchor link，避免丢失目录/heading anchor 行为。
- 在 docs 页面用 `docsProseComponents` 显式映射 `h1-h6` 到轻量 heading wrapper；段落、表格、列表等走原生 HTML tag，由现有 `docs-prose` / `markdown-body` CSS 承接。
- 不改变 SSR 正文渲染，不重新引入 `shouldClientRenderDocBody`，保持 SEO/首屏可见正文。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 25 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/components/docs/DocsProseHeading.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/pages/docs/[...slug].vue" "apps/nexus/app/components/docs/DocsProseHeading.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 client/server/Nitro 与 content asset trim 均可完成。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-b15-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b15-baseline-3200-2026-06-21.json`
  - fusion：requests 453, scripts 433, stylesheets 17, failed 0, demo registry 0, demo chunks 0, contentRenderer 44, codeBlock 0, run buttons 10。
  - card：requests 462, scripts 441, stylesheets 18, failed 0, demo registry 0, demo chunks 0, contentRenderer 48, codeBlock 4, run buttons 12。
  - avatar-variants：requests 459, scripts 438, stylesheets 18, failed 0, contentRenderer 38。
  - tabs：requests 456, scripts 435, stylesheets 18, failed 0, contentRenderer 46。
- Playwright clean after：
  - 报告：`output/playwright/nexus-docs-b15-prose-native-clean-3205-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-b15-prose-native-clean-3205-2026-06-21.json`
  - fusion：requests 453 -> 442，scripts 433 -> 423，stylesheets 17 -> 17，failed 0，heading anchors 25，tables 2，demo registry 0，demo chunks 0，codeBlock 0。
  - card：requests 462 -> 447，scripts 441 -> 427，stylesheets 18 -> 18，failed 0，heading anchors 35，tables 3，真实 codeBlock 4 保持。
  - tabs：requests 456 -> 443，scripts 435 -> 423，failed 0，heading anchors 21，tables 5。
  - avatar-variants：requests 459 -> 454，scripts 438 -> 434，failed 0，heading anchors 3。
  - 说明：after 仍有 `mdcProse: 23`，来源是 Nuxt Content 生成的 `globalComponents` / Prose registry；本批只替换 docs 主正文运行时映射，不冒险改 Nuxt Content registry。后续单独评估 `#content/components` global Prose 排除策略。

## 第 14 批收口记录

目标：修复 `tabs`、`fusion`、`avatar-variants` 这类无真实 Markdown code block 的组件文档页仍会在首屏加载 `TuffCodeBlock` renderer / scoped CSS 的问题。第 13 批后 AI notice 已静态化，但 paused demo 的 code panel 路径仍让无代码页面多拉一次 code block shell / renderer 相关资源。

改动范围：

- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/nexus/app/components/content/TuffCodeBlock.vue`
- `apps/nexus/app/components/content/TuffCodeBlockRenderer.vue`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- `TuffDemoWrapper.vue` 不再依赖 Nuxt auto component 的 `LazyTuffCodeBlock`，改为本地 `defineAsyncComponent(() => import('./TuffCodeBlock.vue'))`，并且只有 `hasCode && showCode` 时才加载嵌入 code block。
- `TuffCodeBlock.vue` 变成无样式 async shell，只保留 props 合同与 `LazyTuffCodeBlockRenderer`。
- 新增 `TuffCodeBlockRenderer.vue` 承载旧 code block UI、copy、highlight、mermaid 渲染与全部 scoped CSS。
- `nuxt.config.ts` 将 `TuffCodeBlockRenderer.vue` 从组件 auto-registration 中排除，避免 Nuxt 自动注册重新把 renderer 推回首屏组件图。
- 保持真实 code block 页行为不变：`card` 页面仍能渲染 3 个 code blocks 和 3 个 copy buttons。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/components/content/demo-client-boundary.test.ts" "app/pages/docs/docs-page-performance.test.ts"`，2 files / 40 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/components/content/TuffDemoWrapper.vue" "app/components/content/TuffCodeBlock.vue" "app/components/content/TuffCodeBlockRenderer.vue" "app/components/content/demo-client-boundary.test.ts" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/components/content/TuffDemoWrapper.vue" "apps/nexus/app/components/content/TuffCodeBlock.vue" "apps/nexus/app/components/content/TuffCodeBlockRenderer.vue" "apps/nexus/nuxt.config.ts" "apps/nexus/app/components/content/demo-client-boundary.test.ts" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 renderer lazy split 不影响 Nuxt client/server/Nitro 打包。
- Playwright clean first visit：
  - 报告：`output/playwright/nexus-docs-codeblock-lazy-clean-3204-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-codeblock-lazy-clean-3204-2026-06-21.json`
  - tabs：requests 455, scripts 435, stylesheets 17, failed 0, codeBlock requests 0, rendered code blocks 0。
  - avatar-variants：requests 459, scripts 439, stylesheets 17, failed 0, codeBlock requests 0, rendered code blocks 0。
  - fusion：requests 453, scripts 433, stylesheets 17, failed 0, codeBlock requests 0, rendered code blocks 0。
  - 对比第 13 批 after：tabs/avatar-variants/fusion 的无代码页面 codeBlock requests `1 -> 0`，stylesheets `18 -> 17`。
- Playwright real code block guard：
  - 报告：`output/playwright/nexus-docs-codeblock-lazy-card-3204-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-codeblock-lazy-card-3204-2026-06-21.json`
  - card：status 200, rendered code blocks 3, copy buttons 3, demo wrappers 12, run buttons 12, failed 0。
  - card 的 code block shell / renderer requests 4 属预期，因为该页有真实 `TuffCodeBlock` 节点。
  - 辅助排查报告：`output/playwright/nexus-docs-codeblock-lazy-3203-2026-06-21.md` / `.json`，用于确认访问过 real code page 后 dev CSS 会有序列副作用；最终结论以 3204 clean first visit 为准。

## 第 13 批收口记录

目标：修复 migrated / 未 verified 组件文档的 AI notice 触发 `DocsAsideCards` / `DocsAsideCardsShell` 首屏 eager mount。第 12 批后 tabs 这种 verified 文档已经不会首屏加载 aside shell，但 `fusion`、`card`、`avatar-variants` 等 pending 文档因为 AI notice 仍通过 `DocsAsideCards.vue` 渲染，导致 notice 本身把重型侧栏路径重新拉回首屏。

改动范围：

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/components/docs/DocsAsideCards.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`

实现口径：

- 删除 `watch(shouldShowDocsAsideAiNotice)` 中的 eager mount 行为，不再因为 notice 立即调用 `mountDocsAsideShell()` 或设置 `shouldMountDocsAsideCards`。
- 将 AI notice 移到 `docs.vue` layout 内作为静态 `<section class="docs-aside-ai-notice">` 渲染，只依赖现有 `shouldShowDocsAsideAiNotice` computed 和 message catalog。
- `DocsAsideCards.vue` 只保留 Assistant dialog 懒打开职责，移除 `syncStatus` normalize、notice chrome、runtimeConfig / locale 分支和 notice CSS。
- 新增 `docs.aiNotice.title` / `docs.aiNotice.description` en/zh message，避免生产 UI 文案硬编码。
- 不改变 Assistant 显式点击路径：占位按钮或 shell 触发后仍会按第 12 批逻辑懒挂载 dialog。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 25 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/layouts/docs.vue" "app/components/docs/DocsAsideCards.vue" "app/pages/docs/docs-page-performance.test.ts" "i18n/locales/en.ts" "i18n/locales/zh.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/layouts/docs.vue" "apps/nexus/app/components/docs/DocsAsideCards.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "apps/nexus/i18n/locales/en.ts" "apps/nexus/i18n/locales/zh.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 AI notice 静态化不影响 TuffEx build、Nuxt client/server、Nitro 与 content asset trim。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-pending-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-pending-baseline-3200-2026-06-21.json`
  - 页面：`fusion`、`card`、`avatar-variants`、`tabs`。
  - card：requests 464, scripts 444, `DocsAside` class count 4。
  - avatar-variants：requests 459, scripts 439, `DocsAside` class count 4。
  - tabs：`DocsAside` class count 0。
  - 结论：pending migrated 文档会因 AI notice 首屏加载 aside cards / shell，verified tabs 不触发。
- Playwright after：
  - 报告：`output/playwright/nexus-docs-ai-notice-static-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-ai-notice-static-3200-2026-06-21.json`
  - card：requests 464 -> 460，scripts 444 -> 440，`DocsAside` class count 4 -> 0，failed 0。
  - avatar-variants：requests 459 -> 455，scripts 439 -> 435，`DocsAside` class count 4 -> 0，failed 0。
  - tabs：`DocsAside` class count 0 -> 0，failed 0。
  - fusion：network idle 前静态 AI notice 可见、真实 shell 未挂载；报告中的延迟后 `DocsAside` count 2 是脚本等待 4.5s 验证第 12 批 idle mount 仍生效。
  - Fusion 占位入口点击：click to dialog 172ms，failed 0。

## 第 12 批收口记录

目标：将右侧 `DocsAsideCardsShell.vue` 从 docs 首屏同步路径移出。第 11 批后 HAR 仍显示 tabs/card/fusion 首屏会加载 `DocsAsideCardsShell.vue` 与 scoped CSS，约 2 个请求、约 29KB dev 资源；它主要服务右侧 Assistant / Help 区域，不应抢占正文首屏脚本窗口。

改动范围：

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`

实现口径：

- 移除 `DocsAsideCardsShell` 同步 import，改为 `defineAsyncComponent` 的 `LazyDocsAsideCardsShell`。
- 首屏先显示轻量 `.docs-aside-assistant-shell` 占位按钮，保留 `Tuff Assistant` 主入口，不挂载真实 shell / help links。
- hydration 后延迟 `2400ms`，再通过 `requestIdleCallback` 挂载真实 shell，idle timeout 为 `3600ms`。
- 点击占位按钮时立即挂载 `DocsAsideCards` / `DocsAsideCardsShell` 并打开 Assistant dialog，不牺牲显式用户意图。
- AI review notice 需要显示时仍立即挂载真实 shell 和 aside cards，保证 migrated / 未 verified 文档的提醒不被延迟隐藏。
- 补齐 `docs.assistant.open` en/zh message catalog，避免新增生产 UI 文案走 fallback。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 25 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/layouts/docs.vue" "app/pages/docs/docs-page-performance.test.ts" "i18n/locales/en.ts" "i18n/locales/zh.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/layouts/docs.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts" "apps/nexus/i18n/locales/en.ts" "apps/nexus/i18n/locales/zh.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 `LazyDocsAsideCardsShell` 不影响 TuffEx build、Nuxt client/server、Nitro 与 content asset trim。
- curl smoke：`/en/docs/dev/components/tabs` status 200。
- Playwright after：
  - 报告：`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200.md`
  - JSON：`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200.json`
  - tabs：status 200, DCL 127ms, network idle 1251ms, requests 459, scripts 439, stylesheets 18, failed 0；network idle 时占位按钮可见、真实 shell 未挂载。
  - card：status 200, DCL 116ms, network idle 1247ms, requests 466, scripts 446, stylesheets 18, failed 0。
  - fusion：status 200, DCL 97ms, network idle 1251ms, requests 459, scripts 439, stylesheets 18, failed 0。
  - 延迟挂载截图：`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200-after-delay-tabs.png`；tabs 延迟后占位按钮隐藏、真实 `DocsAsideCardsShell` 可见。
  - 占位按钮点击：click to dialog 210ms；点击前占位按钮可见且真实 shell/dialog 未挂载，点击后真实 shell、`.assistant-dialog`、`.FlipDialog-Card` 均可见；failed 0。
  - 占位按钮截图：`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200-placeholder-before-click.png`、`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200-placeholder-after-click.png`。
  - 占位按钮 HAR：`output/playwright/nexus-docs-2026-06-21-aside-shell-lazy-3200-placeholder-click.har`。
  - card -> tabs：URL settled 72ms, network idle 883ms, requests 12, failed 0，切换窗口内 `DocsAsideCardsShell` requests 0；docs `body=0` at +40ms、`body=1` at +400ms。

## 第 11 批收口记录

目标：将右侧 `DocsOutline.vue` 从 docs 首屏网络窗口移出。第 11 批 baseline 显示 `DocsOutline.vue` 约 103KB、对应 scoped CSS 约 49KB，在 `/tabs`、`/card`、`/fusion` 三个组件文档页首屏都会加载，但它只服务右侧目录交互，不应和正文首屏争抢 dev scripts。

改动范围：

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- `DocsOutline` 改为 `defineAsyncComponent` 的 `LazyDocsOutline`。
- 右侧目录区域先显示轻量 `docs-outline-shell` skeleton，不同步加载真实 outline 逻辑和样式。
- 页面 TOC / loading 状态出现后，延迟 `2000ms` 再走 `requestIdleCallback`，`3200ms` timeout 后挂载真实 outline。
- 移动端点击目录按钮时立即调用 `mountDocsOutline()`，保证显式用户意图不被延迟。
- 不改变 `DocsOutline.vue` 内部滚动、hash 同步、ResizeObserver 和 active heading 逻辑。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 25 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/layouts/docs.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/layouts/docs.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：`NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 `LazyDocsOutline` 不影响生产 client/server/Nitro 打包。
- curl smoke：`/en/docs/dev/components/tabs` status 200。
- Playwright baseline：
  - 报告：`output/playwright/nexus-docs-2026-06-21-next-baseline-3200.md`
  - JSON：`output/playwright/nexus-docs-2026-06-21-next-baseline-3200.json`
  - tabs：status 200, DCL 878ms, network idle 4417ms, requests 459, scripts 440, stylesheets 17, failed 0。
  - card：status 200, DCL 166ms, network idle 1430ms, requests 467, scripts 447, stylesheets 18, failed 0。
  - fusion：status 200, DCL 111ms, network idle 1343ms, requests 459, scripts 439, stylesheets 18, failed 0。
  - card -> tabs：URL settled 71ms, network idle 71ms, requests 9, failed 0。
- Playwright after：
  - 报告：`output/playwright/nexus-docs-2026-06-21-outline-lazy-3200.md`
  - JSON：`output/playwright/nexus-docs-2026-06-21-outline-lazy-3200.json`
  - tabs：status 200, DCL 291ms, network idle 1593ms, requests 457, scripts 437, stylesheets 18, failed 0，`DocsOutline` 首屏 class count 0。
  - card：status 200, DCL 139ms, network idle 1361ms, requests 464, scripts 444, stylesheets 18, failed 0，`DocsOutline` 首屏 class count 0。
  - fusion：status 200, DCL 108ms, network idle 1347ms, requests 457, scripts 437, stylesheets 18, failed 0，`DocsOutline` 首屏 class count 0。
  - card -> tabs：URL settled 78ms, network idle 78ms, requests 9, failed 0。
  - 延迟挂载截图：`output/playwright/nexus-docs-2026-06-21-outline-lazy-after-delay-tabs.png`；network idle 时 skeleton 可见、真实 outline 未挂载，5.5s 后 skeleton 隐藏且真实 outline 可见。

## 第 6 批收口记录

目标：降低 dev 模式下 docs 页面首屏 HTML 注入无关页面 stylesheet 的负担，先修复 `/en/docs/dev/components/tabs` 这类文档页明显加载慢、页面切换慢的问题。

改动范围：

- `apps/nexus/server/utils/devStylesheetDedupe.ts`
- `apps/nexus/server/plugins/dev-tuffex-stylesheet-dedupe.ts`
- `apps/nexus/server/utils/devStylesheetDedupe.test.ts`

实现口径：

- 仅在非 production 环境运行，不影响生产构建输出。
- 按当前 route family 过滤明显不属于当前页面的 dev stylesheet。
- docs route 过滤 landing / store / dashboard / marketing 类 stylesheet。
- store route 保留 store / TouchRay 相关 stylesheet，过滤 landing / dashboard。
- landing route 保留 landing 相关 stylesheet，过滤 store / dashboard。
- dashboard route 过滤 store / landing。
- 保留原有 TuffEx stylesheet dedupe 行为。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "server/utils/devStylesheetDedupe.test.ts" "app/pages/docs/docs-page-performance.test.ts" "app/components/content/demo-client-boundary.test.ts"`，3 files / 44 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "server/utils/devStylesheetDedupe.ts" "server/plugins/dev-tuffex-stylesheet-dedupe.ts" "server/utils/devStylesheetDedupe.test.ts"` 通过。
- Whitespace：`git diff --check` 通过。
- curl smoke：
  - `/en/docs/dev/components/tabs` stylesheet 从约 88 条降到 44 条。
  - `/en/docs/dev/components/tabs`：`{ total: 44, tuff: 0, dashboard: 0, store: 0, docs: 6, tuffex: 21, other: 17 }`
  - `/store`：`{ total: 50, tuff: 2, dashboard: 0, store: 3, docs: 6, tuffex: 21, other: 18 }`
  - `/`：`{ total: 82, tuff: 37, dashboard: 0, store: 0, docs: 6, tuffex: 21, other: 18 }`
- Playwright：
  - 报告：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20.md`
  - JSON：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20.json`
  - 截图：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20-tabs.png`
  - 截图：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20-card.png`
  - HAR：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20-tabs.har`
  - HAR：`output/playwright/nexus-docs-route-stylesheet-filter-3214-2026-06-20-card.har`
  - tabs：status 200, elapsed 2916ms, requests 470, failed 0。
  - card：status 200, elapsed 2631ms, requests 477, failed 0。
  - tabs stylesheet HAR：`{ total: 63, tuff: 0, dashboard: 0, store: 0, docs: 13, tuffex: 22, other: 28 }`
  - card stylesheet HAR：`{ total: 65, tuff: 0, dashboard: 0, store: 0, docs: 14, tuffex: 22, other: 29 }`

## 第 7 批收口记录

目标：继续压缩 `/en/docs/dev/components/tabs` 等组件文档页切换的关键路径，避免 `body=1` full-body Markdown 解析和 sidebar/pager full-body 预取在 route switch 初期抢占网络与 dev content parse。

改动范围：

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 组件文档 client 切页仍先请求 `body=0` 轻 metadata，让标题、hero、模板壳优先稳定。
- 当前页 `body=1` full body 改为 metadata settled 后短延迟 + `requestIdleCallback` 调度；如果浏览器不支持 idle callback，则走短延迟 fallback。
- pager 预取仍立即 warm route component 和 `body=0` metadata，但 `body=1` full body 预热延后到 idle。
- sidebar 组件链接预取同样改为 `body=0` 立即、`body=1` 延后；component sidebar metadata 的 pointer/focus intent 也改为短延迟调度，避免点击导航时产生被 abort 的 fetch。
- 保持 docs API 合同不变，不改变 `body=0` / `body=1` 的响应格式。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts" "app/components/content/demo-client-boundary.test.ts" "app/components/content/demo-lazy.test.ts"`，3 files / 42 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/pages/docs/[...slug].vue" "app/components/DocsSidebar.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- curl smoke：`/en/docs/dev/components/tabs` status 200，stylesheet summary `{ total: 57, tuff: 0, dashboard: 0, store: 0, docs: 4 }`。
- Playwright：
  - 报告：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-tabs.png`
  - 截图：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-card.png`
  - 截图：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-switch-card-to-tabs.png`
  - HAR：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-tabs.har`
  - HAR：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-card.har`
  - HAR：`output/playwright/nexus-docs-idle-full-body-delay-3200-2026-06-21-switch-card-to-tabs.har`
  - tabs first load：status 200, DOMContentLoaded 685ms, network idle 1618ms, requests 526, failed 0。
  - card first load：status 200, DOMContentLoaded 136ms, network idle 1078ms, requests 533, failed 0。
  - card -> tabs client switch：URL settled 79ms, network idle 731ms, requests 19, failed 0。
  - card -> tabs docs requests：tabs `body=0` at +22ms, tabs `body=1` at +417ms, neighboring tab-bar `body=1` prefetch at +1203ms。

## 第 8 批收口记录

目标：修复组件文档页内侧栏组件列表加载过晚的问题。第 7 批后 full-body 正文已延后，但组件侧栏 metadata 仍固定 8s 后才请求，导致从 `card` 页直接切到 `tabs` 时，目标链接本身晚出现，交互感知仍慢。

改动范围：

- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 不新增审计脚手架或无意义测试设施。
- `/api/docs/sidebar-components?locale=en` 实测约 25KB，冷请求约 30-60ms、热请求约 3ms；相比让组件导航缺失 8 秒，水合后短延迟加载更符合页面切换体验目标。
- 将组件侧栏 metadata 自动调度从 8000ms 改为 360ms，保留 `immediate: false`、locale-only API、intent 触发和 idle 调度。
- 不改变 `body=1` full-body Markdown 预取策略，组件正文仍由 `body=0` metadata 先行、full body 后置。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts" "app/components/content/demo-client-boundary.test.ts" "app/components/content/demo-lazy.test.ts"`，3 files / 42 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "app/components/DocsSidebar.vue" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/app/components/DocsSidebar.vue" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- curl smoke：
  - `/en/docs/dev/components/tabs` status 200。
  - `/api/docs/page?path=/docs/dev/components/tabs&locale=en&body=0` status 200，约 455 bytes。
  - `/api/docs/page?path=/docs/dev/components/tabs&locale=en&body=1` status 200，约 48.5KB。
  - `/api/docs/sidebar-components?locale=en` status 200，约 25.8KB，108 rows，含 `/docs/dev/components/tabs`。
- Playwright：
  - 报告：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-tabs.png`
  - 截图：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-card.png`
  - 截图：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-switch-card-to-tabs.png`
  - HAR：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-tabs.har`
  - HAR：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-card.har`
  - HAR：`output/playwright/nexus-docs-sidebar-metadata-delay-3200-2026-06-21-switch-card-to-tabs.har`
  - tabs first load：status 200, DOMContentLoaded 229ms, network idle 1511ms, requests 533, failed 0。
  - card first load：status 200, DOMContentLoaded 124ms, network idle 1227ms, `tabs` sidebar link visible 1241ms, requests 540, failed 0。
  - card -> tabs client switch：URL settled 63ms, network idle 63ms, requests 11, failed 0。
  - card -> tabs docs requests：tabs `body=0` at +21ms；未在切换关键窗口内请求 tabs `body=1`。

## 第 9 批收口记录

目标：继续收敛 `/en/docs/dev/components/tabs` dev HTML 首屏 CSS 请求。第 8 批 Playwright / HAR 显示 docs route 仍注入 `pages/new/*`、`components/assets/create/*`、`VersionDrawer` 等无关 route-local stylesheet，虽然不影响生产，但会拖慢本地页面加载和调试反馈。

改动范围：

- `apps/nexus/server/utils/devStylesheetDedupe.ts`
- `apps/nexus/server/utils/devStylesheetDedupe.test.ts`

实现口径：

- 不新增测试脚手架；只扩展既有 dev-only stylesheet filter 的 docs route marker。
- docs route 继续保留 docs/layout/header/TuffEx 相关样式，过滤 landing `/new`、asset create overlay、VersionDrawer 和 footer 这类非当前页面首屏样式。
- 仅在非 production 的 `render:response` HTML filter 生效，不改变生产构建 chunk。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "server/utils/devStylesheetDedupe.test.ts" "app/pages/docs/docs-page-performance.test.ts"`，2 files / 29 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "server/utils/devStylesheetDedupe.ts" "server/utils/devStylesheetDedupe.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/server/utils/devStylesheetDedupe.ts" "apps/nexus/server/utils/devStylesheetDedupe.test.ts"` 通过。
- curl smoke：`/en/docs/dev/components/tabs` stylesheet summary `{ total: 62, newPage: 0, assetCreate: 0, versionDrawer: 0, tuffFooter: 0, dashboard: 0, store: 0, tuff: 0, docs: 8, tuffex: 39 }`。
- Playwright：
  - 报告：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21.json`
  - 截图：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-tabs.png`
  - 截图：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-card.png`
  - 截图：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-switch-card-to-tabs.png`
  - HAR：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-tabs.har`
  - HAR：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-card.har`
  - HAR：`output/playwright/nexus-docs-route-style-filter-followup-3200-2026-06-21-switch-card-to-tabs.har`
  - tabs first load：status 200, DOMContentLoaded 207ms, network idle 1581ms, requests 521, failed 0, stylesheets 62。
  - card first load：status 200, DOMContentLoaded 141ms, network idle 1385ms, requests 528, failed 0, stylesheets 62。
  - card -> tabs client switch：URL settled 62ms, network idle 62ms, requests 11, failed 0。
  - card -> tabs docs requests：tabs `body=0` at +20ms；未在切换关键窗口内请求 tabs `body=1`。

## 第 10 批收口记录

目标：削减 `/en/docs/dev/components/tabs` dev 首屏中由 Pinia / Vue Router 引入的 Vue Devtools bridge 模块请求。Nuxt devtools 已关闭，但 `@vue/devtools-api` 仍会通过公开包入口拉起 `@vue/devtools-kit` / shared 相关模块，拖慢本地文档调试反馈。

改动范围：

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/utils/vue-devtools-api-noop.ts`
- `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

实现口径：

- 仅在 dev 模式默认启用，不影响 production 构建。
- 通过公开包级 alias 将 `@vue/devtools-api` 指到 Nexus 本地 noop module，不 alias Vue Router 私有 chunk。
- 提供 `NUXT_DISABLE_VUE_DEVTOOLS_API_NOOP=true` 作为本地 A/B 或排障开关。
- noop module 只导出 Pinia / Vue Router 当前需要的 devtools API surface，不引入 `@vue/devtools-kit`。

验证证据：

- Vitest：`pnpm -C "apps/nexus" exec vitest run "app/pages/docs/docs-page-performance.test.ts"`，1 file / 25 tests passed。
- ESLint：`pnpm -C "apps/nexus" exec eslint --cache --max-warnings=0 --no-warn-ignored "nuxt.config.ts" "app/utils/vue-devtools-api-noop.ts" "app/pages/docs/docs-page-performance.test.ts"` 通过。
- Whitespace：`git diff --check -- "apps/nexus/nuxt.config.ts" "apps/nexus/app/utils/vue-devtools-api-noop.ts" "apps/nexus/app/pages/docs/docs-page-performance.test.ts"` 通过。
- Production build：
  - `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build` 通过，确认 dev-only alias 不影响生产 client/server/Nitro 打包。
  - `pnpm -C "apps/nexus" run build` 已通过 TuffEx build、Nuxt client build、Nuxt server build，但完整 prerender 阶段以既有 prerender errors 退出 1；不归因于本批 dev-only alias，后续单独查全量 prerender 失败清单。
- Playwright baseline（3200 原服务，用于确认原始瓶颈）：
  - 报告：`output/playwright/nexus-docs-devtools-baseline-3200-2026-06-21.md`
  - JSON：`output/playwright/nexus-docs-devtools-baseline-3200-2026-06-21.json`
  - tabs first load：status 200, requests 521, scripts 457, devtools 18, failed 0。
  - card first load：status 200, requests 528, scripts 464, devtools 18, failed 0。
  - card -> tabs：URL settled 76ms, requests 11, failed 0。
- Playwright A/B（3202 `dev:pure`，同端口顺序冷启动）：
  - disabled 报告：`output/playwright/nexus-docs-devtools-disabled-3202-2026-06-21.md`
  - enabled 报告：`output/playwright/nexus-docs-devtools-noop-3202-ab-2026-06-21.md`
  - disabled tabs：status 200, requests 477, scripts 458, devtools 18, failed 0。
  - enabled tabs：status 200, requests 459, scripts 440, devtools 3, failed 0。
  - disabled card：status 200, requests 485, scripts 465, devtools 18, failed 0。
  - enabled card：status 200, requests 467, scripts 447, devtools 3, failed 0。
  - enabled card -> tabs：URL settled 62ms, network idle 62ms, requests 10, failed 0。
  - 结论：tabs/card 首屏各减少 18 个请求；devtools bridge 从 18 个请求降到 3 个，切换时序未回退。

## 后续任务树

### 收尾边界

- [x] 当前第 25 批只做 TODO 文档收尾归档，不继续混入 docs demo、DocApiTable、section-level split、首页 warning 或更多 aireview 未审批组件逐页优化。
- [x] 当前第 27 批只做 TODO 文档最终交接，不继续混入代码、Playwright 新采样、docs demo、DocApiTable、section-level split、首页 warning 或更多 aireview 未审批组件逐页优化。
- [x] 当前第 29 批只做 TODO 文档收尾，不继续混入业务代码、Playwright 新采样、docs demo、DocApiTable、section-level split、首页 warning 或更多 aireview 未审批组件逐页优化。
- [x] 当前第 31 批只做 TODO 文档收尾，不继续混入业务代码、Playwright 新采样、docs demo、DocApiTable、section-level split、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 32 批只做 pending / aireview 工作表正式化，不继续混入业务代码、Playwright 新采样、docs demo、DocApiTable、section-level split、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 33 批只做 `fusion` / `card` pending 长文档后半段 deferred render，不继续混入 demo registry、DocApiTable、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 34 批只做 `avatar-variants` 单章节大 demo fallback split，不继续混入 demo registry 重构、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 35 批只做 TODO 文档收尾，不继续混入代码、Playwright 新采样、docs demo、DocApiTable、section split、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 36 批只做 strict pending deferred body，不继续混入 demo registry、DocApiTable、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 37 批只做 TODO 文档收尾，不继续混入业务代码、Playwright 新采样、docs demo、DocApiTable、section split、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 38 批只做 pending demo second-boundary split，不继续混入 DocApiTable 重构、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 39 批只做 strict pending verified Playwright 抽样与文档回填，不继续混入代码改动、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 40 批只做 TODO 文档收尾冻结，不继续混入代码改动、Playwright 新采样、docs demo、DocApiTable、首页 warning、dev SSR 深化或生产 chunk 复核。
- [x] 当前第 41 批只做 docs code header SSR graph 小切片与 dev SSR TTFB 二轮，不继续混入首页 warning、production chunk 复核或 pending 逐页 demo/API 二刀。
- [x] 当前第 42 批只做 docs toast intent 小切片与 dev SSR TTFB 第三刀，不继续混入首页 WebGL warning、production chunk 复核或 pending 逐页 demo/API 二刀。
- [x] 当前第 43 批只做 public docs auth/profile graph 小切片与 dev SSR TTFB 第四刀的一部分，不继续混入 `vue-sonner` CSS 首访、首页 WebGL warning、production chunk 复核或 pending 逐页 demo/API 二刀。
- [x] 当前第 44 批只做 legacy sonner boundary 小切片，不继续混入首页 WebGL warning、production chunk 复核、share/engagement/comment/right rail 或 pending 逐页 demo/API 二刀。
- [x] 当前第 45 批只做 docs aside shell / right rail 假设验证和 TODO 收尾；Playwright HAR 证明 right rail shell / Assistant / dompurify 不进入 tabs 首访图谱，不继续混入无收益代码改动。
- [x] 当前 goal 原句、用户追加要求、触发页、批次提交、验证证据、子任务百分比和后续执行队列已写入本文。
- [x] 后续 docs 文档内容、AI review / aireview 相关事项统一从本文任务树领取，按小批次执行、验证、提交和回填。
- [x] 第 36 批开始前已选定 `glass-surface` / `gradual-blur` docs pending 优化，并先跑 Playwright / HAR baseline 后再落代码。

### P0：docs 文档内容加载继续拆分

- [x] 盘点 docs route 首屏 payload：区分 SSR 必须数据、首屏可见内容、折叠区内容、demo registry、code block/highlight、metadata。
- [x] 将组件 docs 文档正文加载拆成 `body=0` metadata 与 idle `body=1` full body，避免页面切换初期重复拉大 payload。
- [x] 将 dev SSR 下组件文档首访改为 metadata-first：第 21 批后 `fusion` / `card` / `avatar-variants` / `tabs` 首访 HTML 不再同步塞入 37-80KB 正文，production SSR 仍保留 full body。
- [x] 将 sidebar component docs 链接的 full-body 预取改为持续意图 + 可取消：第 22 批后 hover/focus 先预热 route + `body=0` metadata，`body=1` 可在 blur / mouseleave 取消。
- [x] 将 docs page 底部 Prev / Next pager 的 full-body 预取改为持续意图 + 可取消：第 26 批后短 hover / mouseleave 只保留目标页 `body=0` metadata，`body=1` 不再进入短 hover 窗口。
- [x] 将 component docs navigation SSR async-data 缩到组件分支：第 24 批后 `/api/docs/navigation?locale=en&scope=components` 16786 bytes，tabs HTML 107061 -> 86611 bytes，不再把 guide / api / architecture 分支塞进 tabs 首访 HTML。
- [x] 将组件侧栏 metadata 从固定 8s 后置改为水合后短延迟加载，避免同组组件导航链接晚出现。
- [x] 将 component docs dev `body=0` metadata 请求切到 frontmatter fast path：第 28 批后组件 metadata 请求不再先进入 Nuxt Content query / MDC parse，非组件 docs 保持 Nuxt Content 路径。
- [ ] 固化 docs template：同类文档页共享稳定布局壳，正文与 demo 独立懒加载。
- [ ] 将 demo registry 从 docs 首屏路径移出，组件 demo 只在可见区域或交互展开时加载。
- [x] 拆 pending 文档的大正文第一刀：第 33 批已让 `fusion` / `card` 首屏只渲染前两段，长 usage / API sections 延迟到用户意图或静置后。
- [x] 拆 pending 单章节大 demo 第一刀：第 34 批已让 `avatar-variants` 首屏只保留标题、说明和 `Gallery` 章节标题，demo 标题与 demo 节点延迟到用户意图或静置后。
- [x] 继续拆 pending 文档的大正文：第 36 批确认 `gradual-blur` 已被 fallback split 覆盖，并将 `glass-surface` 这类 `migrated + verified` strict pending 页面纳入 deferred body；首屏保留 headline / summary / basic demo，API/Props 和后续 demo 后置到 idle 或用户意图。
- [x] 收紧 pending 首段多 demo split：第 38 批确认 `fusion` / `card` API/Props 表和 demo registry 不在首屏 eager 路径，并将 `card` initial demo shells 从 2 降到 1。
- [ ] 审计 docs content API payload：确认 `body=0` 返回字段最小化，长正文 full body 只在正文确实需要时请求，并为 route switch 复用轻 metadata。
- [ ] 复核 docs components index / component detail 共用模板：把 breadcrumb、metadata、right rail、footer sentinel 保持静态壳，正文和 demo 走独立 lazy boundary。
- [ ] 对 `DocApiTable` 做按需加载实验：只在存在 API table 的文档和对应可见区加载，避免无 API 表文档首屏重复拉相关 chunk。
- [x] 检查并修复无代码文档页的 code block renderer eager import：`tabs` / `fusion` / `avatar-variants` clean first visit 均为 codeBlock requests 0。
- [x] 检查并部分修复 Markdown renderer / MDC Prose wrapper 首屏请求：docs 主正文改用 native prose tags + lightweight heading anchors，`fusion` requests 453 -> 442。
- [x] 检查并修复 Nuxt Content global Prose registry eager import：第 16 批后 `tabs` / `fusion` / `card` / policy 页面 clean first visit 均为 `mdcProse 0`。
- [x] 继续检查 `DocApiTable`、demo wrapper 是否在 pending 文档首屏重复 eager import：第 38 批 Playwright-core 证明 `fusion` / `card` initial props nodes 0，demo registry/chunks 0；只需后续 production chunk 复核。
- [x] 检查并修复普通 dev PWA client plugin eager import：第 17 批后 `tabs` / `fusion` / `card` / `avatar-variants` / `switch-tabs-to-card` 均为 `pwaClient 0`，console warning/error 0。
- [x] 将 docs Assistant context 构建后置到用户意图：第 30 批后普通 tabs/fusion 首访 `assistantRequests 0` / `dompurifyRequests 0`，点击 Assistant 才加载 dialog 并构建 context。
- [x] 将 docs code block copy header 从 Vue runtime render graph 拆出：第 41 批后 `renderCodeHeader()` 使用客户端原生 DOM，fresh-server tabs cold TTFB 4128ms -> 3083ms，真实 code 页面 `context-menu` 7 个 copy header 正常生成。
- [x] 将 docs toast feedback 从 setup 顶层拆到 copy/share 用户意图后：第 42 批后 tabs 首访 `toastRequests 0`，`context-menu` code copy 点击后 `toastRequestsAfterClick 1` 且 toast visible true。
- [x] 将 public docs auth/profile graph 从首访路径拆出：第 43 批后 docs 页只读 shared `auth-user`，app root / locale orchestrator 对 current-user API 使用动态 import；tabs Playwright after `authGraphRequestCount 0`。
- [x] 将 legacy sonner CSS 从 docs 首访路径拆出：第 44 批后 sign-in / admin bootstrap 使用自研 `useToast`，tabs Playwright after `sonnerRequestCount 0`。
- [x] 复核 right rail / Assistant 非首屏 graph：第 45 批 tabs 3.5s HAR 中 `DocsAsideCardsShell`、`DocsAsideCards`、Assistant、`TxMarkdownView`、`dompurify` 均为 0。
- [x] 对 tabs/card 等组件页建立最小 Playwright 性能基线：首屏截图、HAR、request count、failed count、DOMContentLoaded/load、client-side route switch timing。
- [x] 为 docs 内容加载新增 focused tests，钉住不会回退到全量 MDC parse、同步 full-body prefetch 或全局 demo registry eager load。

### P0：aireview 未审批组件优化

- [x] 建立当前可执行口径：仓库内暂无稳定字面量 `aireview` 标记，先按组件文档 frontmatter 的 `syncStatus != reviewed` 或 `verified != true` 视为 AI review / aireview 未审批或未完全审批。
- [x] 初步审计 `apps/nexus/content/docs/dev/components/*.mdc`：本地化文件口径共 216 个组件文档，`reviewed` 64 个，`migrated` 152 个，`verified: true` 92 个，未 verified 124 个；组件条目口径共 108 个组件，按 `syncStatus != reviewed || verified != true` 得到 76 个 pending 组件条目，后续工作表和领取顺序以组件条目口径为准。
- [x] 建立 pending baseline：`fusion` / `card` / `avatar-variants` / `tabs` 已输出 Playwright baseline；确认第 13 批前 `card`、`avatar-variants` 会因 AI notice eager mount aside cards / shell。
- [x] 修复 pending AI notice eager mount：notice 已静态化，`card` / `avatar-variants` 首屏 `DocsAside` class count 从 4 降到 0。
- [x] 修复 pending / 无代码文档 code block renderer eager load：`fusion` / `avatar-variants` 首屏 codeBlock requests 从 1 降到 0，stylesheets 从 18 降到 17。
- [x] 修复 pending 长正文的部分 MDC Prose wrapper 请求：`fusion` scripts 433 -> 423，`card` scripts 441 -> 427，同时 heading anchors / tables 保持。
- [x] 修复 docs Assistant context 在 pending 长文档首访后自动抽取整篇正文：第 30 批改为 Assistant 打开意图后再构建 context，避免普通阅读路径后台扫描大 body。
- [x] 不新增宽泛审计脚手架；每批只为待修页面输出一次性 Playwright / HAR evidence 或 focused regression，记录 pending 组件、正文体量、demo 数、重型 client demo 引用数。第 28 批用一次性 Node 只读统计和 Playwright/HAR 证据完成，不新增仓库脚手架。
- [ ] 对未审批组件逐个分组：可静态化、可懒加载、应移出 docs 首屏、应合并模板、应删除或后置。
- [x] 输出 pending 组件工作表：每个组件记录 `syncStatus`、`verified`、正文大小、demo 数、code block 数、是否有 API table、首屏请求数、下一步动作。第 32 批已落到 `docs/engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`。
- [x] 将 pending 组件按收益排序，而不是按字母顺序处理；优先高正文体量、高 demo 数、高首屏请求的页面。第 28 批确认当前高收益 Top 6 为 `fusion`、`card`、`avatar-variants`、`glass-surface`、`gradual-blur`、`auto-sizer`。
- [ ] 优先处理高风险 pending 页面：
  - `fusion.en.mdc` / `fusion.zh.mdc`：约 52KB / 52KB，10 个 demo；第 33 批已完成通用 docs page 后半段 deferred render，第 38 批确认首屏只剩 1 个 demo shell，API/Props 表与 demo registry 不 eager。
  - `card.en.mdc` / `card.zh.mdc`：约 49KB / 48KB，12 个 demo；第 33 批已完成通用 docs page 后半段 deferred render，第 38 批将首屏 demo shells 2 -> 1，API table / demo registry 不 eager。
  - `avatar-variants.en.mdc` / `avatar-variants.zh.mdc`：约 36KB / 36KB，正文体量高；第 34 批已完成单章节大 demo fallback split，demo visible-only 仍可后续单切。
  - `glass-surface.en.mdc` / `glass-surface.zh.mdc`：约 17KB / 15KB，2 个 demo；第 36 批已覆盖 strict pending deferred body，production chunk/API visible-only 仍可后续单切。
  - `base-anchor.en.mdc` / `base-anchor.zh.mdc`：约 10KB / 10KB，6 个 demo；第 39 批确认 initial shell true、initial demos 1、props nodes 0、after deferred true。
  - `select.en.mdc` / `select.zh.mdc`：约 9KB / 9KB，6 个 demo；第 39 批确认 initial shell true、initial demos 1、props nodes 0、after deferred true。
  - `radio.en.mdc` / `radio.zh.mdc`：约 9KB / 8KB，6 个 demo；第 39 批确认 initial shell true、initial demos 1、props nodes 0、after deferred true。
  - `gradual-blur.en.mdc` / `gradual-blur.zh.mdc`：约 16KB / 15KB，7 个 demo；第 36 批确认当前 fallback split 已覆盖 API 和后续 demo。
  - `auto-sizer.en.mdc` / `auto-sizer.zh.mdc`：约 14KB / 13KB，7 个 demo。
  - `scroll.en.mdc` / `scroll.zh.mdc`：约 12KB / 11KB，6 个 demo。
- [x] 对首批 aireview / pending 文档页做 Playwright 截图和 HAR 基线：第 21 批覆盖 `fusion` / `card` / `avatar-variants` / `tabs`，记录首屏请求量、body payload、HTML 体量、慢资源、截图和 HAR。
- [x] 对剩余高风险 aireview / pending 文档页继续做 Playwright 截图和 HAR 基线：第 22 批覆盖 `gradual-blur` / `auto-sizer` / `scroll`，记录首屏请求、failed、body=1、demo registry/client renderer 和截图/HAR。
- [ ] 优化 aireview / pending 组件的 client-only 边界，避免 SSR 阶段加载浏览器态或重型交互依赖。
- [ ] 将 aireview demo / preview / report 类重型组件改为显式 lazy boundary，并复用现有 `TuffDemoWrapper` / `TuffDemoClientRenderer.client.vue` 懒激活机制。
- [ ] 为 aireview 未审批组件新增加载回归测试，确保文档页切换不 eager import 全部重型组件。
- [ ] 逐页确认 pending AI notice 只渲染静态 notice，不再为了说明文字挂载 assistant shell、dialog、comments、feedback 或 analytics widget。
- [ ] 对重型 demo 组件做 visible-only guard：首屏上方只保留静态 preview / run button，真实 demo client chunk 在可见区或点击后加载。
- [x] 对长文档 usage / examples / FAQ 区做 section-level split 第一刀：第 33 批覆盖 `fusion` / `card`，避免 route switch 后立即解析所有后半页内容。
- [x] 已完成候选 A 第一刀：`avatar-variants` 长正文静态模板化。第 34 批确认 initial demo title true -> false，demo-like nodes 22 -> 0，滚动后恢复 22。
- [x] 已完成候选 B 第一刀：`glass-surface` / `gradual-blur` strict pending deferred body。第 36 批确认 `glass-surface` initial shell false -> true，`gradual-blur` 已被既有 fallback 覆盖；demo visible-only / API table visible-only 仍保留为独立二刀。
- [x] 已完成候选 B 抽样补充：`base-anchor` / `select` / `radio` strict pending verified sample。第 39 批确认三页均 initial shell true、initial demos 1、props nodes 0、after deferred true，`tabs` 对照页 shell false。
- [x] 已完成候选 C 第一刀：`fusion` / `card` demo / API table 二刀。第 38 批确认 API/Props table 与 demo registry 首屏不 eager，并将 `card` initial demo shells 2 -> 1；production chunk / route-switch timing 仍保留为后续独立复核。
- [x] 已完成候选 D：Nuxt Content `#content/components` global Prose registry 排除 / 显式 native prose map。第 16 批已验证 generated registry 中默认 Prose wrappers 可安全移除，`mdcProse 23 -> 0`。
- [x] 已完成候选 E：普通 dev PWA module gate。第 17 批已验证 docs 首屏 `pwaClient 0`、warning 0，production PWA SW 仍生成。
- [ ] 下一批候选 F：route matrix 首轮扩展。原因：当前证据集中在 docs/components，仍需把 `/`、`/store`、dashboard、Provider Registry、Data Governance 纳入同一性能口径。
- [x] 已完成候选 F 首轮：第 18 批已覆盖 `/`、`/en/docs`、tabs、card、`/store`、dashboard redirect、Provider Registry redirect、Data Governance redirect、home -> store，并输出 screenshot / HAR / JSON / Markdown。
- [x] 已完成候选 G：dev runtime dependency reload。第 19 批已将 `marked`、`echarts/*`、`vue-sonner` 纳入 Vite dev pre-bundle，3211 dev server 路由访问后未再出现这些依赖的 runtime discovery / reload；第 44 批迁走 legacy sonner 后已移除 `vue-sonner` pre-bundle。
- [ ] 下一批候选 H：首页剩余 warning。原因：第 18 批已清理 Vue attrs / hydration mismatch，剩余 warning 主要是 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope`，需要单独定位源头，避免把视觉 canvas 问题混入 docs 批次。
- [x] 已完成候选 I：zh locale message missing warning。第 20 批确认根因是 locale 切换后未补当前 route 的目标语言 route-local chunk，并通过共享 chunk resolver + locale switch preload 修复；3212 dev server `/` 与 `/new` zh 首访不再出现 `landing.*` missing key warning。
- [x] 已完成候选 J 第一刀：dev SSR component docs metadata-first。第 21 批确认 pending 组件文档 dev SSR 首访改请求 `body=0`，fusion HTML 185053 -> 109102 bytes，curl TTFB 2850ms -> 241ms；production SSR 仍请求 `body=1`。
- [x] 已完成候选 J 第二刀：sidebar full-body prefetch cancel。第 22 批确认 component docs sidebar 只立即预热 route + `body=0` metadata，full `body=1` 预取延迟到持续意图并可取消；`scroll` 1.8s 首访窗口内 `body=1` 1 -> 0。
- [x] 已完成候选 J 第三刀：component docs dev metadata fast path。第 28 批确认 component docs `body=0` metadata 请求走本地 frontmatter，不触发 Nuxt Content query / MDC parse；hover `fusion body=0` 为 447 bytes，failed 0。
- [x] 已完成候选 J 第四刀：docs Assistant context on intent。第 30 批确认 ordinary tabs/fusion first visit 不加载 Assistant/dialog/`dompurify`，点击 Assistant 可打开且 `dompurify` 不再触发 Vite runtime discovery。
- [x] 已完成候选 J 第五刀：dev SSR TTFB 二轮 code header graph。第 41 批确认 docs API warm path 毫秒级，慢点集中在 fresh-server SSR import / transform graph；移除 Vue runtime code-header render 后 tabs cold 4128ms -> 3083ms。
- [x] 已完成候选 J 第六刀：dev SSR TTFB 第三刀 toast intent。第 42 批把 docs setup 顶层 `useToast()` 改为 copy/share 后动态 import；tabs cold 2919.6ms -> 2911.8ms 为噪声级小幅变化，但 tabs 首访 `toastRequests 0`，真实 copy 后才加载 toast。
- [x] 已完成候选 J 第七刀：dev SSR TTFB 第四刀 public docs auth/profile graph。第 43 批把 docs admin state 改读 shared state，app root 和 locale orchestrator 动态加载 current-user API；tabs after auth graph requests 为 0。
- [x] 已完成候选 K：legacy `vue-sonner` CSS 首访来源复核。第 44 批确认来源为 sign-in / admin bootstrap 旧 sonner import boundary，迁移到自研 `useToast` 后 tabs sonner requests 0。
- [x] 已完成候选 J 第八刀：right rail / Assistant 首访污染排除。第 45 批确认 docs aside shell、aside cards、Assistant、TxMarkdownView、dompurify 在 tabs 3.5s 首访 HAR 均为 0。
- [ ] 下一批候选 J：dev SSR TTFB 第五刀转 Nuxt macro / runtime。原因：第 46 批确认 `typedPages=false` 不能减少 tabs 的 61 条 `?macro=true` 请求；下一刀不要重复试 typedPages，应判断 route manifest transform、Nuxt page meta extraction、auth page macro 与 docs page setup 中哪个是可安全削减的真实瓶颈。
- [ ] 下一批候选 L：pending / aireview 剩余页面分组落地。原因：76 个 pending 组件已建工作表；第 46 批复核 `auto-sizer` / `scroll` current sample 为 failed 0、`body=1` 0、demo registry 0，后续优先补 `text-transformer` / `base-surface` 这类未采样 P1 baseline，再决定是否做 visible-only demo/API 二刀。
- [ ] 下一批候选 M：production chunk / payload / CSS 污染复核。原因：dev 首访已连续清理 auth、sonner、right rail；仍需用 production build / preview HAR 证明 docs/store/dashboard/landing chunk 和 CSS 没有互相污染。
- [ ] 下一批候选 N：`@sidebase/nuxt-auth` client runtime boundary。原因：第 46 批 tabs / auto-sizer / scroll 首访仍共同下载 12 条 `@sidebase/nuxt-auth` dev client runtime，且 `/api/auth/*` 为 0、current-user 为 0；下一刀应评估是否能把公开 docs 首访从 sidebase module plugin 中拆出，同时保护 dashboard、team join、admin bootstrap、sign-in OAuth callback、header user menu。

### P0：当前 goal 后续验收清单

- [ ] 每一批至少包含：代码改动、focused test、scoped ESLint 或等价静态检查、`git diff --check`、Playwright Markdown 报告。
- [ ] 每一批 Playwright 报告至少包含：截图路径、HAR 路径、failed request count、request count、DOMContentLoaded/load/network idle、client-side route switch timing。
- [ ] 每一批只提交当前相关文件；不得混入 CoreApp AI evidence、其它产品线或无关格式化。
- [x] 第 13 批结束已更新本文：提交 hash、改动范围、测试命令、核心性能数字、下一批候选。
- [x] 第 14 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 15 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 16 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 17 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 18 批结束已更新本文：改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 19 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright CLI screenshot/HAR、HTTP timing、dev log 结论、下一批候选。
- [x] 第 20 批结束已更新本文：提交 hash、改动范围、测试命令、curl zh timing、Playwright CLI home screenshot/HAR、dev log 结论、`/new` 截图待二轮补充。
- [x] 第 21 批结束已更新本文：提交 hash、改动范围、测试命令、production build sanity、baseline/after Playwright CLI screenshot/HAR/Markdown/JSON、HTML/TTFB 核心数字、下一批候选。
- [x] 第 22 批结束已更新本文：提交 hash、改动范围、测试命令、production build sanity、baseline/after Playwright CLI screenshot/HAR/Markdown/JSON、sidebar full-body prefetch cancel 边界、下一批候选。
- [x] 第 24 批结束已更新本文：改动范围、测试命令、production build sanity、baseline/after Playwright CLI screenshot/HAR/Markdown/JSON、HTML / navigation payload 核心数字、下一批候选。
- [x] 第 25 批结束已更新本文：当前 goal 原句、追加收尾要求、后续 docs / aireview / route matrix / TTFB / chunk 任务树和当前批不扩代码边界。
- [x] 第 26 批结束已更新本文：提交 hash、改动范围、测试命令、production build sanity、baseline/after Playwright screenshot/HAR/Markdown/JSON、pager short hover `body=1` 1 -> 0。
- [x] 第 27 批结束已更新本文：当前 goal 原句、追加收尾要求、后续 docs / aireview / route matrix / TTFB / chunk 任务树、领取规则和当前批不扩代码边界。
- [x] 第 28 批结束已更新本文：改动范围、测试命令、production build sanity、Playwright first visit / hover screenshot/HAR/Markdown/JSON、metadata fast path 边界和下一批候选。
- [x] 第 29 批结束已更新本文：第 28 批提交状态、当前 goal 原句、追加收尾要求、后续 docs / aireview / route matrix / TTFB / chunk 任务树和当前批 docs-only 边界。
- [x] 第 30 批结束已更新本文：改动范围、测试命令、production build sanity、Playwright baseline/after screenshot/HAR/Markdown/JSON、Assistant context 按需构建和 `dompurify` pre-bundle 边界。
- [x] 第 31 批结束已更新本文：第 30 批提交状态、当前 goal 原句、追加收尾要求、后续 docs / aireview / route matrix / TTFB / chunk 任务树和当前批 docs-only 边界。
- [x] 第 32 批结束已更新本文：pending / aireview Top 30 工作表路径、扫描口径、统计数字、已有 Playwright 请求回填和下一批候选。
- [x] 第 33 批结束已更新本文：`fusion` / `card` section-level deferred render、验证命令、Playwright/CDP screenshot/HAR/Markdown/JSON、核心 DOM 数字和下一批候选。
- [x] 第 34 批结束已更新本文：`avatar-variants` 单章节大 demo fallback split、baseline/after Playwright/CDP screenshot/HAR/Markdown/JSON、核心 DOM 数字和下一批候选。
- [x] 第 35 批结束已更新本文：当前 goal 原句、追加收尾要求、真实提交 hash、后续 docs / aireview / route matrix / TTFB / chunk 任务树、下一批领取优先级和当前批 docs-only 边界。
- [x] 第 36 批结束已更新本文：strict pending deferred body 规则、`tabs` / `glass-surface` / `gradual-blur` Playwright/CDP baseline/after2 screenshot/HAR/Markdown/JSON、核心 DOM 数字和下一批候选。
- [x] 第 37 批结束已更新本文：当前 goal 原句、追加收尾要求、第 36 批真实提交 hash、后续 docs / aireview / route matrix / TTFB / chunk 任务树、下一批领取优先级和当前批 docs-only 边界。
- [x] 第 38 批结束已更新本文：pending demo second-boundary split、`tabs` / `fusion` / `card` Playwright-core baseline/after screenshot/HAR/Markdown/JSON、核心 DOM 数字和下一批候选。
- [x] 第 39 批结束已更新本文：strict pending verified sample、`tabs` / `base-anchor` / `select` / `radio` Playwright-core screenshot/HAR/Markdown/JSON、核心 DOM 数字和下一批候选。
- [x] 第 40 批结束已更新本文：当前 goal 原句、追加收尾要求、第 39 批真实提交 hash、docs / aireview / route matrix / dev SSR TTFB / 首页 warning / production chunk 任务树、下一批领取优先级和当前批 docs-only 边界。
- [x] 第 41 批结束已更新本文：docs code header 原生 DOM 化、fresh-server curl baseline/after、Playwright-core screenshot/HAR/Markdown/JSON、context-menu code header smoke、focused test / ESLint / whitespace 验证和下一批候选。
- [x] 第 42 批结束已更新本文：docs toast feedback 动态 import、fresh-server curl baseline/after、Playwright-core screenshot/HAR/Markdown/JSON、context-menu copy 动态 toast smoke、focused test / ESLint / whitespace 验证和下一批候选。
- [x] 第 43 批结束已更新本文：public docs auth/profile graph 动态加载、fresh-server / hot-server curl after、Playwright CLI screenshot/HAR/Markdown/JSON、auth graph requests 0、focused test / ESLint / whitespace 验证和下一批候选。
- [x] 第 44 批结束已更新本文：legacy sonner 迁移到自研 toast、curl after、Playwright CLI screenshot/HAR/Markdown/JSON、sonner requests 0、focused test / ESLint / whitespace 验证和下一批候选。
- [x] 第 45 批结束已更新本文：docs aside shell / right rail 假设 Playwright CLI screenshot/HAR/Markdown/JSON、curl smoke、aside shell / assistant / dompurify requests 0、Nuxt dev macro 扫描转后续专项和下一批候选。
- [x] 第 46 批结束已更新本文：typedPages A/B no-op、tabs / auto-sizer / scroll Playwright CLI screenshot/HAR/Markdown/JSON、Node fetch smoke、`body=1` 0、demo registry 0、current-user 0、sidebase client runtime 12 和下一批候选。
- [ ] 后续每一批结束后更新本文：提交 hash、改动范围、测试命令、核心性能数字、下一批候选。

### P0：全站页面切换矩阵

- [x] 建立 Nexus route matrix 首轮：`/`、`/en/docs`、`/en/docs/dev/components/tabs`、`/en/docs/dev/components/card`、`/store`、`/dashboard`、Provider Registry、Data Governance、home -> store。
- [x] 用 Playwright 跑首次加载和同域 client-side route switch 首轮；返回上一页、移动端、authenticated dashboard 和 production preview 待后续二轮。
- [x] 每个 route 输出 screenshot、HAR、JSON timing、Markdown summary。
- [x] 第 19 批补充 route-local deps 验证矩阵：`/`、`/store`、`/sign-in`、`/dashboard/overview`、`/en/docs/dev/components/tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON。
- [x] 第 20 批补充 zh landing route-local chunk 验证：`/` 的 Playwright CLI screenshot / HAR / Markdown / JSON，`/new` 以 curl HTML + server log 完成 warning 修复验证。
- [x] 第 21 批补充 pending docs baseline/after 验证矩阵：`fusion`、`card`、`avatar-variants`、`tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON。
- [x] 第 22 批补充 pending docs baseline/after 验证矩阵：`gradual-blur`、`auto-sizer`、`scroll` 的 Playwright CLI screenshot / HAR / Markdown / JSON。
- [x] 第 24 批补充 tabs scoped navigation 验证：`/en/docs/dev/components/tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON，并记录 SSR payload 缩小结果。
- [x] 第 26 批补充 tabs pager prefetch 验证：`/en/docs/dev/components/tabs` 的 Playwright screenshot / HAR / Markdown / JSON，并记录短 hover 目标页 `body=1` 请求从 1 降为 0。
- [x] 第 28 批补充 component docs metadata fast path 验证：`fusion` / `card` / `tabs` first visit 与 tabs hover `Fusion` 的 Playwright screenshot / HAR / Markdown / JSON，并记录 hover `body=0` 447 bytes、failed 0。
- [x] 第 30 批补充 docs Assistant context 验证：`tabs` / `fusion` first visit 与 tabs Assistant click 的 Playwright screenshot / HAR / Markdown / JSON，并记录 first visit `assistantRequests 0`、`dompurifyRequests 0`、Assistant open 约 1316ms。
- [x] 第 33 批补充 pending deferred body 验证：`fusion` / `card` 的 Playwright/CDP screenshot / HAR / Markdown / JSON，并记录初始 API text false、滚动后 API text true、failed / warnings / errors 均为 0。
- [x] 第 34 批补充 pending single-section demo fallback 验证：`avatar-variants` 的 Playwright/CDP baseline/after screenshot / HAR / Markdown / JSON，并记录 initial demo title true -> false、demo-like nodes 22 -> 0、滚动后恢复 22。
- [x] 第 36 批补充 strict pending verified 验证：`tabs` / `glass-surface` / `gradual-blur` 的 Playwright/CDP screenshot / HAR / Markdown / JSON，并记录 `tabs` shell false、`glass-surface` shell true、`gradual-blur` shell true、failed / warnings / errors 均为 0。
- [x] 第 38 批补充 demo/API 二刀验证：`tabs` / `fusion` / `card` 的 Playwright-core screenshot / HAR / Markdown / JSON，并记录 `card` initial demo shells 2 -> 1、`fusion` 1 -> 1、`tabs` shell false、failed / warnings / errors 均为 0。
- [x] 第 39 批补充 strict pending verified 抽样验证：`tabs` / `base-anchor` / `select` / `radio` 的 Playwright-core screenshot / HAR / Markdown / JSON，并记录三页 pending sample initial shell true、initial demos 1、props nodes 0、after deferred true、failed / warnings / errors 均为 0。
- [x] 第 41 批补充 dev SSR TTFB 二轮验证：`/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect 的 curl baseline/after 与 Playwright-core after screenshot / HAR / Markdown / JSON；记录 tabs cold TTFB 4128ms -> 3083ms。
- [x] 第 42 批补充 docs toast intent 验证：`/en/docs/dev/components/tabs` 与 `/en/docs/dev/components/context-menu` 的 Playwright-core screenshot / HAR / Markdown / JSON；记录 tabs `toastRequests 0`，context-menu copy 后 `toastRequestsAfterClick 1`、toast visible true。
- [x] 第 43 批补充 docs auth/profile graph 验证：`/en/docs/dev/components/tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON；记录 auth graph requests 0、failed 0、`vue-sonner` CSS 2 条转后续独立项。
- [x] 第 44 批补充 docs sonner boundary 验证：`/en/docs/dev/components/tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON；记录 sonner requests 0、auth graph requests 0、failed 0。
- [x] 第 45 批补充 docs aside shell / macro scan 验证：`/en/docs/dev/components/tabs` 的 Playwright CLI screenshot / HAR / Markdown / JSON；记录 aside shell / assistant / dompurify / sonner / auth graph requests 均为 0，Nuxt dev macro scan 2 条转后续专项。
- [x] 第 46 批补充 typedPages no-op 与 pending sample 验证：`/en/docs/dev/components/tabs`、`/en/docs/dev/components/auto-sizer`、`/en/docs/dev/components/scroll` 的 Playwright CLI screenshot / HAR / Markdown / JSON；记录三页 failed 0、`body=1` 0、demo registry 0、Assistant/dom 0、sonner 0、current-user 0，`@sidebase/nuxt-auth` client runtime 12 转后续专项。
- [ ] 对比每批提交前后 request count、stylesheet/script count、failed count、elapsed。
- [ ] 将结果归档到 `output/playwright/`，只引用报告路径，不把 artifact 纳入 git。
- [ ] route matrix 二轮补：authenticated `/dashboard`、Provider Registry、Data Governance；移动端 viewport；production preview；back/forward cache；首屏 media failed request 分类；补 `/new` Playwright screenshot/HAR。

### P1：生产构建同类风险复核

- [ ] 跑 `pnpm -C "apps/nexus" run build` 或 `pnpm nexus:build`，确认生产 CSS chunk 不存在同类跨页面污染；2026-06-21 复核时 client/server build 通过，但完整 prerender 阶段仍有既有错误需单独收敛。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 12 批 docs aside shell lazy boundary 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 13 批 AI notice 静态化不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 14 批 code block renderer lazy split 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 15 批 docs native prose heading mapping 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 16 批 MDC Prose global registry filter 不影响生产 client/server/Nitro/PWA 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 17 批 PWA dev module gate 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 18 批 landing route matrix cleanup 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 19 批 route-local dev pre-bundle 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`；第一次 TuffEx dist resolve 瞬时失败，第二次完整通过，若复现再单独追。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 20 批 locale switch route-local chunk preload 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 21 批 dev SSR component docs metadata-first 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 22 批 sidebar full-body prefetch cancel 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 24 批 component docs scoped navigation 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 26 批 docs pager full-body prefetch cancel 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 28 批 component docs dev metadata fast path 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 30 批 docs Assistant context 按需构建与 `dompurify` dev pre-bundle 不影响生产 client/server/Nitro/PWA 打包。
- [ ] 检查 Nuxt route chunks、payload chunks、CSS chunks 是否存在 docs/store/dashboard/landing 互相污染。
- [ ] 若生产存在同类问题，优先从 import boundary / layout boundary / component registration 修复，而不是沿用 dev-only HTML filter。

### P1：dev scripts / devtools 请求复核

- [x] 复核 tabs HAR 中剩余 scripts：3200 baseline tabs 521 requests / 457 scripts，其中 devtools 18、node_modules 287、nuxt-runtime 148、i18n 4。
- [x] 先做临时实验验证是否能安全减少 Vue Router / Pinia devtools 相关 dev-only import；A/B 证明 tabs/card 各减少 18 个请求，failed 0。
- [x] 若要落地 alias / noop 模块，必须有 focused Vitest、scoped ESLint、Playwright tabs/card/switch 报告和 failed request = 0 证据。
- [x] 不直接 alias 不稳定的 Nuxt / Vue Router 内部路径，除非确认版本边界、fallback 和运行时兼容性。
- [x] 普通 docs dev 不默认启用 PWA dev client plugin；需要 PWA 调试时显式使用 `pnpm -C "apps/nexus" run dev:pwa`。
- [x] 将 `@vueuse/core` 加入 Vite dev pre-bundle，避免首页视觉路由首次访问 runtime dependency discovery。
- [x] 将 `marked`、`echarts/core`、`echarts/charts`、`echarts/components`、`echarts/renderers` 加入 Vite dev pre-bundle，避免 docs renderer / dashboard charts 在 route visit 时触发 runtime dependency discovery；`vue-sonner` 曾在第 19 批加入，已在第 44 批迁移 legacy toast 后移除。
- [x] 将 `dompurify` 加入 Vite dev pre-bundle，避免 docs Assistant 打开后 `TxMarkdownView` 触发 runtime dependency discovery / reload。
- [ ] 继续拆剩余 dev scripts：Nuxt runtime、`node_modules`、demo wrapper 可见区加载、真实 code block 页 renderer chunk 体量。
- [ ] 继续观察 Vite runtime discovery 是否在 route matrix 二轮出现新的依赖；若出现，先定位收益，再决定 pre-bundle 或拆 route-local/lazy import。

### P1：i18n 与 route-local message 深化

- [ ] 继续检查 docs/components/store/dashboard 是否有首屏无关 locale messages 被 eager import。
- [x] 统计并修复 `zh` locale 下首页 `landing.*` missing key warning；第 20 批已确认 `/` 与 `/new` 在 `Accept-Language: zh-CN` 下不再输出 `landing.*` missing key。
- [ ] 将 route-local 文案与 message catalog 保持一致，禁止硬编码中文 fallback 或双语三元表达式。
- [ ] 为 locale lazy load 增加 route switch 回归测试，避免重新引入全局 locale blob。

### P1：dev SSR TTFB 深化

- [ ] 建立 dev SSR cold/warm TTFB 对比基线：`/`、`/store`、`/en/docs/dev/components/tabs`、`/sign-in`、未登录 dashboard redirect。
- [ ] 分解 TTFB 来源：Nuxt transform/cache、Content query、i18n orchestrator、plugin store memory init、auth cookie/session、route middleware。
- [ ] 将可以静态化的 docs metadata / route shell 固定为缓存合同；动态内容只在确实需要时请求。
- [ ] 每次优化后同时记录 curl timing、Playwright HAR、server log warning 变化。

### P1：静态化与模板固定

- [ ] 固定 docs 页面模板的静态 shell：目录、breadcrumb、metadata、footer、SEO helpers 分离。
- [ ] 对不依赖运行时状态的 docs metadata 生成静态 manifest。
- [ ] 复核 `content/docs` 根索引、developer quickstart、components index、guide start 与 docs API 的 prerender/payload 策略。
- [ ] 将常用 docs route 的 metadata 和 sidebar 缓存策略记录为可测试合同。

### P2：质量门禁与文档同步

- [ ] 每批提交保留最近路径测试命令、Playwright 报告路径和性能数字。
- [ ] 重要行为变更同步 `docs/plan-prd/TODO.md`、`docs/plan-prd/TODO-nexus.md`、`docs/plan-prd/01-project/CHANGES.md` 或 `docs/INDEX.md` 中至少一个。
- [ ] 对当前已知 typecheck 既有失败单独记录，不混入 Nexus 性能批次判断。

## 当前已知阻塞或注意事项

- `output/playwright/` 是 ignored 证据目录，只在文档和汇报中引用路径，不纳入提交。
- 普通 `git commit` 可能被本地 Husky 固定 pnpm shim 路径阻塞；若最近路径验证已通过，可用 `HUSKY=0 git commit ...` 提交当前批次。
- 已知全量 typecheck 可能存在历史失败，当前 Nexus 性能批次以 focused Vitest、scoped ESLint、curl smoke、Playwright 报告和 `git diff --check` 为准。
- 当前第 6 批是 dev-only 止血阀，后续仍要追 Nuxt dev SSR 为什么会收集跨页面 stylesheet，以及生产构建是否存在同类污染。
- 当前第 39 批 strict pending verified sample 已经完成，后续不要继续往本批塞代码改动、aireview 逐页 section split、dev SSR 深化、首页 WebGL/lifecycle warning 或生产 chunk 复核；新改动按上方 TODO 独立切批、独立验证、独立提交。
- 当前第 42 批 docs toast intent 已经完成，后续不要继续往本批塞 share UI、engagement、admin、comment、首页 WebGL warning、production chunk 复核或 pending 逐页 demo/API 二刀；新改动按上方 TODO 独立切批、独立验证、独立提交。
- 当前第 43 批 public docs auth/profile graph 已经完成，后续不要继续往本批塞 `vue-sonner` CSS 首访、share/engagement/comment/right rail、首页 warning、production chunk 复核或 pending 逐页 demo/API 二刀；新改动按上方 TODO 独立切批、独立验证、独立提交。
- 当前第 44 批 legacy sonner boundary 已经完成，后续不要继续往本批塞 share/engagement/comment/right rail、首页 warning、production chunk 复核或 pending 逐页 demo/API 二刀；新改动按上方 TODO 独立切批、独立验证、独立提交。
