# Nexus Performance TODO

> 更新时间：2026-06-21
> 范围：`apps/nexus` 文档站、生态站、Dashboard、Provider Registry、Data Governance 与公开控制台的性能收口。
> 当前状态：Nexus docs 第 12 批已收尾；本批将右侧 DocsAsideCardsShell 从 tabs 首屏同步路径移到轻量占位按钮 + idle 延迟挂载，后续 docs 文档内容、AI review / aireview 未审批组件、全站切换矩阵和生产 chunk 复核继续按本文 TODO 队列推进。

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
- 当前本地验证 dev server：`http://localhost:3200`

## 当前进度

- 本轮 tabs/card 文档链路：约 93%。触发页 `/en/docs/dev/components/tabs` 已修复 500 风险、full-body 抢首屏、组件侧栏链接晚出现、一批 dev route-local CSS 污染、dev-only Vue Devtools bridge 请求问题，并将右侧 DocsOutline 与 DocsAsideCardsShell 延后到 idle 后挂载。
- 整体 goal 估算：约 68%。已完成 docs 路由关键路径止血与一批 dev 模式请求削减；后续仍需系统性覆盖 AI review / aireview 未审批组件、全站 route matrix、生产构建 chunk 复核与文档模板静态化。
- 已完成：docs sidebar metadata 延迟加载、docs metadata 避免全量 MDC 解析、i18n locale messages 懒加载、docs highlight 全局插件移除、route-local locale messages 拆分、dev SSR route-local stylesheet 过滤、docs full-body 请求与预取 idle 调度、组件侧栏 metadata 从 8s 延迟改为水合后短延迟、docs route 过滤 new/asset-create/version drawer 类无关 stylesheet、dev 模式 `@vue/devtools-api` noop bridge、DocsOutline 首屏懒挂载、DocsAsideCardsShell 占位按钮 + idle 延迟挂载。
- 当前批次已停止扩大范围；后续全部进入 TODO 队列：docs 文档内容继续拆分、未审批组件逐页审计和优化、重型 demo / report / preview lazy boundary、生产构建 chunk 污染复核、全站页面切换矩阵。

## 子任务百分比快照

| 子任务 | 当前进度 | 说明 |
| --- | ---: | --- |
| 当前第 12 批 aside shell follow-up | 100% | 已提交 `468b1ae63`；代码、focused tests、scoped ESLint、Playwright 截图/HAR、生产 compile sanity 均已完成。 |
| `/en/docs/dev/components/tabs` 触发链路 | 93% | 页面 200；tabs 首屏 DCL 127ms、network idle 1251ms、failed 0；占位按钮点击到 Assistant dialog 210ms；剩余是 Nuxt/runtime 与 docs demo 模块碎片继续拆。 |
| docs 内容加载拆分 | 68% | `body=0` / idle `body=1` 已落地；右侧 outline 和 assistant shell 已延迟挂载；demo registry、模板静态 shell、折叠区 lazy 仍待做。 |
| AI review / aireview 未审批组件 | 18% | 已完成 pending 口径和高风险文档清单；逐页 Playwright 基线与重型 demo 优化待做。 |
| 全站页面切换矩阵 | 10% | tabs/card 有基线；`/`、`/store`、dashboard、Provider Registry、Data Governance 待覆盖。 |
| 生产构建 chunk 复核 | 15% | 第 10/11/12 批均已通过 `NUXT_DISABLE_PRERENDER=true` compile sanity；完整 prerender 和 chunk/payload/CSS 深查待做。 |
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

## 本轮收尾结论

- `/en/docs/dev/components/tabs` 当前页切换已从“切换时立即竞争 full-body Markdown parse / sidebar full-body prefetch”改为“先轻 metadata，后 idle full body”。
- 第 7 批已提交：`e46541119 perf(nexus): defer docs full body prefetch`。
- 第 9 批已提交：`926ae0818 perf(nexus): filter more docs dev stylesheets`。
- 第 10 批已提交：`a8b21aaae perf(nexus): noop vue devtools api in dev`。
- 第 11 批已提交：`5fb01c7ba perf(nexus): lazy mount docs outline`；右侧 `DocsOutline` 从首屏同步挂载改为轻量 skeleton 壳 + idle 延迟挂载，移动端目录按钮仍立即挂载真实 outline。
- 第 12 批已提交：`468b1ae63 perf(nexus): lazy mount docs aside shell`；右侧 `DocsAsideCardsShell` 从首屏同步 import 改为 `LazyDocsAsideCardsShell` + 轻量占位按钮 + idle 延迟挂载，占位按钮点击仍可立即打开 Assistant。
- 当前工作树存在 CoreApp 相关未提交改动，属于其它任务范围；Nexus 本轮收尾不混入这些文件。
- `output/playwright/` 继续作为 ignored evidence 目录，只在本文引用报告路径，不纳入 git。
- 下一阶段不再继续扩大当前批次；所有 docs 内容、AI review / aireview 未审批组件和全站矩阵都按下方 TODO 分批处理。
- 仍需继续追的已知剩余瓶颈：tabs 首屏 script request 仍偏高；第 10 批已将 Vue Router / Pinia devtools bridge 请求从 18 降到 3，但 Nuxt runtime、`node_modules`、i18n 与 docs demo 模块碎片仍待继续拆。下一批必须先用 Playwright / HAR 验证有效收益，再决定是否落代码。

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

- [x] 当前批次只收尾第 12 批 docs aside shell follow-up，不继续混入 docs 内容拆分或 aireview 未审批组件优化。
- [x] 当前 goal 原句、用户追加要求、触发页、批次提交、验证证据、子任务百分比和后续执行队列已写入本文。
- [x] 后续 docs 文档内容、AI review / aireview 相关事项统一从本文任务树领取，按小批次执行、验证、提交和回填。
- [ ] 下一批开始前先选定一个 P0 子任务和 1-2 个页面，跑 Playwright / HAR baseline 后再落代码。

### P0：docs 文档内容加载继续拆分

- [x] 盘点 docs route 首屏 payload：区分 SSR 必须数据、首屏可见内容、折叠区内容、demo registry、code block/highlight、metadata。
- [x] 将组件 docs 文档正文加载拆成 `body=0` metadata 与 idle `body=1` full body，避免页面切换初期重复拉大 payload。
- [x] 将组件侧栏 metadata 从固定 8s 后置改为水合后短延迟加载，避免同组组件导航链接晚出现。
- [ ] 固化 docs template：同类文档页共享稳定布局壳，正文与 demo 独立懒加载。
- [ ] 将 demo registry 从 docs 首屏路径移出，组件 demo 只在可见区域或交互展开时加载。
- [x] 对 tabs/card 等组件页建立最小 Playwright 性能基线：首屏截图、HAR、request count、failed count、DOMContentLoaded/load、client-side route switch timing。
- [x] 为 docs 内容加载新增 focused tests，钉住不会回退到全量 MDC parse、同步 full-body prefetch 或全局 demo registry eager load。

### P0：aireview 未审批组件优化

- [x] 建立当前可执行口径：仓库内暂无稳定字面量 `aireview` 标记，先按组件文档 frontmatter 的 `syncStatus != reviewed` 或 `verified != true` 视为 AI review / aireview 未审批或未完全审批。
- [x] 初步审计 `apps/nexus/content/docs/dev/components/*.mdc`：共 216 个组件文档，`reviewed` 64 个，`migrated` 152 个，`verified: true` 92 个，未 verified 124 个；按上述口径 pending 152 个。
- [ ] 不新增宽泛审计脚手架；每批只为待修页面输出一次性 Playwright / HAR evidence 或 focused regression，记录 pending 组件、正文体量、demo 数、重型 client demo 引用数。
- [ ] 对未审批组件逐个分组：可静态化、可懒加载、应移出 docs 首屏、应合并模板、应删除或后置。
- [ ] 优先处理高风险 pending 页面：
  - `fusion.en.mdc` / `fusion.zh.mdc`：约 52KB / 52KB，10 个 demo。
  - `card.en.mdc` / `card.zh.mdc`：约 49KB / 48KB，12 个 demo。
  - `avatar-variants.en.mdc` / `avatar-variants.zh.mdc`：约 36KB / 36KB，正文体量高。
  - `gradual-blur.en.mdc` / `gradual-blur.zh.mdc`：约 16KB / 15KB，7 个 demo。
  - `auto-sizer.en.mdc` / `auto-sizer.zh.mdc`：约 14KB / 13KB，7 个 demo。
  - `scroll.en.mdc` / `scroll.zh.mdc`：约 12KB / 11KB，6 个 demo。
- [ ] 对上述 aireview / pending 文档页做 Playwright 截图和 HAR 基线，记录首屏请求量、慢资源、样式/脚本污染、route switch timing。
- [ ] 优化 aireview / pending 组件的 client-only 边界，避免 SSR 阶段加载浏览器态或重型交互依赖。
- [ ] 将 aireview demo / preview / report 类重型组件改为显式 lazy boundary，并复用现有 `TuffDemoWrapper` / `TuffDemoClientRenderer.client.vue` 懒激活机制。
- [ ] 为 aireview 未审批组件新增加载回归测试，确保文档页切换不 eager import 全部重型组件。

### P0：当前 goal 后续验收清单

- [ ] 每一批至少包含：代码改动、focused test、scoped ESLint 或等价静态检查、`git diff --check`、Playwright Markdown 报告。
- [ ] 每一批 Playwright 报告至少包含：截图路径、HAR 路径、failed request count、request count、DOMContentLoaded/load/network idle、client-side route switch timing。
- [ ] 每一批只提交当前相关文件；不得混入 CoreApp AI evidence、其它产品线或无关格式化。
- [ ] 每一批结束后更新本文：提交 hash、改动范围、测试命令、核心性能数字、下一批候选。

### P0：全站页面切换矩阵

- [ ] 建立 Nexus route matrix：`/`、`/en/docs`、`/en/docs/dev/components/tabs`、`/en/docs/dev/components/card`、`/store`、`/dashboard`、Provider Registry、Data Governance。
- [ ] 用 Playwright 跑首次加载、同域 client-side route switch、返回上一页、刷新后的视觉稳定性。
- [ ] 每个 route 输出 screenshot、HAR、JSON timing、Markdown summary。
- [ ] 对比每批提交前后 request count、stylesheet/script count、failed count、elapsed。
- [ ] 将结果归档到 `output/playwright/`，只引用报告路径，不把 artifact 纳入 git。

### P1：生产构建同类风险复核

- [ ] 跑 `pnpm -C "apps/nexus" run build` 或 `pnpm nexus:build`，确认生产 CSS chunk 不存在同类跨页面污染；2026-06-21 复核时 client/server build 通过，但完整 prerender 阶段仍有既有错误需单独收敛。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 12 批 docs aside shell lazy boundary 不影响生产 client/server/Nitro 打包。
- [ ] 检查 Nuxt route chunks、payload chunks、CSS chunks 是否存在 docs/store/dashboard/landing 互相污染。
- [ ] 若生产存在同类问题，优先从 import boundary / layout boundary / component registration 修复，而不是沿用 dev-only HTML filter。

### P1：dev scripts / devtools 请求复核

- [x] 复核 tabs HAR 中剩余 scripts：3200 baseline tabs 521 requests / 457 scripts，其中 devtools 18、node_modules 287、nuxt-runtime 148、i18n 4。
- [x] 先做临时实验验证是否能安全减少 Vue Router / Pinia devtools 相关 dev-only import；A/B 证明 tabs/card 各减少 18 个请求，failed 0。
- [x] 若要落地 alias / noop 模块，必须有 focused Vitest、scoped ESLint、Playwright tabs/card/switch 报告和 failed request = 0 证据。
- [x] 不直接 alias 不稳定的 Nuxt / Vue Router 内部路径，除非确认版本边界、fallback 和运行时兼容性。
- [ ] 继续拆剩余 dev scripts：Nuxt runtime、`node_modules`、docs content renderer、demo wrapper / code block 相关模块碎片。

### P1：i18n 与 route-local message 深化

- [ ] 继续检查 docs/components/store/dashboard 是否有首屏无关 locale messages 被 eager import。
- [ ] 将 route-local 文案与 message catalog 保持一致，禁止硬编码中文 fallback 或双语三元表达式。
- [ ] 为 locale lazy load 增加 route switch 回归测试，避免重新引入全局 locale blob。

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
- 当前第 12 批已经收尾，后续不要继续往本批塞 docs 内容或 aireview 优化；新改动按上方 TODO 独立切批、独立验证、独立提交。
