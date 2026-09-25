# Research: GlassSurface / GradientBorder / GradualBlur 三格（R6 / R7 / R11）

- **Query**: GlassSurface 是一块偏离中心的暗色方块、看不到玻璃；GradientBorder 渐变边/光晕在边缘被裁；GradualBlur 需要重新设计成一眼可见。查 API、前提、demo、失败原因，给紧凑方案。
- **Scope**: internal
- **Date**: 2026-09-23

---

## A. GlassSurface

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/glass-surface/src/TxGlassSurface.vue` | 组件（321 行，样式**不 scoped**） |
| `packages/tuffex/packages/components/src/glass-surface/index.ts` | `GlassSurfaceProps` 定义在这里（无 types.ts） |
| `apps/nexus/app/components/content/demos/GlassSurfaceGlassSurfaceDemo.vue` | 基础 demo |
| `apps/nexus/app/components/content/demos/GlassSurfaceGlassSurface2Demo.vue` | 全参数 playground |
| `packages/tuffex/packages/components/style/variables.scss` | `--tx-surface-refraction-mask-rgb`：亮 `255 255 255`、暗 `0 0 0` |

### API（默认值见 TxGlassSurface.vue:10–28）

| Prop | Type | Default |
|---|---|---|
| `width` / `height` | `string \| number` | `'200px'` / `'200px'` |
| `borderRadius` | `number`(px) | `20` |
| `borderWidth` | `number`（比例，映射边缘折射带 = min(w,h)·borderWidth·0.5） | `0.07` |
| `brightness` | `number`(%) | `70` |
| `opacity` | `number` | `0.93` |
| `blur` | `number`(px) | `11` |
| `displace` | `number`（最终 `feGaussianBlur` stdDeviation） | `0.5` |
| `backgroundOpacity` | `number` | `0` |
| `saturation` | `number` | `1` |
| `distortionScale` | `number` | `-180` |
| `redOffset` / `greenOffset` / `blueOffset` | `number` | `0` / `10` / `20` |
| `xChannel` / `yChannel` | `'R' \| 'G' \| 'B'` | `'R'` / `'G'` |
| `mixBlendMode` | CSS blend mode 字符串 | `'difference'` |

- **Slots**：`default`（放进 `.tx-glass-surface__content`：100% 宽高、flex 居中、`z-index:1`）。**Emits / Expose**：无。
- **三种渲染路径**（`containerStyles`，134–169 行）：
  1. Chromium（非 Safari/Firefox 且 `CSS.supports('backdrop-filter','url(#id)')`）：`background: rgb(var(--tx-surface-refraction-mask-rgb) / backgroundOpacity)` + `backdrop-filter: url(#filter) saturate(saturation)`。滤镜 = `feImage`（运行时生成的 SVG 位移图：红/蓝渐变 + 模糊的内矩形）→ R/G/B 三次 `feDisplacementMap`（scale = distortionScale + 各通道 offset，产生色散）→ `screen` 合成 → `feGaussianBlur(displace)`。滤镜区域 = 元素自身盒（x/y 0，100%）。
  2. 支持 backdrop-filter 但不支持 SVG 路径：`rgb(mask / .22)` + `blur(blur) saturate(1.8) brightness(1.06)` + 1px `rgb(mask / .24)` 边。
  3. 都不支持：`rgb(mask / .4)` + 1px 边。
- ResizeObserver 变化时重算位移图；无动画。
- **前提**：背后必须有高对比、有细节的内容（色块边缘、文字、网格线）才能看出折射；自身尺寸默认 200×200；根 `.tx-glass-surface { position:relative; display:flex; overflow:hidden }` 是**块级**。

### Nexus demos

- Basic：min-height 280 的舞台，背景 = 两个彩色径向光斑 + 暖冷线性渐变 + 44px 网格线（`::before`）+ 左上文案（"Glass Journal"、24px 标题、说明）+ 右下 4 个彩色方块；玻璃 `360×160`、`border-radius 20`、`background-opacity .08` 居中压在上面，里面一行粗体 "GlassSurface"。
- Playground：可滚动的"杂志"文章（渐变卡片、等宽标签）作为背景，玻璃绝对居中（`pointer-events:none`），下方一组 TxSlider/选择器调所有参数。

### 当前格子（研究时 ~2861–2879 行，锚点 `docPath('glass-surface')`）

```vue
<div class="docs-gallery__block">
  <TxGlassSurface>
    <div class="docs-gallery__tile docs-gallery__overlay-body">
      {{ copy.aboutTitle }}
    </div>
  </TxGlassSurface>
</div>
```

失败原因：
1. 背后什么都没有（格子背景是平的）→ 位移/色散作用在均匀背景上等于无变化；SVG 路径下 `backgroundOpacity=0` → 玻璃本身完全透明、无边 → 玻璃"不存在"。
2. 唯一可见物是内部 `.docs-gallery__tile`（`--docs-inline-code-bg` 暗色填充、min-height 84、按内容宽）→ "一块暗色方块"。
3. 偏离中心：根是块级 flex、固定 200px 宽，`docs-gallery__block` 的 `text-align:center` 管不到块级子元素 → 贴 320px block 左缘，比中心偏左 60px。
4. 200px 高超过 ~140px 的舞台内容盒 → 该格（及同行邻格）被撑到 ~296px。
5. （R6 提到的 "Markdown source" tooltip 与本组件无关，见 `markdown-editor.md` §3。）

### 方案：自带彩色"场景"，玻璃居中压在上面

```vue
<div class="docs-gallery__block docs-gallery__glass-stage">
  <div class="docs-gallery__glass-scene" aria-hidden="true">
    <span v-for="n in 5" :key="n" class="docs-gallery__glass-bar" />
  </div>
  <TxGlassSurface :width="200" :height="88" :border-radius="18" :background-opacity="0.06">
    <span class="docs-gallery__glass-label">GlassSurface</span>
  </TxGlassSurface>
</div>
```

- `.docs-gallery__glass-stage { position: relative; display: grid; place-items: center; height: 140px; border-radius: 14px; overflow: hidden }` + inset ring（`box-shadow: inset 0 0 0 1px var(--docs-gallery-line)`，或放在 `::after` 叠在最上）。`place-items:center` 解决块级根不居中。
- `.docs-gallery__glass-scene { position: absolute; inset: -20%; display: flex; gap: 14px; transform: rotate(-12deg); animation: <drift> 10s linear infinite }`，五根色条用 token：`--tx-color-primary / -success / -warning / -danger / -info`（可 `color-mix` 调饱和度）；也可叠一行 12px 文字，让折射扭曲文字更直观。场景在 DOM 中位于玻璃之前，二者都是定位元素、z-index auto → 玻璃按树序画在上面。
- 备选背景：画廊已有 AgentScreen 用的 `.docs-gallery__desktop`（`linear-gradient(145deg, #ff8a7a, #c86cf0, #4f7df3)` + 两个白色窗口），可直接复用（字面色值，非 token）。
- 标签 `--tx-text-color-primary`、13–14px、600；暗色下 mask rgb 是 `0 0 0`（`backgroundOpacity .06` 为轻微压暗），亮色为白色轻雾。
- reduced-motion：场景 `animation: none`（静态仍能看出折射）。reset：漂移动画随 remount 从头开始；组件每次挂载生成新的随机 filter id 与位移图。
- 尺寸：140px 高，玻璃 200×88 居中，四周留出色条可见的边缘带（折射集中在边缘带）。

---

## B. GradientBorder

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/gradient-border/src/TxGradientBorder.vue` | 组件（95 行，scoped） |
| `packages/tuffex/packages/components/src/gradient-border/index.ts` | `GradientBorderProps` |
| `packages/tuffex/packages/components/src/gradient-border/__tests__/gradient-border.test.ts` | 根标签、单位归一、时长 |
| `apps/nexus/app/components/content/demos/GradientBorderGradientBorderDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/gradient-border.{en,zh}.mdc` | 文档页（Interaction Contract 写明 "The wrapper uses `overflow: hidden`, so child focus rings or shadows can be clipped"） |

### API

| Prop | Type | Default |
|---|---|---|
| `as` | `string` | `'div'` |
| `borderWidth` | `string \| number` | `'2px'`（数字→px；同时是 blur 半径） |
| `borderRadius` | `string \| number` | `'12px'` |
| `padding` | `string \| number` | `'12px'`（作用于 `.tx-gradient-border__inner`） |
| `animationDuration` | `number`(s) | `4` |

- **Slots**：`default`。**Emits / Expose**：无。
- **CSS 变量**：`--tx-gradient-border-width`、`--tx-gradient-border-radius`、`--tx-gradient-inner-padding`、`--tx-gradient-duration`；内部 `@property --tx-gradient-angle`（`<angle>`，不继承）。
- 渲染（47–88 行）：根 `position:relative; display:block; border-radius; overflow:hidden`；`::before { position:absolute; inset:0; opacity:.85; filter: blur(var(--w)); border: var(--w) solid; border-image-source: linear-gradient(var(--tx-gradient-angle), #0894ff 0%, #c959dd 34%, #ff2e54 68%, #ff9004 100%); border-image-slice: 1; border-radius: … }`，`@keyframes` 把 `--tx-gradient-angle` 0→360deg，`linear infinite`；reduced-motion 停转。内容层 `__inner` 无背景。

### 当前格子（研究时 ~2881–2897 行，锚点 `docPath('gradient-border')`）

```vue
<div class="docs-gallery__block">
  <TxGradientBorder :padding="14" border-radius="14px">
    <strong>{{ copy.aboutTitle }}</strong>
  </TxGradientBorder>
</div>
```

### 根因：裁切来自组件本身

1. **外半圈光晕被自己裁掉**：`::before` 贴着根的边（`inset:0`）画 2px 边并 `blur(2px)`（σ=2，扩散约 ±6px），根 `overflow:hidden` 把边外那一半全部裁掉 → 线的外侧是硬边，"光晕"只剩向内的一半。
2. **四个圆角处断线**：CSS Backgrounds 3 的圆角裁切只作用于背景、不作用于 `border-image`，所以 `::before` 实际画的是**直角**渐变框；根的圆角 `overflow` 再沿曲线裁切。以 r=14、w=2 计：左边缘上，带中线（x=1）在 y < 14 − √(14² − 13²) ≈ 8.8px 处被裁，x=0 处在 y < 14 全被裁 → 每个角两侧各丢 ~7–14px，环看起来是四段直线、四角缺口。
3. 格子里没有内层实心面（文档 Best Practices 要求"Put a real surface inside the wrapper and align its radius with `borderRadius - borderWidth`"），内侧光晕直接铺在文字底下。

→ 画廊层面无法修掉 1、2，需改 tuffex 组件（PRD："组件本身有 bug 时修在 tuffex 源码里"，并按 `tuffex-docs-sync` 同步文档，文档里关于 `overflow: hidden` 的契约句会随之变化）。

可行方向（事实层面的约束）：环要跟随圆角，需用会被 `border-radius` 影响的绘制方式（如背景渐变 + `mask`/`-webkit-mask-composite` 抠出 content-box 的环、或 `background-clip` 双层背景）；光晕若要完整，模糊层不能在 `overflow:hidden` 的盒内贴边（去掉根的裁切、只裁内容，或把光晕放到不被裁的独立层）。`@property` 角度动画与 reduced-motion 分支可保留。

### Nexus demo

`GradientBorderGradientBorderDemo.vue`：`:padding="16" :border-radius="16"`，内层 `div` `background: var(--tx-bg-color); border-radius: 12px; padding: 16px` "Content"。同样受上面 1、2 影响。

### 方案（组件修复后）

```vue
<div class="docs-gallery__block">
  <TxGradientBorder :border-radius="16" :border-width="2" :padding="2" :animation-duration="6">
    <div class="docs-gallery__gb-card">
      <TxTag label="Pro" variant="soft" />
      <strong>{{ copy.gbTitle }}</strong>
      <span class="docs-gallery__muted">{{ copy.gbBody }}</span>
    </div>
  </TxGradientBorder>
</div>
```

- `.docs-gallery__gb-card { display: grid; gap: 4px; padding: 14px 16px; border-radius: 14px; background: var(--tx-bg-color) }`：内半径 14 = 外半径 16 − 间隙 2，符合 `tuffex-design-rules.md` "Nested radii must be concentric"。
- 宽 320、高 ~96px；若修复后光晕外扩，舞台 28px 侧边距足够容纳。
- 颜色：渐变是组件内写死的 4 个 hex，暗/亮色都可读；卡片与文字用 token。
- reset：remount 让角度动画从 0deg 重新开始（无入场动画）。

---

## C. GradualBlur

### Files

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue` | 组件（454 行，样式**不 scoped**） |
| `packages/tuffex/packages/components/src/gradual-blur/src/types.ts` | Props |
| `apps/nexus/app/components/content/demos/GradualBlur*.vue` | 8 个 demo（见下） |

### API（默认值 TxGradualBlur.vue:11–28，presets 62–90）

| Prop | Type | Default |
|---|---|---|
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` |
| `strength` | `number` | `2` |
| `height` | `string` | `'6rem'`（top/bottom 时为高；left/right 时作宽度回退） |
| `width` | `string` | —（top/bottom 默认 `100%`） |
| `divCount` | `number` | `5`（叠加的 backdrop-filter 层数） |
| `exponential` | `boolean` | `false`（true 时每层 blur = 2^(p·4)·0.0625·strength rem；否则 0.0625·(p·count+1)·strength rem） |
| `zIndex` | `number` | `1000`（page 目标时 +100） |
| `animated` | `boolean \| 'scroll'` | `false`（`true`：backdrop-filter/opacity 过渡；`'scroll'`：挂载后先隐藏，IntersectionObserver ≥10% 可见时淡入） |
| `duration` / `easing` | `string` | `'0.3s'` / `'ease-out'` |
| `opacity` | `number` | `1` |
| `curve` | `'linear' \| 'bezier' \| 'ease-in' \| 'ease-out' \| 'ease-in-out'` | `'linear'` |
| `responsive` + `mobile/tablet/desktopHeight`、`mobile/tablet/desktopWidth` | `boolean` / `string` | `false` / — |
| `preset` | `top\|bottom\|left\|right\|subtle\|intense\|smooth\|sharp\|header\|footer\|sidebar\|page-header\|page-footer` | — |
| `gpuOptimized` | `boolean` | — |
| `hoverIntensity` | `number` | —（设了才接收指针，hover 时 strength × 该值） |
| `target` | `'parent' \| 'page'` | `'parent'`（`page` = `position: fixed`，不 teleport） |
| `onAnimationComplete` | `() => void` | — |
| `className` / `style` | `string` / `CSSProperties` | `''` / `{}` |

- **Slots**：`default`（渲染在 `.tx-gradual-blur__slot`）。**Emits / Expose**：无。
- 渲染：容器 `position:absolute`（parent）贴在所选边，内含 `divCount` 层，每层 `backdrop-filter: blur(n rem)` + 分段 `mask-image` 线性渐变，越靠边越糊。只模糊**背后已有的内容**。
- 前提：父元素 `position: relative` + `overflow: hidden`，且模糊区域下面真的有内容（最好是高对比、会移动的内容）。

### Nexus demos

| Demo | 内容 |
|---|---|
| `GradualBlurGradualBlurDemo` | 320px 高框内可滚动 Lorem 文本，底部 `6rem / strength 2 / divCount 5 / bezier / exponential` |
| `GradualBlurAnimatedDemo`（`AnimatedScrollDemo` 复用） | 280px 框：案例卡片（点阵图库）+ 时间线，底部 `animated="scroll"`、`hover-intensity 1.4`、exponential；滚轮时自动平滑滚到底，`onAnimationComplete` 点亮状态胶囊 |
| `GradualBlurHoverIntensityDemo` | 220px 可滚动文本 + `hover-intensity 1.8` |
| `GradualBlurPositionsDemo` | 2×2 四个方向面板（彩色渐变底 + 文本/色块网格） |
| `GradualBlurPresetsDemo` | 3×2 六个 preset 小框（内容只有一行标题 + 空白） |
| `GradualBlurResponsiveSizesDemo` | responsive 高度 |
| `GradualBlurTargetPageDemo` | `target="page"` + `page-footer` preset + `z-index 9999`（fixed；在 `.docs-prose` 内会相对文章盒定位，见 `flip-overlay.md`） |

### 当前格子（研究时 ~2899–2918 行，锚点 `docPath('gradual-blur')`）

```vue
<div class="docs-gallery__block docs-gallery__blur-stage">
  <div class="docs-gallery__fade-row">
    <div v-for="tileIndex in 8" :key="tileIndex" class="docs-gallery__tile">
      {{ tileIndex }}
    </div>
  </div>
  <TxGradualBlur position="bottom" :strength="2" height="40%" />
</div>
```

失败原因：`.docs-gallery__blur-stage` 高 88px；方块行 34px 高位于顶部；模糊层是底部 40%（≈35px，y 53–88）→ 模糊的是空白区，什么也看不到；舞台无边框、无背景；默认 `zIndex:1000`。

### 方案：带框的"图片流"缓慢滚过底部模糊

```vue
<div class="docs-gallery__block docs-gallery__blur-card">
  <div class="docs-gallery__blur-feed">
    <figure v-for="(item, i) in [...galleryItems, ...galleryItems]" :key="i">
      <img :src="item.url" alt="">
      <figcaption>{{ item.name }}</figcaption>
    </figure>
  </div>
  <TxGradualBlur position="bottom" height="64px" :strength="2.5" :div-count="6"
                 curve="bezier" exponential :z-index="1" />
</div>
```

- `.docs-gallery__blur-card { position: relative; height: 140px; overflow: hidden; border-radius: 14px }`；边框 ring 放在 `::after`（`inset:0; border-radius:inherit; box-shadow: inset 0 0 0 1px var(--docs-gallery-line); pointer-events:none; z-index:2`），否则 inset 阴影会被子内容盖住。
- `.docs-gallery__blur-feed`：两列 grid、6 张 `tileImage()` 风景图（彩色、高对比）+ 11px 图名，总高 >240px；`animation: <feed-scroll> 8s ease-in-out infinite alternate`（translateY 0 → −(内容高 − 140px)），内容持续经过底部模糊带，文字与图像边缘被逐级糊化。reduced-motion：`animation: none`（静止时图片仍铺满模糊带，效果照样可见）。
- `:z-index="1"`：默认 1000 没必要（卡片 overflow 裁切下不会溢出，但保持低层级）。exponential + strength 2.5 时最底层约 2.5rem 模糊；非 exponential 约 1.1rem。
- 可选：再加一个 `position="top" height="36px" :strength="1.5"` 展示方向。
- reset：feed 动画随 remount 从顶部重新开始；`galleryItems`（~489 行起）已在画廊脚本里。

## Caveats / Not Found

- 三格尺寸/观感均为样式推算，未在浏览器目测。
- GlassSurface 的 SVG 位移路径依赖 Chromium 对 `backdrop-filter: url(#…)` 的支持；Safari/Firefox 由组件 UA 判断走模糊回退（未实测回退观感）。
- GradientBorder 的"可行方向"只描述约束，具体实现与测试（`gradient-border.test.ts`）调整由实现方决定。
