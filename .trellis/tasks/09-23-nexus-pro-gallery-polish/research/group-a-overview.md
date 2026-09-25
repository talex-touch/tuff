# Research: Pro 画廊 A 组 specimen 总览（VirtualList / CornerOverlay / EdgeFadeMask / Fusion / GlassSurface / GradualBlur / GradientBorder / FlipOverlay / MarkdownEditor）

- **Query**: 逐个组件查清 API、渲染/动画前提、Nexus 现有 demo、当前画廊格子为何失败，并给出适配 ~380×170 舞台（暗色为主、亮色不坏）的紧凑 specimen 方案；另记录画廊自身可复用的 helper class 与样式位置。
- **Scope**: internal（代码 + live dev server 取证：`[::1]:3200`）+ 少量 external（MDN / Chromium 源码）
- **Date**: 2026-09-23

分文件：

| 文件 | 内容 |
|---|---|
| `research/flip-overlay.md` | FlipOverlay "问题严重" 的根因（containment + 未 Teleport）与方案 |
| `research/markdown-editor.md` | 灰方块图标、底部径向光带、游离的 "Markdown source" tooltip、Modal 方案 |
| `research/fusion.md` | Fusion 格子全空的定量根因（goo 阈值）与方案 |
| `research/list-and-mask-specimens.md` | VirtualList / EdgeFadeMask / CornerOverlay |
| `research/surface-effects-specimens.md` | GlassSurface / GradientBorder / GradualBlur |

> 注意：研究期间工作区有并行会话在改 `DocsComponentsGallery.{vue,css}`、新建 `DocsGallerySpecimen.vue`、改 `TxFlipOverlay.vue`（已加 Teleport）、`TuffexDocsHeroBackground.vue`（已修选择器泄漏）、`TxGlowText.vue`。下文画廊行号为研究时刻的快照，会漂移；请以 `docPath('<slug>')` 锚点重新定位。

---

## 0. 结论速览

| 组件 | 关键 props（默认值） | 当前格子失败的根因 | 方案要点 | remount 是否重播 |
|---|---|---|---|---|
| VirtualList | `items`、`itemHeight`(必填)、`height`(320)、`overscan`(4)、`itemKey`；emit `scroll{scrollTop,startIndex,endIndex}`；expose `scrollToIndex/Top/Bottom` | `.tx-virtual-list__item` 是 `display:flex`，slot 根 `.docs-gallery__scroll-row` 不伸展 → 行宽=内容宽贴左；滚动容器占满 320px block，滚动条在最右；无边框 | 带 ring 的 `docs-gallery__doc` 框 + 标题条显示 "9 / 10,000 rows in DOM"；行加 `flex:1`；index/名称/meta 三列；细滚动条 | 滚动位置复位；可加 mount 后平滑滚动作入场 |
| CornerOverlay | `placement`('bottom-right')、`offsetX/offsetY`(0，数字→px)、`overlayPointerEvents`('none')；slots default/overlay | 只有一个头像+默认灰色 badge；base 组 AvatarVariants 已经演示过右下角圆点 | 一行四个 figure：四个 placement × 四种叠层内容（NEW 标签 / 计数 badge / 勾选 / 在线点）+ placement 名称注脚；叠层 pop-in 错峰动画 | 用画廊 CSS keyframes 时会重播 |
| EdgeFadeMask | `axis`('vertical')、`size`(24)、`threshold`(1)、`disabled`、`observeResize`(true)、`as` | 静态一行编号方块，仅溢出 ~50px，scrollLeft=0 时只有右侧渐隐 | 用 rAF 驱动**组件自己的 viewport `scrollLeft`**（组件按滚动位置算 mask），双份 chip 轨道无缝循环；hover 暂停；reduced-motion 静态居中 | 用函数 ref 驱动则重播（左侧渐隐"出现"） |
| Fusion | `trigger`('hover')、`gap`(40)、`duration`(260)、`blur`(19)、`alpha`(29)、`alphaOffset`(-10)、`direction`('x')；slots a/b | goo 滤镜阈值：`α' = 29·blur(α) − 10`，需 blur 后 α ≥ 0.345；32px 半透明 TxButton 在 σ=19 下峰值 α≈0.30 → 全部被抹掉（静止与激活都不可见） | 两个实心色块（64px + 40px），`:blur="10" :alpha="18" :alpha-offset="-7"`，`gap` 72；自动循环或 hover；不放文字/图标（滤镜会糊掉） | 取决于驱动方式 |
| GlassSurface | `width/height`('200px')、`borderRadius`(20)、`backgroundOpacity`(0)、`blur`(11)、`distortionScale`(-180)… | 背后没有任何内容 → 位移滤镜无可折射；SVG 模式下背景完全透明；根 `display:flex` 块级 200px 在 `docs-gallery__block` 里靠左（偏 60px）；200px 高撑高整行 | 自带彩色"场景"（token 色条缓慢漂移 + 文字）铺底，玻璃 200×88 用 grid 居中压在其上 | CSS 漂移动画会重播 |
| GradientBorder | `borderWidth`('2px')、`borderRadius`('12px')、`padding`('12px')、`animationDuration`(4)、`as` | **组件自身**：根 `overflow:hidden` 裁掉 `::before` 模糊的外半圈；`border-image` 不受 `border-radius` 影响（画成直角框），被圆角裁切后四角各缺 ~9px | 先修 tuffex 组件（圆角环 + 不被裁的光晕）；specimen 用内嵌实心卡片（半径 = 外半径 − 边宽） | 旋转动画从 0deg 重新开始 |
| GradualBlur | `position`('bottom')、`strength`(2)、`height`('6rem')、`divCount`(5)、`exponential`、`curve`('linear')、`zIndex`(1000)、`target`('parent')、`animated`… | 模糊层在 88px 舞台底部 40%，而方块只占顶部 34px → 模糊的是空白 | 带 ring 的 140px 卡片内放彩色图片墙（`tileImage()`）+ 文字，缓慢上下滚动经过底部模糊；`:z-index="1"` | CSS 滚动动画会重播 |
| FlipOverlay | `modelValue`、`source`、`duration`(480)、`cardStyle`、`headerTitle/Desc`、`globalMask`(true)… | HEAD 版不 Teleport；Nexus `.docs-prose { content-visibility: auto }` 使其成为 fixed 后代的 containing block + stacking context → mask 只盖文章盒、卡片居中于整篇文章、FLIP 视口坐标错位、focus 跳滚 ~870px、header/侧栏在遮罩之上 | 组件加 `<Teleport to="body">`（工作区已在改）；specimen 给 `cardStyle` 定宽；teleport 后内容别用 `--docs-*` 变量 | 每次打开都播放翻转；reset 无关 |
| MarkdownEditor | `modelValue`、`defaultMode`('wysiwyg')、`toolbar`(true)、`toolbarActions`、`minHeight`(220)、`maxHeight`、`theme`('auto')… | 图标：`i-ri-*` 在 Nexus 无 iconify 集合、dist 不被 Uno 扫描 → preflight 1.2em 盒 + TxIcon `background-color: currentColor` = 灰方块；光带：HEAD 版 hero 背景样式编译成全局 `[data-theme='dark']` 规则，把编辑器根背景换成白色径向渐变，128px 裁切只露出 12px 透明正文条；tooltip = 模式按钮原生 `title` | 按钮 → `TxModal`（teleport）内放编辑器，宽 ≥560px 让工具栏单行；Nexus 需装 `@iconify-json/ri` 并 safelist 14 个类 | 不涉及 |

---

## 1. 画廊现状约定（可复用）

### 1.1 文件与样式位置

| 路径 | 说明 |
|---|---|
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue` | 画廊 SFC（研究时 ~3922 行，持续增长）。`suite === 'pro'` 带从 ~2615 行起。**没有 `<style>` 块** |
| `apps/nexus/app/components/docs/DocsComponentsGallery.css` | 画廊全部样式，`<script setup>` 顶部 `import './DocsComponentsGallery.css'`（第 3 行）。**不 scoped**，所有选择器挂在 `.docs-gallery__*` 命名空间下；可以直接写组件公开类名（如 `.tx-edge-fade-mask__viewport`） |
| `apps/nexus/test/guards/sfc-size-budget.test.ts` | SFC >3000 行禁止内联 `<style>`；硬上限 `LINE_CEILING = 4500` 行 → 画廊剩 ~580 行余量。大段逻辑宜拆子组件 |
| `apps/nexus/app/components/docs/DocsGallerySpecimen.vue` | **新（未提交）**：画廊把它 `import ClientOnly from './DocsGallerySpecimen.vue'`，每个格子的 `<ClientOnly>` 都是它：内部 Nuxt `ClientOnly` + 以 `generation` 为 key 的函数式 `Specimen` 包 slot + `.docs-gallery__replay` 按钮（`i-carbon-renew`，`t('docs.demo.reset')`） |

### 1.2 舞台几何

- `.docs-gallery__grid` 两列；`.docs-gallery__cell { position: relative }`，标签绝对定位在左上（top 16 / left 20，z-index 1），replay 按钮在右上（top 11 / right 12，28×28，z-index 2，hover/focus-within 显示）。
- `.docs-gallery__stage { display:flex; align-items/justify-content:center; min-height:236px; padding:56px 28px 40px }` → 内容盒最小 **~364×140**（1816px 视口）。specimen 高于 140px 会把整行两格一起撑高。
- `.docs-gallery__block { width: min(320px,100%); text-align:center }`，`> * { text-align: initial }`：**只居中行内级子元素**；块级子元素（如 TxGlassSurface 的 `display:flex` 根、TxVirtualList）贴左。`--wide` = 360px。

### 1.3 可复用 helper class（`DocsComponentsGallery.css`）

| class | 用途 |
|---|---|
| `docs-gallery__stack` / `--center` | 纵向 flex，gap 10 / 居中 gap 14 |
| `docs-gallery__row` / `--loose` | 横向居中换行 flex，gap 12 / 22 |
| `docs-gallery__tile` / `--fill` | 中性填充块（min-height 34，1px `--docs-gallery-line` 边，`--docs-inline-code-bg`） |
| `docs-gallery__framed` | overflow hidden + 12px 圆角 + 1px 边（NavBar/TabBar 用） |
| `docs-gallery__doc` / `__doc-bar` | **新**：文件框（12px 圆角、`box-shadow: inset 0 0 0 1px` ring、`--docs-inline-code-bg`）+ 11px 等宽标题条（MarkdownView 用）。适合 VirtualList/GradualBlur 的外框 |
| `docs-gallery__muted` | 12px、`--docs-muted` |
| `docs-gallery__dot` | 10px 圆点 + 2px 页面色 ring（AvatarVariants 状态点） |
| `docs-gallery__scroll-row` | 7×10 padding、12px、下边线（Scroll/Sortable/VirtualList 共用） |
| `docs-gallery__fade-row` | `display:flex; gap:8px`（EdgeFadeMask/GradualBlur 共用） |
| `docs-gallery__blur-stage` | relative + overflow hidden + 88px（GradualBlur） |
| `docs-gallery__code` | 128px + overflow hidden + 10px 圆角（CodeEditor/MarkdownEditor/…） |
| `docs-gallery__overlay-body` | min-height 84 |
| `docs-gallery__flip-body` | margin 0、padding 20、max-width 260 |
| `docs-gallery__desktop` / `-window.is-back/.is-front` | AgentScreen 用的彩色渐变"桌面"+白色窗口，可作玻璃类 specimen 的背景 |
| `docs-gallery__ph` | ClientOnly fallback 骨架条（有 reduced-motion） |
| `docs-gallery__reset` | Alert 格子的复位按钮（旧） |
| `docs-gallery__replay` / `-icon` | **新**：每格的重播按钮 |

CSS 变量：`--docs-gallery-line`（在 `.docs-gallery` 上定义），`--docs-muted / --docs-accent / --docs-border / --docs-inline-code-bg / --docs-ink`（在 `pages/docs/[...slug].vue` 的 `.docs-root` 上定义）。`--docs-gallery-bg` 全仓库未定义，总是回退到 `--tx-bg-color`。

### 1.4 文案与状态

- 画廊文案是 `<script setup>` 里的 `copy` computed（zh/en 两支，~59 行起），新文案按此加；重播按钮文案走 i18n `docs.demo.reset`。
- **remount 语义**（`DocsGallerySpecimen.vue` 注释原文："State the gallery holds for the cell (a switch's model, an open flag) is the gallery's and survives"）：只有 slot 子树卸载重建。画廊级 `ref`、`onMounted` 里的定时器（如 ProgressBar 的 `progressTimer`）**不会**重置/重启。想让 JS 驱动的动画随 reset 重播，需绑定到被重建的元素上：函数 ref（`:ref="fn"`，卸载时回调 `null`、重建时拿到新元素）或独立子组件的 `onMounted`。CSS `animation` 挂在被重建的元素上会自动重播。

---

## 2. 横切根因（影响不止一格）

1. **`.docs-prose { content-visibility: auto; contain-intrinsic-size: 1200px }`**（`apps/nexus/app/pages/docs/[...slug].vue` 的 `:deep(.docs-prose)`，a50bb6efa 2026-07-18 "perf(nexus): harden landing WebGL and docs paint path" 引入）。按 MDN：`auto` 开启 layout + style + paint containment；layout/paint containment 会建立**新的 absolute/fixed containing block** 和**新的 stacking context**。SSR 取证：`div.docs-gallery` 位于 `div.docs-prose.markdown-body…` 之内。→ 任何未 Teleport 的 `position: fixed` specimen（TxFlipOverlay HEAD 版；`TxGradualBlur target="page"`）都会相对文章盒定位。另外 `.docs-surface { isolation: isolate }` 也把 z-index 困在正文层，低于 header/侧栏（z-30）。
2. **Teleport 出去的内容拿不到 `--docs-*` 变量**（它们定义在 `.docs-root`）。`.docs-gallery__muted`、`.docs-gallery__flip-body` 等放进 TxModal/TxFlipOverlay（teleport 到 body）后 `var(--docs-muted)` 无效、颜色退化为继承色。teleport 内容用 `--tx-*` token。
3. **暗色 `--tx-fill-color-blank: transparent`**（`packages/tuffex/packages/components/style/variables.scss` `.dark` 块 ~449 行）。TxMarkdownEditor 正文、TxCodeEditor 默认主题背景都读它 → 暗色下透明，背后画什么就透出什么。
4. **HEAD 版 `TuffexDocsHeroBackground.vue` 选择器泄漏**：`:global(.dark) .x` 被 Vue 编译为裸 `.dark,[data-theme='dark']`（用 `@vue/compiler-sfc@3.5.41` 实测 HEAD 源码输出 4 条：`background: transparent; color: rgba(255,255,255,.9)` / `background: linear-gradient(135deg,…)` / `border-color: rgba(255,255,255,.2); box-shadow: 0 10px 34px rgba(255,255,255,.12)` / `background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.34), transparent 70%)`）。这些规则打到 `html.dark` 以及所有 `data-theme="dark"` 的组件根（TxMarkdownEditor 根有 `:data-theme="resolvedTheme"`）。工作区已改成 `.dark .tuffex-docs-hero-bg…` 后代选择器，编译后带 `[data-v-…]`，已验证。
5. **Nexus UnoCSS 与 tuffex 内部图标类**：presetIcons 只能解析已安装集合（apps/nexus：carbon、cib、logos、twemoji）；dev 模式 tuffex 走 `packages/tuffex/dist/es/*.js`，不在 `uno.config.ts` 的 `content.pipeline.include` 正则里（只含 `vue|svelte|[jt]sx|mdx?…` 与 `app/(data|composables|utils)/*.ts`）。preflight `[class^="i-"],[class*=" i-"]{width:1.2em;height:1.2em}` 给未知图标撑盒。live `/_nuxt/__uno_icons.css`：`i-ri-*` 0 条，`i-carbon-renew` 存在。
6. **块级组件在 `docs-gallery__block` 里不居中**（见 1.2）——GlassSurface 偏左的原因，VirtualList 滚动条远离内容的一半原因。

---

## 3. Caveats / Not Found

- 未用浏览器实测（本机规定浏览器走 ego，且一个用户目标只建一个 TaskSpace，主会话持有）。结论来自源码 + live dev server 的 CSS/HTML 取证 + 编译器实测 + 数值计算。需在 ego 里目测确认的点已在各分文件标出。
- tuffex 组件改动需重建 dist 才能在 Nexus dev 看到（`packages/tuffex/dist` 研究时构建于 2026-09-23 18:07，晚于 A 组所有组件源文件的最后修改）。
