# Nexus Pro 画廊 specimen 整改 + 格子 reset 按钮

## Goal

`/docs/dev/components/pro-suite` 的预览网格（`apps/nexus/app/components/docs/DocsComponentsGallery.vue`，`suite="pro"`）里有一批 specimen 渲染错误、不能展示组件能力或展示方式不优雅。老板在暗色主题下逐格审阅后给出了清单（2026-09-23，截图 #1–#11）。目标是让每一格都能正确、优雅地展示对应组件，并提供一个统一的"重播"入口来观看动画。

## Requirements

### 全局

- R0 每个画廊格子在鼠标进入（及键盘 focus-within）时，右上角出现一个 reset 按钮；点击后重新挂载该格 specimen，状态复位、入场动画重播。按钮可键盘操作、有 aria-label，中英文案同步。

### 渲染错误（bug）

- R1 GlowText：安装命令卡片的扫光把整块卡片洗成浅灰、高光带反而是暗的。扫光应是一条掠过卡片的柔和高光。
- R2 CodeEditor：编辑器中间出现灰色径向光斑，底边被截断。
- R3 MarkdownEditor：工具栏图标全是灰方块，底部有一条怪异光带。改为"点击按钮 → Dialog 内展示编辑器"（老板指示：不好展示的就做成点击按钮弹 dialog）。
- R4 FlipOverlay：老板标注"这个问题严重"，需在浏览器复现后定位修复。
- R5 Fusion：格子里什么都看不到。
- R6 GlassSurface：看不出玻璃效果、偏离中心；格子里漂着一个不属于它的 "Markdown source" tooltip。
- R7 GradientBorder：边框/光晕被裁切。

### 展示改进

- R8 VirtualList：列表窄、贴左、滚动条远离列表；需居中、展示得更优雅。
- R9 CornerOverlay：只展示了一个，补上变体（不同 placement / 叠层内容）。
- R10 EdgeFadeMask：加上类似 marquee 的自动滚动，让渐隐边缘在动态内容上可见。

### 重新设计

- R11 GradualBlur、KeyframeStrokeText、Liquid、OutlineBorder、Stagger、TextTransformer、Transition、TuffLogoStroke 这几格重新设计，使每格一眼能看出组件在做什么（动画类配合 R0 重播）。

## Constraints

- 只改 Pro 画廊及其直接暴露的组件缺陷；组件本身有 bug 时修在 tuffex 源码里（nexus 通过 `packages/tuffex/dist` 解析，需重建 dist 才能在 dev 里看到）。
- 改动 tuffex 组件时按 `tuffex-docs-sync` 同步其 Nexus 文档。
- 新文案中英同步；遵循 TuffEx 设计规则（token 颜色、光源方向、间距）。
- 共享工作树里有其他会话的未提交改动，只动本任务相关文件；不 commit，除非老板要求。

## Acceptance Criteria

- [x] R0–R11 每一项都在真实浏览器（ego）里、暗色主题下的 pro-suite 页看过并截图确认；亮色主题抽查无回归。
- [x] 画廊页无新增控制台报错（剩余的正文 hydration 警告在未改动的 ai-suite 页同样存在，属既有问题）。
- [x] 改动文件通过所在包的 eslint；nexus `check-*` 门禁通过；动了 tuffex 组件则其单测通过。
- [x] `git diff --check` 通过。

## Notes

- 截图来源：老板在对话中贴出的 #1–#11。
- 2026-09-24 老板决定：MarkdownEditor 工具栏改用 carbon 图标（Nexus 保持不依赖 `ri`）。
- R2 的灰色径向光斑、R3 的底部光带由并行会话修复（`TuffexDocsHeroBackground.vue` 的 `:global(.dark)` 泄漏），本任务未改该文件。
- 2026-09-24 追加（老板截图 #12）：base 套件 StatusBadge 的状态图标偏小。根因是 `TxStatusBadge` 的 `__glyph` 把 0.62 的比例乘了两次（18px 圆片里只有 6.9px 的字形），修为宽高 `1em`（圆片的 62%，11.16px）。
