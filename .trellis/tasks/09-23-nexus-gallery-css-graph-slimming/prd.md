# Nexus suite 画廊按格懒挂载与 docs 样式表合并

父任务：`09-23-nexus-docs-perf-cms-remediation`。

## Goal

让 `/docs/dev/components/{base,pro,ai,data,flow}-suite` 的预渲染 HTML 只携带画廊外壳所需的资源，specimen 本体在客户端首屏之后异步到达；并用可测量的方式把普通文档页的阻塞样式表数量往下压。目标是把 suite 页从"整个组件库进 head"拉回普通文档页的量级，直接改善老板每天打开的画廊页。

## Background（已确认的事实）

- suite 页由 MDC 短代码展开：`content/docs/dev/components/pro-suite.en.mdc:20` `::DocsComponentsGallery{suite="pro"}`，`:27` `::DocsSuiteCatalog{suite="pro"}`；组件经 Nuxt 组件注册表解析，页面无显式 import。
- `app/components/docs/DocsComponentsGallery.vue`：3,829 行单文件；`:45` `defineProps<{ suite }>`；`:815` 起按 `props.suite === 'base'` 等分支渲染网格；每格形如 `:816-838`：`<section class="docs-gallery__cell">` + `NuxtLink` 标签 + `<ClientOnly>` 包裹 specimen，`#fallback` 为 `.docs-gallery__ph` 占位。模板引用 162 个不同 `<Tx*>` 组件；`:4-37` 静态 import charts 家族、`#components` 的空态家族、`selection-actions`；`:3` 引入 `./DocsComponentsGallery.css`。
- 静态 import 使全部组件 chunk 与各自 `style.css`（tuffex on-demand style plugin 注入，`packages/tuffex/packages/script/build/on-demand-style-plugin.ts:7-8`）进入 SSR 模块图，Nuxt 据此输出 head 提示：`dist/en/docs/dev/components/pro-suite.html` 154 个 `<link rel="stylesheet">`（原始 927 KB）+ 225 个 modulepreload（原始 2.4 MB）；普通页 `button.html` 为 28 + 53。线上 ego 实测 pro-suite FCP 6.0 s、load 7.6 s、≥250 请求；button 页 FCP 3.7 s。证据：`../09-23-nexus-docs-perf-cms-remediation/research/audit-2026-09-23.md` §4–§5。
- 预渲染 HTML 中 `rel="prefetch"` 为 0：动态 import 不会被写进 head，所以"specimen 走动态 import"能真正把资源移出首屏。
- 其他会话正在同一文件上工作：`09-23-nexus-pro-gallery-polish`（in_progress）与 `09-23-nexus-base-gallery-sidebar`（in_progress）；工作树里 `DocsComponentsGallery.vue/.css` 有未提交改动，新增未跟踪的 `app/components/docs/DocsGallerySpecimen.vue`（ClientOnly + 重播按钮，`generation` 计数 key）。
- 门禁与量尺：`build/check-worker-bundle.mjs:1180` `checkHtmlInitialAssetBudgets`（docs 家族预算 js 16 个 / 620 KiB / css 7 个，基线已有违规，见证据 §6）；`nuxt.config.ts:514` `experimentalMinChunkSize: 4096`（注释记录 1157→952 chunk、61→50 preload）；`app/pages/docs/docs-page-performance.test.ts` 钉住 docs 首屏边界。
- 不可行的捷径：tuffex 全量样式 `dist/es/components.css` 610 KB，比按需还大；`features.inlineStyles` 已试过并回退（`nexus-docs-static-delivery.md` "Chunk floor" 节）。

## Requirements

- R1 suite 页首屏资源：五个 suite 页的预渲染 HTML `<link rel="stylesheet">` ≤ 35、`modulepreload` ≤ 60。
- R2 SSR 仍输出每格外壳：标签文案、指向组件文档的 `NuxtLink`、占位块在服务器渲染，保证抓取与布局稳定；specimen 体来自客户端异步 suite 模块。
- R3 specimen 行为不变：重播按钮、格内状态、其他画廊任务已落地的整改原样保留；本任务只搬运不改造。
- R4 普通 docs 页样式表实验：以 button 页与 `checkHtmlInitialAssetBudgets` 为量尺，尝试提高 `experimentalMinChunkSize` 与/或为 docs 页公共 Tx 原语增加 manual chunk；landing / public 家族不回退才保留。
- R5（可选）记录 `payloadExtraction` 对 button 页 HTML 体积与请求数的影响，只测量不默认开启。

## Acceptance Criteria

- [ ] `pnpm -C apps/nexus run build` 后，五个 suite 页 HTML 的 stylesheet ≤ 35、modulepreload ≤ 60；button 页不高于基线 28 / 53。
- [ ] ego 实测（禁缓存）：pro-suite 页 hydration 后 `.docs-gallery__cell` = 27 且每格 specimen 可见；重播按钮可用；控制台无 hydration 警告与错误。
- [ ] `docs-page-performance.test.ts`、画廊相关测试、`check:demo-registry`、`node build/check-worker-bundle.mjs` 不新增 findings；typecheck 与所在文件 eslint 通过。
- [ ] R4 有一份测量记录（改前/改后每家族 CSS/JS 计数），无论是否保留改动。
- [ ] `.trellis/spec/frontend/nexus-docs-static-delivery.md` 增加"suite 画廊体是客户端异步模块"的规则。

## Out of Scope

- specimen 本身的视觉与交互整改（属画廊整改任务）。
- tuffex 样式打包方式的改动（on-demand plugin 行为不变）。
- 组件文档页里 demo 的加载链（"Demo chain" 已有约定）。

## Dependencies / Order

- 必须在 `09-23-nexus-pro-gallery-polish` 与 `09-23-nexus-base-gallery-sidebar` 提交后开始，避免与同一文件的进行中改动冲突。
