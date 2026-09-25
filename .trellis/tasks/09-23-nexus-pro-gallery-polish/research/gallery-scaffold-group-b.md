# Research: Pro 画廊脚手架（B 组共用上下文）

- **Query**: B 组 specimen 重做需要的画廊结构、舞台尺寸、可复用 class、样式文件位置、reset 重挂载语义
- **Scope**: internal（源码 + ego 真实浏览器实测：TaskSpace 5，`http://localhost:3200/en/docs/dev/components/pro-suite`，暗色，viewport 1816×1243，DPR 2）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue` | 画廊 SFC。pro 带锚点 `<div v-if="props.suite === 'pro'" class="docs-gallery__grid">`（研究时第 2610 行） |
| `apps/nexus/app/components/docs/DocsComponentsGallery.css` | 画廊全部样式。SFC 第 3 行 `import './DocsComponentsGallery.css'`；非 scoped，选择器都挂在 `.docs-gallery` 命名空间下（文件头 1-12 行注释说明原因） |
| `apps/nexus/app/components/docs/DocsGallerySpecimen.vue` | 主会话新建（未提交）的 reset 包装：`<ClientOnly><Specimen :key="generation"><slot /></Specimen><button class="docs-gallery__replay">…`；画廊第 41 行 `import ClientOnly from './DocsGallerySpecimen.vue'`，所有 `<ClientOnly>` 都换成了它 |
| `apps/nexus/test/guards/sfc-size-budget.test.ts` | SFC 体积门禁：超过 3000 行不得有内联 `<style>`（`INLINE_STYLE_LINE_LIMIT`），硬上限 `LINE_CEILING = 4500` 行 |
| `apps/nexus/app/pages/docs/[...slug].vue:2256-2268` | `--docs-accent / --docs-muted / --docs-border / --docs-inline-code-bg …` 令牌定义 |
| `packages/tuffex/packages/components/style/variables.scss:391-545` | tuffex 暗色令牌 |

### 舞台几何（实测）

- 每格 `section.docs-gallery__cell` 为 419×237；`.docs-gallery__stage`（CSS 114-120）`padding: 56px 28px 40px; min-height: 236px`，flex 居中 → **内容盒 362×140**。内容更高时舞台变高，同一行的另一格也被一起拉高（grid 行等高）。
- 标签 `a.docs-gallery__label` 绝对定位 top 16 / left 20；主会话的 replay 按钮 `.docs-gallery__replay`（CSS 589 起）top 11 / right 12，hover / focus-within 时显示。
- 暗色页底 = `rgb(18,18,18)`（`.docs-layout-root` 的 dark bg）。tuffex 暗色：`--tx-bg-color #141414`、`--tx-fill-color #303030`、`--tx-fill-color-lighter #1d1d1d`、`--tx-text-color-primary #e5eaf3`、`--tx-color-primary #409eff`、`--tx-border-color #4c4d4f`。亮色页底为白色。
- `--docs-gallery-bg` 在仓库里没有任何定义，CSS 中的 `var(--docs-gallery-bg, var(--tx-bg-color))` 实际落到 `--tx-bg-color`。
- pro 带两列，行配对（同行等高）：BorderBeam|CodeEditor、GradualBlur|KeyframeStrokeText、Liquid|OutlineBorder、Stagger|TextTransformer、Transition|TuffLogoStroke。

### 可复用的 helper class（DocsComponentsGallery.css，研究时行号）

| class | 行 | 作用 |
|---|---|---|
| `.docs-gallery__stack` / `--center` | 122 / 129 | 纵向堆叠 gap 10 / 居中 gap 14 |
| `.docs-gallery__row` / `--loose` | 136 / 144 | 横排居中、可换行，gap 12 / 22 |
| `.docs-gallery__tile` | 156 | 中性小块：flex 居中、min-height 34、padding 6 10、radius 8、1px `--docs-gallery-line` 边、`--docs-inline-code-bg` 底、12px muted |
| `.docs-gallery__overlay-body` | 293 | min-height 84 |
| `.docs-gallery__code` | 302-306 | `height: 128px; overflow: hidden; border-radius: 10px`（CodeEditor 与 MarkdownEditor 共用） |
| `.docs-gallery__muted` | 350 | 12px muted 说明文字 |
| `.docs-gallery__block` / `--wide` | 371 / 393 | 宽 `min(320px,100%)` / `min(360px,100%)`，`text-align: center`，直接子元素重置 |
| `.docs-gallery__meter` / `__meter-text` | 491 / 498 | 纵向居中 gap 8 + 12px muted 说明——现成的「specimen + 说明文字」组合（目前只有 SignalMeter 在用） |
| `.docs-gallery__ph` | 503 | ClientOnly fallback 闪烁块 |

令牌：`--docs-gallery-line`（`--docs-border` 72%）、`--docs-muted`、`--docs-accent`、`--docs-inline-code-bg`、`--docs-inline-code-border`。

### R0 重挂载语义（决定每格 reset 能否重播）

- `DocsGallerySpecimen` 用 `:key="generation"` 重建 slot 子树：新 DOM 节点 → CSS keyframe 从头播放；新的 `<Transition>` / `<TransitionGroup>` 实例 → `appear` 再执行一次。
- 浏览器实测（程序点击各格 `.docs-gallery__replay`）：Stagger 子元素 opacity 依次 0→1；KeyframeStrokeText `stroke-dashoffset` 102→0；TuffLogoStroke outline / ring / core / fill 按时序重画。
- 画廊 `<script setup>` 里的 ref（`switchOn`、`fusionOpen`，以及以后新增的 `liquidOpen` 等）**不会**被 key 重置（包装组件的注释也写明了）。因此状态驱动的动画（Liquid 展开、TextTransformer 改字、Transition 切换）在 reset 后只会显示当前状态，不会自己播放。
- 自动循环的现成先例：ProgressBar 的 `setInterval`（研究时 267-302 行，`PROGRESS_STEPS` / `progressCycle`；`prefers-reduced-motion: reduce` 时不启动定时器，`onBeforeUnmount` 里清理）。

### 共享状态陷阱

- `const switchOn = ref(true)`（240 行）同时驱动 TextTransformer 格（`:text="switchOn ? copy.online : copy.failed"` + `<TuffSwitch v-model="switchOn" />`）和 Transition 格（`v-if="switchOn"` + 同一个 switch）。实测：在 TextTransformer 格拨一次开关，Transition 格的 tile 同时消失，其 stack 高度从 72px 变成 38px。

### 其它约束

- 画廊行数：开始研究时 3825 行，结束时 3917 行（主会话在并行编辑），门禁上限 4500 行。
- UnoCSS（`apps/nexus/uno.config.ts:17-26`）的 pipeline 扫描整个 `.vue` 文件（含 script），写在 script 数组里的 `i-carbon-*` 图标类能被提取。
- 文案都在 `copy` computed 的 zh / en 两个分支里，新增的 specimen 文案两边都要加。

## Caveats / Not Found

- 画廊行号取自 2026-09-23 约 23:00 的工作树；文件正被主会话编辑，行号还会漂移，请按文中锚点重新 grep。
- 截图证据（临时目录）：`/tmp/pro-gallery-research/*.png`。
