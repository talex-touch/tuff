# Nexus Performance TODO

> 更新时间：2026-06-21
> 范围：`apps/nexus` 文档站、生态站、Dashboard、Provider Registry、Data Governance 与公开控制台的性能收口。
> 当前状态：Nexus docs 第 17 批已收尾；本批把普通 dev 模式下的 `@vite-pwa/nuxt` 模块和 PWA client plugin 从 docs 首屏移出，同时用本地 wrapper 保留 production / `dev:pwa` 的 manifest 行为，修复禁用模块后的 `VitePwaManifest` 组件 warning。后续 docs 文档内容、AI review / aireview 未审批组件、全站切换矩阵和生产 chunk 复核继续按本文 TODO 队列推进。

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

- 本轮 tabs/card 文档链路：约 98%。触发页 `/en/docs/dev/components/tabs` 已修复 500 风险、full-body 抢首屏、组件侧栏链接晚出现、一批 dev route-local CSS 污染、dev-only Vue Devtools bridge 请求、PWA dev client plugin 抢首屏问题，并将右侧 DocsOutline、DocsAsideCardsShell、pending 文档 AI notice、无 code 页面 code block renderer/CSS、docs 主正文 MDC Prose wrapper、Nuxt Content global Prose registry 从首屏重型路径拆出。
- 整体 goal 估算：约 77%。已完成 docs 路由关键路径止血与一批 dev 模式请求削减；后续仍需系统性覆盖 AI review / aireview 未审批组件、全站 route matrix、生产构建 chunk 复核与文档模板静态化。
- 已完成：docs sidebar metadata 延迟加载、docs metadata 避免全量 MDC 解析、i18n locale messages 懒加载、docs highlight 全局插件移除、route-local locale messages 拆分、dev SSR route-local stylesheet 过滤、docs full-body 请求与预取 idle 调度、组件侧栏 metadata 从 8s 延迟改为水合后短延迟、docs route 过滤 new/asset-create/version drawer 类无关 stylesheet、dev 模式 `@vue/devtools-api` noop bridge、DocsOutline 首屏懒挂载、DocsAsideCardsShell 占位按钮 + idle 延迟挂载、AI notice 静态化且不再 eager mount aside cards / shell、code block renderer/style 从无代码文档首屏拆出、docs 主正文禁用默认 MDC Prose 全量映射并保留 heading anchors、Nuxt Content global Prose registry 过滤、policy 页面显式 native prose、普通 dev 模式 PWA module gate 与 `VitePwaManifest` wrapper。
- 当前批次已停止扩大范围；后续全部进入 TODO 队列：docs 文档内容继续拆分、未审批组件逐页审计和优化、重型 demo / report / preview lazy boundary、生产构建 chunk 污染复核、全站页面切换矩阵。

## 子任务百分比快照

| 子任务 | 当前进度 | 说明 |
| --- | ---: | --- |
| 当前第 17 批 PWA dev module gate | 100% | 已提交 `6ee64dc98`；普通 dev 不再加载 `@vite-pwa/nuxt` / `pwa.client`，production 与 `dev:pwa` 保持 PWA manifest/SW 行为；focused tests、scoped ESLint、`git diff --check`、Playwright clean after、生产 build sanity 均已完成。 |
| `/en/docs/dev/components/tabs` 触发链路 | 98% | 页面 200；第 17 批 clean tabs：requests 415、scripts 395、failed 0、`pwaClient 0`、console warning 0、H1 `Tabs`；剩余是 Nuxt/runtime、`node_modules` 与 docs demo 模块碎片继续拆。 |
| docs 内容加载拆分 | 79% | `body=0` / idle `body=1` 已落地；右侧 outline、assistant shell、AI notice、无代码文档 code block renderer/CSS、docs 主正文 Prose wrapper 映射、Nuxt Content global Prose registry、普通 dev PWA client plugin 已从重型首屏路径拆出；demo registry、模板静态 shell、DocApiTable 仍待做。 |
| AI review / aireview 未审批组件 | 29% | 已完成 pending 口径、高风险文档清单、fusion/card/avatar-variants/tabs Playwright baseline、AI notice eager mount 修复、无代码 pending 页 code block renderer eager load 修复、pending 长文档 MDC Prose wrapper / global Prose registry / PWA dev client 削减；逐页 demo/模板优化待做。 |
| 全站页面切换矩阵 | 10% | tabs/card 有基线；`/`、`/store`、dashboard、Provider Registry、Data Governance 待覆盖。 |
| 生产构建 chunk 复核 | 16% | 第 10/11/12/13/14/15/16/17 批均已通过 `NUXT_DISABLE_PRERENDER=true` compile sanity；第 17 批确认 production 仍生成 PWA SW；完整 prerender 和 chunk/payload/CSS 深查待做。 |
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
- 当前工作树存在 CoreApp 相关未提交改动，属于其它任务范围；Nexus 本轮收尾不混入这些文件。
- `output/playwright/` 继续作为 ignored evidence 目录，只在本文引用报告路径，不纳入 git。
- 下一阶段不再继续扩大当前批次；所有 docs 内容、AI review / aireview 未审批组件和全站矩阵都按下方 TODO 分批处理。
- 仍需继续追的已知剩余瓶颈：tabs 首屏 script request 仍偏高；第 10 批已将 Vue Router / Pinia devtools bridge 请求从 18 降到 3，第 16 批将 MDC Prose registry 请求归零，第 17 批将普通 dev 的 PWA client plugin 请求归零，但 Nuxt runtime、`node_modules`、i18n 与 docs demo 模块碎片仍待继续拆。下一批必须先用 Playwright / HAR 验证有效收益，再决定是否落代码。

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

- [x] 当前批次只收尾第 17 批 PWA dev module gate，不继续混入 docs demo、DocApiTable 或更多 aireview 未审批组件逐页优化。
- [x] 当前 goal 原句、用户追加要求、触发页、批次提交、验证证据、子任务百分比和后续执行队列已写入本文。
- [x] 后续 docs 文档内容、AI review / aireview 相关事项统一从本文任务树领取，按小批次执行、验证、提交和回填。
- [ ] 下一批开始前先选定一个 P0 子任务和 1-2 个页面，优先从 `fusion` / `card` / `avatar-variants` 中选，跑 Playwright / HAR baseline 后再落代码。

### P0：docs 文档内容加载继续拆分

- [x] 盘点 docs route 首屏 payload：区分 SSR 必须数据、首屏可见内容、折叠区内容、demo registry、code block/highlight、metadata。
- [x] 将组件 docs 文档正文加载拆成 `body=0` metadata 与 idle `body=1` full body，避免页面切换初期重复拉大 payload。
- [x] 将组件侧栏 metadata 从固定 8s 后置改为水合后短延迟加载，避免同组组件导航链接晚出现。
- [ ] 固化 docs template：同类文档页共享稳定布局壳，正文与 demo 独立懒加载。
- [ ] 将 demo registry 从 docs 首屏路径移出，组件 demo 只在可见区域或交互展开时加载。
- [ ] 拆 pending 文档的大正文：优先让首屏 headline / summary / props overview 静态化，长 demo、FAQ、usage sections 后置到 idle 或可见区。
- [ ] 审计 docs content API payload：确认 `body=0` 返回字段最小化，长正文 full body 只在正文确实需要时请求，并为 route switch 复用轻 metadata。
- [ ] 复核 docs components index / component detail 共用模板：把 breadcrumb、metadata、right rail、footer sentinel 保持静态壳，正文和 demo 走独立 lazy boundary。
- [ ] 对 `DocApiTable` 做按需加载实验：只在存在 API table 的文档和对应可见区加载，避免无 API 表文档首屏重复拉相关 chunk。
- [x] 检查并修复无代码文档页的 code block renderer eager import：`tabs` / `fusion` / `avatar-variants` clean first visit 均为 codeBlock requests 0。
- [x] 检查并部分修复 Markdown renderer / MDC Prose wrapper 首屏请求：docs 主正文改用 native prose tags + lightweight heading anchors，`fusion` requests 453 -> 442。
- [x] 检查并修复 Nuxt Content global Prose registry eager import：第 16 批后 `tabs` / `fusion` / `card` / policy 页面 clean first visit 均为 `mdcProse 0`。
- [ ] 继续检查 `DocApiTable`、demo wrapper 是否在 pending 文档首屏重复 eager import。
- [x] 检查并修复普通 dev PWA client plugin eager import：第 17 批后 `tabs` / `fusion` / `card` / `avatar-variants` / `switch-tabs-to-card` 均为 `pwaClient 0`，console warning/error 0。
- [x] 对 tabs/card 等组件页建立最小 Playwright 性能基线：首屏截图、HAR、request count、failed count、DOMContentLoaded/load、client-side route switch timing。
- [x] 为 docs 内容加载新增 focused tests，钉住不会回退到全量 MDC parse、同步 full-body prefetch 或全局 demo registry eager load。

### P0：aireview 未审批组件优化

- [x] 建立当前可执行口径：仓库内暂无稳定字面量 `aireview` 标记，先按组件文档 frontmatter 的 `syncStatus != reviewed` 或 `verified != true` 视为 AI review / aireview 未审批或未完全审批。
- [x] 初步审计 `apps/nexus/content/docs/dev/components/*.mdc`：共 216 个组件文档，`reviewed` 64 个，`migrated` 152 个，`verified: true` 92 个，未 verified 124 个；按上述口径 pending 152 个。
- [x] 建立 pending baseline：`fusion` / `card` / `avatar-variants` / `tabs` 已输出 Playwright baseline；确认第 13 批前 `card`、`avatar-variants` 会因 AI notice eager mount aside cards / shell。
- [x] 修复 pending AI notice eager mount：notice 已静态化，`card` / `avatar-variants` 首屏 `DocsAside` class count 从 4 降到 0。
- [x] 修复 pending / 无代码文档 code block renderer eager load：`fusion` / `avatar-variants` 首屏 codeBlock requests 从 1 降到 0，stylesheets 从 18 降到 17。
- [x] 修复 pending 长正文的部分 MDC Prose wrapper 请求：`fusion` scripts 433 -> 423，`card` scripts 441 -> 427，同时 heading anchors / tables 保持。
- [ ] 不新增宽泛审计脚手架；每批只为待修页面输出一次性 Playwright / HAR evidence 或 focused regression，记录 pending 组件、正文体量、demo 数、重型 client demo 引用数。
- [ ] 对未审批组件逐个分组：可静态化、可懒加载、应移出 docs 首屏、应合并模板、应删除或后置。
- [ ] 输出 pending 组件工作表：每个组件记录 `syncStatus`、`verified`、正文大小、demo 数、code block 数、是否有 API table、首屏请求数、下一步动作。
- [ ] 将 pending 组件按收益排序，而不是按字母顺序处理；优先高正文体量、高 demo 数、高首屏请求的页面。
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
- [ ] 逐页确认 pending AI notice 只渲染静态 notice，不再为了说明文字挂载 assistant shell、dialog、comments、feedback 或 analytics widget。
- [ ] 对重型 demo 组件做 visible-only guard：首屏上方只保留静态 preview / run button，真实 demo client chunk 在可见区或点击后加载。
- [ ] 对长文档 usage / examples / FAQ 区做 section-level split，避免 route switch 时立即解析所有后半页内容。
- [ ] 下一批候选 A：`fusion` demo lazy boundary。原因：正文约 52KB、10 个 demo，after report 仍需要 4.5s 后确认 aside idle mount，适合继续拆 demo / content renderer。
- [ ] 下一批候选 B：`card` demo / API table 首屏拆分。原因：正文约 49KB、12 个 demo，第 14 批后真实 code block 行为已守住，但仍适合继续测 demo registry 与 API table eager import。
- [ ] 下一批候选 C：`avatar-variants` 长正文静态模板化。原因：正文约 36KB、demo 少但体量高，适合验证模板固定和长内容后置是否有效。
- [x] 已完成候选 D：Nuxt Content `#content/components` global Prose registry 排除 / 显式 native prose map。第 16 批已验证 generated registry 中默认 Prose wrappers 可安全移除，`mdcProse 23 -> 0`。
- [x] 已完成候选 E：普通 dev PWA module gate。第 17 批已验证 docs 首屏 `pwaClient 0`、warning 0，production PWA SW 仍生成。
- [ ] 下一批候选 F：route matrix 首轮扩展。原因：当前证据集中在 docs/components，仍需把 `/`、`/store`、dashboard、Provider Registry、Data Governance 纳入同一性能口径。

### P0：当前 goal 后续验收清单

- [ ] 每一批至少包含：代码改动、focused test、scoped ESLint 或等价静态检查、`git diff --check`、Playwright Markdown 报告。
- [ ] 每一批 Playwright 报告至少包含：截图路径、HAR 路径、failed request count、request count、DOMContentLoaded/load/network idle、client-side route switch timing。
- [ ] 每一批只提交当前相关文件；不得混入 CoreApp AI evidence、其它产品线或无关格式化。
- [x] 第 13 批结束已更新本文：提交 hash、改动范围、测试命令、核心性能数字、下一批候选。
- [x] 第 14 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 15 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 16 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [x] 第 17 批结束已更新本文：提交 hash、改动范围、测试命令、Playwright 核心数字、下一批候选。
- [ ] 后续每一批结束后更新本文：提交 hash、改动范围、测试命令、核心性能数字、下一批候选。

### P0：全站页面切换矩阵

- [ ] 建立 Nexus route matrix：`/`、`/en/docs`、`/en/docs/dev/components/tabs`、`/en/docs/dev/components/card`、`/store`、`/dashboard`、Provider Registry、Data Governance。
- [ ] 用 Playwright 跑首次加载、同域 client-side route switch、返回上一页、刷新后的视觉稳定性。
- [ ] 每个 route 输出 screenshot、HAR、JSON timing、Markdown summary。
- [ ] 对比每批提交前后 request count、stylesheet/script count、failed count、elapsed。
- [ ] 将结果归档到 `output/playwright/`，只引用报告路径，不把 artifact 纳入 git。

### P1：生产构建同类风险复核

- [ ] 跑 `pnpm -C "apps/nexus" run build` 或 `pnpm nexus:build`，确认生产 CSS chunk 不存在同类跨页面污染；2026-06-21 复核时 client/server build 通过，但完整 prerender 阶段仍有既有错误需单独收敛。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 12 批 docs aside shell lazy boundary 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 13 批 AI notice 静态化不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 14 批 code block renderer lazy split 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 15 批 docs native prose heading mapping 不影响生产 client/server/Nitro 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 16 批 MDC Prose global registry filter 不影响生产 client/server/Nitro/PWA 打包。
- [x] 跑 `NUXT_DISABLE_PRERENDER=true pnpm -C "apps/nexus" run build`，确认第 17 批 PWA dev module gate 不影响生产 client/server/Nitro/PWA 打包，生产仍生成 `sw.js`。
- [ ] 检查 Nuxt route chunks、payload chunks、CSS chunks 是否存在 docs/store/dashboard/landing 互相污染。
- [ ] 若生产存在同类问题，优先从 import boundary / layout boundary / component registration 修复，而不是沿用 dev-only HTML filter。

### P1：dev scripts / devtools 请求复核

- [x] 复核 tabs HAR 中剩余 scripts：3200 baseline tabs 521 requests / 457 scripts，其中 devtools 18、node_modules 287、nuxt-runtime 148、i18n 4。
- [x] 先做临时实验验证是否能安全减少 Vue Router / Pinia devtools 相关 dev-only import；A/B 证明 tabs/card 各减少 18 个请求，failed 0。
- [x] 若要落地 alias / noop 模块，必须有 focused Vitest、scoped ESLint、Playwright tabs/card/switch 报告和 failed request = 0 证据。
- [x] 不直接 alias 不稳定的 Nuxt / Vue Router 内部路径，除非确认版本边界、fallback 和运行时兼容性。
- [x] 普通 docs dev 不默认启用 PWA dev client plugin；需要 PWA 调试时显式使用 `pnpm -C "apps/nexus" run dev:pwa`。
- [ ] 继续拆剩余 dev scripts：Nuxt runtime、`node_modules`、demo wrapper 可见区加载、真实 code block 页 renderer chunk 体量。

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
- 当前第 17 批已经收尾，后续不要继续往本批塞 docs demo、DocApiTable 或 aireview 逐页优化；新改动按上方 TODO 独立切批、独立验证、独立提交。
