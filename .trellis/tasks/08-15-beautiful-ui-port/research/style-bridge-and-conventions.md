# Research: BUI 样式桥接方案 + 仓库约定清单

- **Query**: 设计 Beautiful UI (MIT) → tuffex 的样式系统桥接，并盘点每个移植组件必须遵守的仓库约定
- **Scope**: internal（BUI 源码归档 + tuffex/nexus 仓库）
- **Date**: 2026-08-15
- **Task**: `.trellis/tasks/08-15-beautiful-ui-port`

---

## 摘要（先读这段）

三个会改变移植计划的事实：

1. **BUI token 只有 33 个（不是 PRD 写的 54 个）**，明暗各 33 条，名字集合完全一致。
2. **BUI token 与 tuffex token 没有一个真正等价**（除了纯白 `#ffffff`）。语义色差距在 ΔRGB 52–96，中性色也差 5–29。想「映射到现有 tuffex 语义变量」= 放弃像素级还原。**必须新增独立 token 层。**
3. **tuffex 的两条 CSS 体积预算已经快满了，这次移植会撞破它们**（`audit:size` 今天是绿的，且已在 CI 里真实 gate）：
   - `dist/es/base.css` = 30,384 B，上限 32 KiB → 余量 **2,384 B**；33 token × 2 主题 ≈ 2.7 KiB，**光加 token 就会超**。
   - `dist/es/components.css` = 493,195 B，上限 488 KiB → 余量 **6,517 B**；19 个组件的 CSS（中位数 2.8 KiB/个）至少 50 KiB，**必然超**。

第 3 点意味着：`packages/tuffex/scripts/audit-package-size.mjs` 的 `LIMITS` 需要在移植过程中调高，这是主会话要做的一次共享文件编辑，而不是某个组件 agent 的事。

---

## Part 1 — BUI 样式系统

### 1.1 Token 清单（33 个 × 明/暗）

来源：`research/beautifului-src/_design-tokens.json`，`:root` 与 `.dark` 两个块，键名集合逐一相同（已程序化校验：`identical name sets: true`）。

| 分组 | Token | Light | Dark |
|---|---|---|---|
| 背景层 | `--page` | `#fafafb` | `#17181a` |
| | `--canvas` | `#f1f2f3` | `#1c1d1f` |
| | `--surface` | `#fff` | `#232427` |
| | `--inset` | `#f7f8f9` | `#1f2022` |
| | `--hover` | `#f4f5f6` | `#2a2b2e` |
| | `--hover-2` | `#e7e9eb` | `#313236` |
| 文字 | `--ink` | `#1f2124` | `#f2f3f4` |
| | `--ink-2` | `#62656b` | `#a5a8ad` |
| | `--ink-3` | `#9a9da3` | `#6c6f75` |
| 描边 | `--line` | `#ecedef` | `#2e3033` |
| | `--line-strong` | `#e0e2e5` | `#3a3c40` |
| 表单 | `--field` | `#f2f2f3` | `#2b2c2f` |
| 斑马纹 | `--stripe` | `#49494913` | `#ffffff0e` |
| | `--stripe-bg` | `#f5f5f5` | `#1b1c1e` |
| 强调 | `--accent` | `#0285ff` | `#3d9aff` |
| | `--accent-ink` | `#0170dd` | `#7ec0ff` |
| | `--accent-tint` | `#e9f3ff` | `#3d9aff29` |
| 语义 | `--green` | `#189a4d` | `#3dbb72` |
| | `--green-tint` | `#e8f5ed` | `#3dbb7224` |
| | `--orange` | `#ef720c` | `#f68f3c` |
| | `--orange-tint` | `#fdf1e5` | `#f68f3c24` |
| | `--red` | `#e3474c` | `#ee5c61` |
| | `--red-tint` | `#fcecec` | `#ee5c6124` |
| Tooltip | `--tooltip-bg` | `#25272b` | `#111214` |
| | `--tooltip-fg` | `#f6f7f8` | `#f2f3f4` |
| | `--tooltip-muted` | `#a5a8ad` | `#a5a8ad` |
| | `--tooltip-border` | `#3a3c40` | `#2e3033` |
| 阴影 | `--shadow-hairline` | `0 0 0 1px var(--line)` | 同（值一致） |
| | `--shadow-btn` | `0 0 0 1px var(--line-strong),0 1px 2px #1018280d` | `0 0 0 1px var(--line-strong),0 1px 2px #0000004d` |
| | `--shadow-card` | `0 0 0 1px var(--line),0 1px 2px #1018280a,0 2px 6px #10182808` | `0 0 0 1px var(--line),0 1px 2px #0003,0 2px 6px #0003` |
| | `--shadow-raised` | `0 0 0 1px var(--line),0 2px 10px #0000000b` | `0 0 0 1px var(--line),0 2px 10px #00000038` |
| | `--shadow-overlay` | `0 0 0 1px var(--line),0 8px 28px #0001` | `0 0 0 1px var(--line-strong),0 8px 28px #00000057` |
| | `--shadow-inset-field` | `inset 0 1px 2px #0000001f` | `inset 0 1px 2px #0006` |

阴影体系的关键点：**每一档都以 `0 0 0 1px var(--line)` 发丝环开头**，模糊阴影只是叠在环外的第二/第三层。这是 BUI 视觉语言的核心特征——所有卡片、按钮的「边框」其实是 spread ring shadow，不是 `border`，所以不占布局尺寸。

`--shadow-overlay` 在暗色下把环从 `--line` 换成 `--line-strong`，这是明暗两套里唯一一处结构性差异（不只是数值差异），移植时不能用同一条模板生成。

`_design-tokens.json` 里还有大量 `--lexi-*` / `--ld-*` 变量（第 76–134 行）——那是抓取页面时混入的浏览器扩展（Lexi 翻译插件）注入样式，**与 Beautiful UI 无关，不要移植**。

### 1.2 9 个 @keyframes（逐字，MIT）

从 `_global.css`（压缩成 2 行）用花括号配对提取，原样如下：

```css
@keyframes shimmer-text{0%{background-position:150%}to{background-position:-50%}}
```

```css
@keyframes fade-up{0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
```

```css
@keyframes fade-in{0%{opacity:0}to{opacity:1}}
```

```css
@keyframes eq-bounce{0%,to{transform:scaleY(.35)}50%{transform:scaleY(1)}}
```

```css
@keyframes stream-in{0%{opacity:0;filter:blur(4px)}to{opacity:1;filter:blur()}}
```

```css
@keyframes caret-blink{0%,to{opacity:1}50%{opacity:0}}
```

```css
@keyframes pop-in{0%{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
```

```css
@keyframes spin{to{transform:rotate(1turn)}}
```

```css
@keyframes pixel-on{0%,to{opacity:.15}18%,42%{opacity:1}62%{opacity:.15}}
```

移植注意：

- `stream-in` 的 `filter:blur()` 是 Lightning CSS 把 `blur(0)` 压缩后的产物。**空参数 `blur()` 在 Chrome/Safari 里是非法值，整条 `filter` 声明会被丢弃**，恰好达到「无模糊」的效果，所以线上看起来是对的。移植时写 `filter: blur(0)`，不要照抄空括号。
- `spin` 的 `rotate(1turn)` 等价于 `rotate(360deg)`；tuffex 里已有的同类 keyframes（如 `tx-tool-call-card-spin`）用的是 `360deg` 写法。
- `shimmer-text` 依赖调用方设置 `background-size: 200% 100%` + `background-clip: text` + `color: transparent`，keyframes 本身只推 `background-position`。用法见 `01-loading-state.tsx:74-80`。

### 1.3 Tailwind 工具类 → CSS 变量映射

BUI 用的是 Tailwind v4，token 通过 `@theme` 注册成颜色空间，编译后工具类直接指向裸变量（不是 `--color-*` 中间层）。从编译产物提取的实际映射：

```css
.bg-page{background-color:var(--page)}
.bg-canvas{background-color:var(--canvas)}
.bg-surface{background-color:var(--surface)}
.bg-inset{background-color:var(--inset)}
.bg-hover{background-color:var(--hover)}
.bg-hover-2{background-color:var(--hover-2)}
.bg-field{background-color:var(--field)}
.bg-ink{background-color:var(--ink)}
.bg-ink-2{background-color:var(--ink-2)}
.bg-ink-3{background-color:var(--ink-3)}
.bg-line{background-color:var(--line)}
.bg-line-strong{background-color:var(--line-strong)}
.bg-accent{background-color:var(--accent)}
.bg-accent-tint{background-color:var(--accent-tint)}
.bg-green / .bg-green-tint / .bg-orange / .bg-orange-tint / .bg-red / .bg-red-tint  → var(--green) …
.text-ink{color:var(--ink)}
.text-ink-2{color:var(--ink-2)}
.text-ink-3{color:var(--ink-3)}
.text-accent{color:var(--accent)}
.text-accent-ink{color:var(--accent-ink)}
.text-canvas{color:var(--canvas)}
.text-surface{color:var(--surface)}
.text-green / .text-orange / .text-red → var(--green) …
.border-line{border-color:var(--line)}
.border-line-strong{border-color:var(--line-strong)}
.border-t-canvas{border-top-color:var(--canvas)}
.border-t-ink-2{border-top-color:var(--ink-2)}
.divide-line>:not(:last-child){border-color:var(--line)}
.shadow-hairline{--tw-shadow:var(--shadow-hairline)}
.shadow-btn{--tw-shadow:var(--shadow-btn)}
.shadow-card{--tw-shadow:var(--shadow-card)}
.shadow-raised{--tw-shadow:var(--shadow-raised)}
.shadow-overlay{--tw-shadow:var(--shadow-overlay)}
```

透明度修饰符（`/60`、`/35`、`/45`、`/70`、`/30`、`/40`）编译成 `color-mix(in oklab, var(--x) N%, transparent)`——注意是 **oklab**，不是 tuffex 惯用的 `in srgb`。中间灰度上两者可见差异很小，但 `--accent/30`、`--line/60` 这类要还原时应保留 `in oklab`。

暗色变体的选择器是 `:where(.dark, .dark *)`，即 Tailwind v4 的 `@custom-variant dark`。

### 1.4 Theme 层里的非颜色 token

```css
--radius-chip:6px
--radius-control:8px
--radius-card:10px
--default-transition-duration:.15s
--default-transition-timing-function:cubic-bezier(.4,0,.2,1)
--default-font-family:var(--font-inter),ui-sans-serif,system-ui,sans-serif
--default-mono-font-family:var(--font-mono-face),ui-monospace,"SF Mono",monospace
--text-xs:.75rem  --text-sm:.875rem  --text-2xl:1.5rem
--radius-sm:.25rem  --radius-md:.375rem  --radius-lg:.5rem  --radius-xl:.75rem
```

字体族实际值（`_design-tokens.json` 第 8–9 行）：`--font-inter: "Inter","Inter Fallback"`，`--font-mono-face: "JetBrains Mono","JetBrains Mono Fallback"`。tuffex 的 `--tx-font-family` 已经以 `"Inter"` 开头，sans 一侧天然对齐；**等宽字体 tuffex 没有 token**，需要新增。

`--radius-chip/control/card` 这三个是 BUI 自定义的圆角阶梯，直接决定 chip/按钮/卡片的形状，必须一起移植。

### 1.5 字号与数字

BUI 几乎不用 Tailwind 的字号刻度，而是 `text-[Npx]` 硬值。全 19 个组件统计：

| 字号 | 出现次数 | 典型用途 |
|---|---|---|
| `13px` | 33 | 正文 / 主标签 |
| `12px` | 32 | 次要文本 / 元信息 |
| `12.5px` | 24 | 卡片标题 |
| `11.5px` | 21 | 徽标 / 状态 |
| `11px` | 12 | 脚注 |
| `10.5px` | 10 | 大写小标签 |
| `17px` / `20px` / `10px` / `8px` / `7px` | 各 1–2 | 特例 |

**13px 是正文基准**，比 tuffex 的 `--tx-font-size-base: 14px` 小一号。半像素字号（12.5 / 11.5 / 10.5）是 BUI 密度感的来源，不能就近取整到 12/11。tuffex 现有组件里已有这种写法先例（`TxToolCallCard.vue:167` 用 `font-size: 12.5px`），所以不算引入新风格。

`tabular-nums` 在 10 个组件里用到（16-insight-cards 用了 7 次），`font-mono` 在 8 个组件里用到。数字列/计时器/统计值一律等宽 + 表格数字，这是「不跳动」的保证。

### 1.6 Reduced-motion

BUI 全站只有两条：

```css
@media (prefers-reduced-motion:reduce){.stream-caret{animation:none}.stream-tail{filter:none;-webkit-mask-image:none;mask-image:none}}
@media (prefers-reduced-motion:reduce){*,:after,:before{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
```

第二条是全局兜底（Tailwind preflight 之外的自定义规则），把所有动画压到 0.01ms 并只播一次。**tuffex 没有这种全局兜底**，各组件在自己的 `<style>` 尾部写 `@media (prefers-reduced-motion: reduce)` 块（见 `TxToolCallCard.vue:349-356`）。移植时按 tuffex 惯例逐组件写，不要引入全局 `*` 规则——那会改变现有 126 个组件的动效行为。

### 1.7 手写 CSS 类的分布

BUI 大部分组件是纯 Tailwind 工具类，只有少数用了手写类：

| 前缀 | 选择器数 | 对应组件 |
|---|---|---|
| `records-*` | 159 | 12-records-table |
| `filter-*` | 21 | 13-filter-table |
| `insight-*` | 10 | 16-insight-cards |
| `primitive-*` | 10 | 站点自身 shell（非组件） |
| `stream-*` | 5 | 03-streaming-text |

`records-table` 的 159 条手写规则是移植量最大的单点。其余 14 个组件基本可以「Tailwind 类 → SCSS 声明」逐条翻译。

---

## Part 2 — tuffex 样式架构

### 2.1 没有独立 style 包

全局样式只有三个文件，都在 `packages/tuffex/packages/components/style/`：

| 文件 | 行数 | 内容 |
|---|---|---|
| `variables.scss` | 441 | 所有 `--tx-*` token：`:root`（常规亮）、`[data-theme='dark'], .dark`（常规暗）、`tx-high-contrast-light` / `tx-high-contrast-dark` 两个 mixin |
| `mixins.scss` | 166 | flex/transition/ellipsis/scrollbar/button-base/elevation，以及 skeleton 的 `skeleton-keyframes` + `skeleton-surface` |
| `index.scss` | 109 | `@use` 上面两个 + `.fake-background` 玻璃拟态工具类 + `html[data-tx-coloring]` 着色边框层 |

全仓 SCSS 文件只有 8 个（上面 3 个 + `flat-button` / `input` / `switch` / `base-surface` / `button` 各自的 `style/index.scss`）。其余 121 个组件的样式全部写在 SFC 的 `<style lang="scss">` 里。

### 2.2 主题切换机制

`variables.scss:311-312`：

```scss
[data-theme='dark'],
.dark {
```

**两个选择器并列**——`.dark` 类和 `data-theme="dark"` 属性都生效。

- nexus：`nuxt.config.ts:217-219` 配 `colorMode: { classSuffix: '' }`，`@nuxtjs/color-mode` 因此在 `<html>` 上切 `.dark` / `.light` 类。
- core-app：读的是 `document.documentElement.classList.contains('dark')`（`apps/core-app/src/renderer/src/modules/hooks/core-box.ts:87`），同样是 `.dark` 类。

**这是本次移植最幸运的一点：BUI 的暗色选择器就是 `.dark`，与 tuffex/nexus 完全一致，token 层可以直接沿用同一个开关，零适配成本。**

另有两级无障碍层（`variables.scss:416-437`）：
- `html[data-tx-contrast='high']` / `html.contrast` → 高对比 mixin
- `@media (prefers-contrast: more)` + `html:not([data-tx-contrast='normal'])` → 自动高对比

BUI 没有高对比模式。移植的 token 若不在这两层里覆写，高对比模式下这 19 个组件会保持 BUI 原色（对比度可能不达标）。

### 2.3 命名规范

- CSS 变量：`--tx-<domain>-<role>[-<modifier>]`，例：`--tx-text-color-secondary`、`--tx-border-color-lighter`、`--tx-color-primary-light-9`。
- 类名：`tx-<component>__<element>`、状态用 `is-*`（`.is-open`、`.is-streaming`、`.is-disabled`）、数据属性用 `data-status` 等。
- 组件级可调参数走「组件自有变量 + 回退」：`--tx-card-radius`、`--tx-tool-call-card-result-max-height`、`--tx-skeleton-base-color`。

### 2.4 变量回退是硬约定

统计 `packages/tuffex/packages/components/src`：

- `var(--tx-*, <fallback>)` 带回退：**1,416 处**
- `var(--tx-*)` 裸引用：381 处

原因写在 `mixins.scss:126-130`：

> The keyframes are deliberately emitted per component rather than pulled from the global stylesheet — consumers import components by subpath and only get that component's CSS, so a shared global definition would leave the animation undefined for anyone who does not also load `base.css`.

**同样的逻辑适用于 token**：按子路径引入单个组件（`@talex-touch/tuffex/loading-state` + `/style.css`）的消费者拿不到 `base.css`。所以每个 `var()` 都带内联回退，是这个包的分发模型逼出来的，不是可选风格。

### 2.5 keyframes 一律组件内定义、`tx-` 前缀

全仓 106 处 `@keyframes`，无一例外全在组件的 `<style>` 或组件 SCSS 里，命名 `tx-<component>-<motion>`：`tx-tool-call-card-spin`、`tx-spinner-rotate`、`tx-tabs-pointer-warp-x`、`tx-stream-md-reveal`…

`style/index.scss` 里**没有任何 keyframes**。唯一的共享动画（skeleton shimmer）是通过 `@mixin skeleton-keyframes` 分发的——即由每个组件在自己的 CSS 顶层 emit 一次，而不是放到全局表。

### 2.6 组件消费 token 的两个实例

**tool-call-card**（`src/tool-call-card/src/TxToolCallCard.vue:150-357`，SFC 内 `<style lang="scss">` **非 scoped**）：

```scss
.tx-tool-call-card {
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 45%, transparent);
  …
  &[data-status='error'] {
    border-color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 32%, var(--tx-border-color-lighter, #e5e7eb));
  }
}
@keyframes tx-tool-call-card-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { … transition: none; animation: none; }
```

模式：BEM 类 + `data-*` 状态选择器 + 每个 var 带回退 + `color-mix(in srgb, …)` 做透明/混色 + 尾部 reduced-motion 块。

**card**（`src/card/src/TxCard.vue:527+`，`<style lang="scss" scoped>`）：同样的 token 用法，但用 `scoped`，且暴露 `--tx-card-radius` / `--tx-card-padding` / `--tx-card-dx` 供外部覆写。

**button**（`src/button/src/style/index.scss`，由 `button/index.ts` 顶部 `import './src/style/index.scss'` 引入）：第三种组织方式——独立 SCSS 文件。

三种写法并存，没有强制统一。移植时选 `<style lang="scss">`（非 scoped，与 tool-call-card 一致）最省事，因为 BUI 组件有大量子元素类名，scoped 的属性选择器会显著放大 CSS 体积。

### 2.7 构建产物如何生成

| 产物 | 来源 | 代码位置 |
|---|---|---|
| `dist/es/base.css` + `dist/lib/base.css` | `packages/components/style/index.scss` 经 gulp+sass+autoprefixer | `packages/script/build/index.ts:66-72, 96-106` |
| `dist/es/<name>/style.css` | 用 Vite 以每个组件 `index.ts` 为 entry 单独打包，收集该 chunk 及其依赖链上的 CSS | `packages/script/build/component-styles.ts:134-170` |
| `dist/es/components.css` | 全量 barrel 构建的聚合 CSS | vite lib build |

关键推论：**新 token 必须写进 `style/index.scss` 引用链，才会进 `base.css`**；而 `base.css` 只有引入了 `@talex-touch/tuffex/base.css` 的宿主才有。子路径消费者只拿 `<name>/style.css`。

---

## Part 3 — 桥接方案

### 3.1 为什么不能映射到现有 tuffex 语义变量

逐对计算 RGB 欧氏距离（BUI 值 vs 语义最接近的 tuffex 值）：

| BUI | tuffex 最近邻 | 明/暗 | ΔRGB | 判定 |
|---|---|---|---|---|
| `--surface` `#fff` | `--tx-bg-color` `#ffffff` | 亮 | **0** | 唯一真等价 |
| `--canvas` | `--tx-bg-color-page` | 亮 | 2 | 近似 |
| `--inset` | `--tx-fill-color-light` | 亮 | 2 | 近似 |
| `--field` | `--tx-fill-color` | 亮 | 3 | 近似 |
| `--hover` | `--tx-fill-color-light` | 亮 | 5 | 近似 |
| `--line-strong` | `--tx-border-color` | 亮 | 5 | 近似 |
| `--ink-2` | `--tx-text-color-regular` | 亮 | 6 | 近似 |
| `--line` | `--tx-border-color-lighter` | 亮 | 6 | 近似 |
| `--page` | `--tx-bg-color-page` | 亮 | 12 | 偏差可见 |
| `--hover-2` | `--tx-fill-color` | 亮 | 16 | 偏差可见 |
| `--ink-3` | `--tx-text-color-secondary` | 亮 | 17 | 偏差可见 |
| `--ink` | `--tx-text-color-primary` | 亮 | **28** | 明显偏差 |
| `--red` | `--tx-color-danger` | 亮 | **52** | 完全不同 |
| `--accent` | `--tx-color-primary` | 亮 | **67** | 完全不同 |
| `--orange` | `--tx-color-warning` | 亮 | **68** | 完全不同 |
| `--green` | `--tx-color-success` | 亮 | **91** | 完全不同 |
| `--page` | `--tx-bg-color` | 暗 | 8 | 近似 |
| `--line` | `--tx-border-color-lighter` | 暗 | 11 | 偏差可见 |
| `--surface` | `--tx-bg-color-overlay` | 暗 | 12 | 偏差可见 |
| `--ink` | `--tx-text-color-primary` | 暗 | 16 | 偏差可见 |
| `--line-strong` | `--tx-border-color` | 暗 | **29** | 明显偏差 |
| `--ink-2` | `--tx-text-color-regular` | 暗 | **76** | 完全不同 |
| `--ink-3` | `--tx-text-color-secondary` | 暗 | **96** | 完全不同 |

结论：只有 `--surface`（亮）能真正复用 `--tx-bg-color`。**暗色中性文字差距最大（76 / 96），恰恰是暗色截图对比时最扎眼的部分。** 若目标是 AC2「与 shots/ 基准一致」，只能整套独立 token。

### 3.2 命名：`--tx-bui-*`

提议一律加 `bui` 命名段，与现有 `--tx-*` 同族但不重叠：

```
--ink            → --tx-bui-ink
--ink-2          → --tx-bui-ink-2
--ink-3          → --tx-bui-ink-3
--page           → --tx-bui-page
--canvas         → --tx-bui-canvas
--surface        → --tx-bui-surface
--inset          → --tx-bui-inset
--hover          → --tx-bui-hover
--hover-2        → --tx-bui-hover-2
--line           → --tx-bui-line
--line-strong    → --tx-bui-line-strong
--field          → --tx-bui-field
--stripe         → --tx-bui-stripe
--stripe-bg      → --tx-bui-stripe-bg
--accent         → --tx-bui-accent
--accent-ink     → --tx-bui-accent-ink
--accent-tint    → --tx-bui-accent-tint
--green          → --tx-bui-green
--green-tint     → --tx-bui-green-tint
--orange         → --tx-bui-orange
--orange-tint    → --tx-bui-orange-tint
--red            → --tx-bui-red
--red-tint       → --tx-bui-red-tint
--tooltip-bg     → --tx-bui-tooltip-bg
--tooltip-fg     → --tx-bui-tooltip-fg
--tooltip-muted  → --tx-bui-tooltip-muted
--tooltip-border → --tx-bui-tooltip-border
--shadow-hairline    → --tx-bui-shadow-hairline
--shadow-btn         → --tx-bui-shadow-btn
--shadow-card        → --tx-bui-shadow-card
--shadow-raised      → --tx-bui-shadow-raised
--shadow-overlay     → --tx-bui-shadow-overlay
--shadow-inset-field → --tx-bui-shadow-inset-field
```

外加 BUI theme 层的三个圆角 + 等宽字体：

```
--radius-chip    → --tx-bui-radius-chip: 6px
--radius-control → --tx-bui-radius-control: 8px
--radius-card    → --tx-bui-radius-card: 10px
（新增）          → --tx-bui-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace
```

**唯一建议接回现有体系的一条**：`--tx-bui-accent` 可以考虑默认取 `var(--tx-color-primary)`——但那样就不是像素还原了。按 PRD 的 R3「像素级还原」，默认应为 BUI 原值 `#0285ff`，把「跟随主品牌色」留成宿主可覆写的能力（因为 CSS 变量天然可被 `.tx-bui-scope { --tx-bui-accent: var(--tx-color-primary) }` 覆盖）。

命名不用裸 `--ink` / `--line` 的理由是具体的：BUI 的 `--line` / `--accent` / `--red` 这些名字太通用，一旦进 `:root`，任何宿主应用（core-app 的 renderer、第三方插件 UI）若自己定义了同名变量就会互相污染，而且方向不可控。

### 3.3 文件落位

新增两个文件，都在现有 style 目录下：

```
packages/tuffex/packages/components/style/
├── variables.scss     （已存在，不改）
├── mixins.scss        （已存在，追加 bui mixin）
├── bui-tokens.scss    （新增：33 token × 明/暗 + 4 个尺寸/字体 token）
└── index.scss         （已存在，追加 @use './bui-tokens.scss';）
```

`bui-tokens.scss` 的结构必须镜像 `variables.scss` 的选择器写法，才能跟着同一个开关走：

```scss
:root { /* 33 light tokens + radius/font */ }

[data-theme='dark'],
.dark { /* 33 dark tokens */ }
```

**keyframes 不进这个文件**。按 §2.5 的既有约定，9 个 keyframes 应该做成 `mixins.scss` 里的 `@mixin bui-keyframes-<name>`（或一个总的 `@mixin bui-keyframes`），由用到的组件各自 emit 一次，命名 `tx-bui-shimmer-text` / `tx-bui-fade-up` / `tx-bui-pixel-on` …。这是 skeleton 已经走通的模式，且是子路径消费者能拿到动画的唯一方式。

代价是同名 keyframes 会在 `components.css` 里重复出现 N 次（N = 用到它的组件数）。考虑到 `pixel-on` 只有 loading-state 用、`caret-blink` 只有 streaming-text 用，实际重复主要集中在 `fade-up` / `fade-in` / `pop-in`，可以接受。

### 3.4 阴影系统与现有 elevation 的关系

tuffex 现有阴影是纯投影，**没有环**：

```scss
--tx-box-shadow: 0px 12px 32px 4px rgba(0,0,0,.04), 0px 8px 20px rgba(0,0,0,.08);
--tx-box-shadow-light: 0px 0px 12px rgba(0,0,0,.12);
--tx-box-shadow-lighter: 0px 0px 6px rgba(0,0,0,.12);
--tx-box-shadow-dark: …;
```

`mixins.scss:51-61` 的 `@mixin elevation($level)` 就是在这四个之间切换。

三点冲突/注意：

1. **BUI 的每一档都以 `0 0 0 1px var(--line)` 开头**，等价于一条不占布局的边框。移植的组件如果同时写 `border: 1px solid` 又用 `--tx-bui-shadow-card`，会得到双线。BUI 原始组件正是靠 shadow 环替代 border 的——移植时应保持「用环、不用 border」。
2. **不要用 `@include elevation()`**：它给的是 tuffex 的无环投影，会丢掉 BUI 最有辨识度的发丝线。
3. **`html[data-tx-coloring='true']` 着色层会叠加**（`style/index.scss:36-88`）：它对 `.tx-card:not(.is-plain)`、`.tx-base-surface`、`.fake-background` 等选择器加一个 `::after` 的 `inset 0 0 0 1px` 内环。只要移植组件不复用这些既有类名（用自己的 `tx-bui-*` 类），就不会被套上第二层环。**这是「不污染」的具体检查项：新组件不要挂 `.tx-card` / `.tx-base-surface` / `.fake-background` 类。**

### 3.5 作用域隔离策略

分三层，每层解决不同的污染方向：

**第一层：token 变量名带 `bui` 段**（§3.2）。保证 BUI token 定义在 `:root` 也不会改变任何现有组件的取值——现有组件一个字符都读不到 `--tx-bui-*`。

**第二层：类名前缀 `tx-bui-<component>__<element>`**。现有组件类名是 `tx-<component>__…`，加一个 `bui` 段就不可能碰撞。同时避开 §3.4 提到的三个被全局着色层选中的类名。

**第三层（可选，用于对齐 BUI 的 base 层）**：BUI 的视觉还依赖 Tailwind preflight 的几条重置——`box-sizing: border-box`、`margin/padding: 0`、`button { font: inherit; background: transparent; border: 0 }`、`img,svg { display: block; vertical-align: middle }`、`ul,ol { list-style: none }`、`h1-h6 { font-size: inherit; font-weight: inherit }`。tuffex 的 `base.css` **不含这些重置**（`style/index.scss` 只有 `.fake-background` 等工具类，`variables.scss:439-441` 只设了 `html { color }`）。

因此每个移植组件的根节点应带一个共用作用域类，在其内部做局部重置，例如：

```scss
.tx-bui-scope {
  box-sizing: border-box;
  font-family: var(--tx-font-family);
  font-size: 13px;          // BUI 正文基准
  color: var(--tx-bui-ink, #1f2124);

  *, *::before, *::after { box-sizing: border-box; }
  button { font: inherit; color: inherit; background: transparent; border: 0; padding: 0; }
  ul, ol { list-style: none; margin: 0; padding: 0; }
  h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; margin: 0; }
  svg, img { display: block; }
}
```

放在 `mixins.scss` 作为 `@mixin bui-scope`，各组件在自己的根类上 `@include`——同样出于子路径分发的理由（放全局表则子路径消费者拿不到）。

**这一层是「像素级还原」与「不污染」之间真正的接缝**：BUI 组件的间距假设了 `margin: 0` 的按钮和列表，不做局部重置就会到处差几像素；但把重置放全局，就会改变现有 126 个组件的渲染。

### 3.6 体积预算（必须处理）

`packages/tuffex/scripts/audit-package-size.mjs` 的当前上限与实测：

| 指标 | 上限 | 当前（dist，2026-08-15 03:49 构建） | 余量 |
|---|---|---|---|
| `dist/es/base.css` | 32 KiB = 32,768 B | **30,384 B** | **2,384 B** |
| `dist/es/components.css` | 488 KiB = 499,712 B | **493,195 B** | **6,517 B** |
| 单组件 `style.css` | 96 KiB | 最大 stream-markdown 92.0 KiB | 4 KiB |

`node ./scripts/audit-package-size.mjs` 今天实跑结果：`package size and Core App root import budgets are within limits`（绿）。

`.github/workflows/package-tuffex-ci.yml:41` 的 `post-build-command` 实际执行 `audit:exports && audit:exports:self-test && audit:readme && audit:readme:self-test && audit:types && audit:types:self-test && audit:size && audit:size:self-test`——**四个 audit 全都在 gate**。（同文件第 38–40 行的注释说「Only the two that pass today … wiring them here would land a gate that is red on every PR」，与实际命令不符，注释已过期；以命令为准。）

影响估算：

- **base.css**：33 token × 2 主题 ≈ 2.0 KiB（颜色值）+ 6 条阴影 × 2 主题的长值 ≈ 0.7 KiB ≈ **2.7 KiB > 2,384 B 余量**。只加 token 就会超。
- **components.css**：126 个组件的单文件 CSS 中位数 2.8 KiB。19 个新组件按中位数算 ≈ 53 KiB，records-table 那种手写 159 条规则的会更大。**必然远超 6,517 B 余量。**

所以移植过程中需要调高 `LIMITS.baseCssBytes` 和 `LIMITS.fullCssBytes`。该文件是共享文件，按 PRD 约束应由主会话统一编辑。建议在移植开始前先调，否则每个组件 agent 的本地 `audit:size` 都是红的，噪声很大。

（注：`dist/` 是 2026-08-15 03:49 的构建产物，而工作树是脏的，这些数字是当时源码的快照。真正定版前应按 memory「tuffex audit:size reads dist」重跑一次 `pnpm -C packages/tuffex build` 再测。）

---

## Part 4 — 组件 + 文档约定清单

### 4.1 tuffex 组件目录范式

最近新增组件（reasoning-disclosure / tool-call-card / loading-state / fusion）的实际文件布局：

```
src/<kebab-name>/
├── index.ts                        必需
├── src/
│   ├── Tx<PascalName>.vue          必需
│   └── types.ts                    有 props 类型时；纯 wrapper 可省（tool-call-card 就没有）
└── __tests__/
    └── <kebab-name>.test.ts        必需
```

可选补充（button 目录有）：`src/style/index.scss`、`README.md`、`DESIGN.md`。

**`index.ts` 模板**（照抄 `loading-state/index.ts`）：

```ts
import type { LoadingStateEmits, LoadingStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxLoadingState.vue'

const TxLoadingState = withInstall(component)

export { TxLoadingState }
export type { LoadingStateEmits, LoadingStateProps }
export type TxLoadingStateInstance = InstanceType<typeof component>

export default TxLoadingState
```

要点：`withInstall` 路径固定写 `'../../../utils/withInstall'`——从 `src/<name>/` 三层上跳解析到 `packages/tuffex/packages/utils/withInstall.ts`（真实实现），全部 118 个组件都用这一条路径。`packages/components/utils/withInstall.ts` 只是一行 `export * from '../../utils/withInstall'` 的转发壳，不要指向它；必须导出 `Tx*Instance = InstanceType<typeof component>`；`export default` 是 install 插件。有独立 SCSS 的组件在 `index.ts` 顶部 `import './src/style/index.scss'`（见 `button/index.ts`）。

**SFC 模板要点**（照 `TxToolCallCard.vue`）：
- `defineOptions({ name: 'TxToolCallCard' })`
- `withDefaults(defineProps<{...}>(), {...})`，文案 props 默认英文字符串（无 i18n 系统）
- `defineEmits<{ retry: [id: string] }>()` 元组写法
- `defineSlots<{...}>()` 显式声明
- `<style lang="scss">`（非 scoped）在末尾，含 `@keyframes` 与 `@media (prefers-reduced-motion: reduce)`

**`__tests__` 模板**（照 `reasoning-disclosure.test.ts`）：`@vue/test-utils` 的 `mount` + `vitest` 的 `describe/it/expect`，describe 名用 camelCase（`describe('txReasoningDisclosure', …)`），断言打在类名与文本上。

### 4.2 barrel 注册（共享文件，主会话编辑）

**`packages/tuffex/packages/components/src/components.ts`**（126 行）——按目录名字母序一行一个：

```ts
export * from './reasoning-disclosure/index'
export * from './tool-call-card/index'
```

**`packages/tuffex/packages/components/src/index.ts`**（26 行）——**不需要改**。它是 `export * from './components'` + 遍历安装，新组件自动被包含。

**`packages/tuffex/README.md` 和 `README_ZHCN.md` 必须同步更新**，否则 `pnpm audit:readme` 红（CI gate）。规则在 `scripts/audit-readme-inventory.mjs:45-84`：

1. 总数行 `Current source-of-truth export modules: **126**.` / `当前源码导出模块总数：**126**。` 的数字必须等于 `components.ts` 里 `export * from './X/index'` 的条数。
2. 清单块（`## Component Inventory` → `\nReference:` 之间）每行形如 `` - `分类名 (N)`: `a`, `b`, … ``，**括号里的 N 必须等于该行反引号条目数**。
3. 每个导出模块在清单里**恰好出现一次**，不能缺、不能多、不能重复。

现有 7 个分类：`Foundation & Navigation (25)` / `Form & Input (26)` / `Layout & Structure (13)` / `Data & State (22)` / `Feedback & Overlay (12)` / `AI & Content (16)` / `Animation & Visual (12)`。19 个 BUI 组件大部分应进 `AI & Content`。

**`apps/nexus/app/plugins/tuffex.ts`（279 行）必须加条目**，否则 nexus 文档/demo 里用不了全局标签：

```ts
const fromLoadingState = () => import('@tuffex-components/loading-state')
// …
const GLOBAL_TUFFEX_COMPONENTS = {
  TxLoadingState: asyncTuffexComponent(fromLoadingState, 'TxLoadingState'),
  // …
} as const
```

两处：顶部 `from*` loader 常量 + `GLOBAL_TUFFEX_COMPONENTS` 映射（按 key 字母序）。注意有导出名与全局名不同的先例：`TxSwitch: asyncTuffexComponent(fromSwitch, 'TuffSwitch')`。

### 4.3 nexus 文档约定

**路径**：`apps/nexus/content/docs/dev/components/<kebab-name>.zh.mdc` + `.en.mdc`。目前 264 个 .mdc 文件（132 对）。

**8 字段 frontmatter**（262/264 文件带全 8 个；只有 `index.zh/en.mdc` 例外，那是栏目落地页不是组件文档）：

```yaml
---
title: "LoadingState 加载态"          # zh 用「英文名 + 中文名」；en 用纯英文名
description: "用于加载中占位展示。"
category: Status                      # 见下表
status: beta                          # 全站恒为 beta，没有 stable
since: 1.0.0                          # 本次移植按 PRD 用 2.5.0
tags: [loading, state, placeholder]
syncStatus: reviewed
verified: true
---
```

**category 合法值**（`DocsSidebar.vue:376-386` 的 `COMPONENT_CATEGORY_ORDER`，侧边栏分组唯一依据）：

`Basic` / `Form` / `Layout` / `Navigation` / `Data` / `Feedback` / `Status` / `Effects` / `Primitives`

实际分布：Form 26、Data 22、Effects 14、Status 14、Basic 13、Feedback 13、Layout 11、Navigation 11、Primitives 5，另有 `Foundations` 2 个（`foundations.zh/en.mdc`，走 `COMPONENT_STANDALONE_PAGES` 平铺链接，不在分组里）。

**分类名若要新增**，得同时改 `DocsSidebar.vue` 的 `COMPONENT_CATEGORY_ORDER`、`apps/nexus/i18n/locales/zh.ts:564` 与 en 对应的 `docsSidebar.categories.*`，还有 `apps/nexus/scripts/recategorize-component-docs.py`（注释明说要 keep in sync）。**建议 19 个组件全部复用现有 9 个分类，不新增。**

**正文结构**（中文段名事实标准，见 `loading-state.zh.mdc`）：

```
# LoadingState 加载态       ← H1 下不写导语
## 基础用法
### <变体名>
:::TuffDemoWrapper{...}
## <场景段名>
## API
### Props / ### Slots / ### Events   ← 三线表
## 交互契约
## 最佳实践
## Source
<TuffDocSourceLink />
## 审阅说明
```

zh 与 en 的段数必须相等（只翻译段名，不增删段）。

**MDC demo 语法**：

```
:::TuffDemoWrapper{demo="LoadingStateLoadingStateDemo" code-lang="vue" title="…" description="…"}
---
code: |
  <template>
    <TxLoadingState title="正在加载插件" />
  </template>
---
:::
```

`demo` 是 demo-registry 的 key；`code` 走 YAML 块标量，是**展示用**代码，与实际 demo 文件不必逐字相同。围栏深度只要开闭一致即可（`:::` 与 `::` 都合法，同一块必须同深度）。

**demo 文件**：`apps/nexus/app/components/content/demos/<RegistryKey>.vue`（当前 321 个）。命名惯例 `<PascalComponent><DemoName>Demo`。demo 内部可直接用全局标签（`<TxLoadingState>`），或 `import` 自 `@tuffex-components/*`。内部用 `useI18n()` 的 `locale` 做中英文案切换（见 `LoadingStateLoadingStateDemo.vue`）。

**demo 注册**：`apps/nexus/app/components/content/demo-registry.ts`（325 行，共享文件），字母序一行一条：

```ts
LoadingStateLoadingStateDemo: () => import('./demos/LoadingStateLoadingStateDemo.vue'),
```

### 4.4 文档相关的 check 脚本

| 命令 | 位置 | 作用 |
|---|---|---|
| `pnpm -C apps/nexus check:mdc-fences` | `apps/nexus/build/check-mdc-fences.mjs` | MDC 围栏开闭深度必须相等；一个不匹配会静默吞掉后续全部内容。规则是「开=闭」，**不是**「一律三个冒号」 |
| `pnpm -C apps/nexus check:api-routes` | `build/check-server-api-route-tree.mjs` | 服务端 API 路由树 |
| `pnpm -C apps/nexus check:runtime-evidence` | `build/check-runtime-evidence.mjs` | 运行时证据 |
| `pnpm check:doc-metadata`（根） | `scripts/check-doc-metadata.mjs` | 只校验根 README 与 LICENSE/manifest 的一致性，**不看 content/ 下的组件文档** |

**没有**检查 demo-registry 孤儿项 / 文档引用了不存在 demo 的脚本。这类漏洞只能人工核对。

### 4.5 「AI 套件总览」页放哪

导航完全由文件结构驱动，没有手写 nav 配置：

- `apps/nexus/content.config.ts` 把 `docs/**/*.{md,mdc}` 收进 `docs` collection。
- `server/api/docs/navigation.get.ts` 用 `queryCollectionNavigation` 从 collection 生成导航树；`[locale]/[scope].get.ts` 只是 `export { default } from '../../navigation.get'`。
- `build/docs-prerender-routes.ts:41+` 的 `createDocsPrerenderRoutes` 直接 walk `content/docs` 目录生成预渲染路由。

**结论：新建 `.mdc` 文件即自动进导航和预渲染，无需改任何配置。**

两个可行位置：

1. **`content/docs/dev/components/ai-suite.zh.mdc` + `.en.mdc`**，frontmatter 走 8 字段、`category` 选一个现有值。落进侧边栏「组件」区的对应分组。URL：`/docs/dev/components/ai-suite`（`.zh` / `.en` 后缀由 `toLocalizedDocsPath` 处理）。
2. **`content/docs/dev/components/` 下作为 standalone 平铺页**，模仿 `foundations`：`category: Foundations`（或新值）+ 把路径加进 `DocsSidebar.vue:373` 的 `COMPONENT_STANDALONE_PAGES = ['/docs/dev/components/foundations']`，这样它会平铺在 index 页下方、所有分组之上——更符合「入口链接」的定位。

方案 2 更贴合 PRD 的 AC4（一个链接看到全部 19 个组件），代价是要改 `DocsSidebar.vue` 一行（共享文件）。

注意 `index.zh/en.mdc` 只有 4 个 frontmatter 字段（title/description/syncStatus/verified），没有 category/status/since/tags——**栏目落地页不算组件文档**。总览页若走方案 2，可以照 `foundations` 的 8 字段写法（它是有全 8 字段的）。

### 4.6 构建与校验命令

| 目的 | 命令 | 备注 |
|---|---|---|
| tuffex 构建 | `pnpm -C packages/tuffex build`（= `node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`） | 或根目录 `pnpm tuffex:build`。**下游 typecheck 前必跑**——tuffex 的 exports map 只解析到 `dist/`，不构建则每个 `@talex-touch/tuffex/*` 导入都是 TS2307 |
| tuffex 类型检查 | `pnpm -C packages/tuffex typecheck`（= `vue-tsc --noEmit -p tsconfig.json`） | 比两个下游都弱，不能只跑它 |
| tuffex 测试 | `pnpm -C packages/tuffex test`（= `vitest run`） | |
| tuffex 审计（CI gate） | `pnpm -C packages/tuffex audit:exports` / `audit:readme` / `audit:types` / `audit:size`（各带 `:self-test`） | 读 `dist/`，先构建 |
| nexus 类型检查 | `pnpm -C apps/nexus typecheck`（= `node build/check-typecheck-plugin-resolution.mjs` 包一层 `nuxt typecheck`） | 包装层存在的原因：`vue-tsc` 在 Volar 插件解析失败时打印错误却 **exit 0** |
| nexus 原始 typecheck | `pnpm -C apps/nexus typecheck:raw`（= `nuxt typecheck`） | 会漏掉插件解析失败 |
| nexus MDC 围栏 | `pnpm -C apps/nexus check:mdc-fences` | |
| nexus 测试 | `pnpm -C apps/nexus test`（= `vitest run`） | |
| nexus 开发预览 | `pnpm nexus:dev`（端口 3200） | |
| 根 lint（变更文件） | `pnpm lint:changed` | |

**直接可执行入口**（绕开可能失效的 npx/pnpm exec shim，memory「stale .bin shims after repo move」）：

```
/Users/talexdreamsoul/Workspace/Projects/talex-touch/node_modules/.pnpm/vue-tsc@3.3.7_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js
/Users/talexdreamsoul/Workspace/Projects/talex-touch/node_modules/.pnpm/vitest@3.2.7_.../node_modules/vitest/vitest.mjs
```

包内 `.bin` 软链今天是存在的（已验证）：
```
packages/tuffex/node_modules/.bin/vue-tsc
packages/tuffex/node_modules/.bin/vitest
apps/nexus/node_modules/.bin/vue-tsc
apps/nexus/node_modules/.bin/vitest
```

### 4.7 相关 spec

| 文件 | 与本任务相关的内容 |
|---|---|
| `.trellis/spec/frontend/component-guidelines.md` | §Styling Patterns（77–80 行）：优先 scoped、BEM 类名 + CSS 变量、`base.css` + 子路径样式而非全量 `style.css`、**不要在修语义时改视觉类契约**。§Accessibility（130+）：交互控件必须是语义元素（`button type="button"`）。§Loading States（94–127）：骨架屏是默认而非可选，不要手写 `@keyframes`。§I18n（147+） |
| `.trellis/spec/frontend/quality-guidelines.md` | 质量门槛 |
| `.trellis/spec/frontend/directory-structure.md` | 目录规范 |
| `.trellis/spec/frontend/index.md` | 前端 spec 索引 |

---

## Caveats / 未找到

1. **PRD 说 54 个 token，实测 33 个**（明暗各 33，名字集合相同）。`_design-tokens.json` 里另有 ~40 个 `--lexi-*` / `--ld-*` 条目，属于抓取时混入的 Lexi 浏览器扩展样式，非 BUI 资产。33 + 部分 lexi ≈ 54 可能是计数来源。
2. **`_global.css` 是压缩产物**，`@theme` / `@custom-variant` / `@utility` 等 Tailwind v4 源码指令已被编译掉。工具类→变量的映射是从编译后的 `.bg-ink{…}` 规则反推的，可靠；但 BUI 原始 `globals.css` 的 `@theme` 声明形式无从得知。
3. **`dist/` 体积数字取自 2026-08-15 03:49 的构建**，而工作树是脏的。数字用于判断「余量够不够」是可靠的（余量小到几 KiB，源码增量不会改变结论），但定版前应重新构建再测。
4. **未找到 demo-registry 孤儿检查脚本**。`apps/nexus/build/` 下 20 个脚本逐一看过，没有校验 registry key 与 demos/ 目录、与 .mdc 里 `demo="…"` 引用三者一致性的。已扫 `apps/nexus/package.json` 全部 scripts 与根 `package.json` 全部 `check:*`。
5. **BUI 的原始 React 源码里没有显式 focus-visible 环样式的统一约定**——各组件自行处理（`focus-within:border-line-strong`、`focus-visible:text-accent-ink`）。tuffex 有 `--tx-focus-ring-color` / `--tx-focus-ring-shadow` 与 `@mixin focus-ring`。两套如何调和未在本次研究范围内解决，留给实现阶段。
6. **高对比模式（`html[data-tx-contrast='high']`）下 BUI token 的行为未设计**。`variables.scss:416-437` 会把 `--tx-*` 切到高对比 ramp，但 `--tx-bui-*` 若不在该层覆写就保持原值。是否需要一套高对比 BUI token，是产品决策。
7. **`.github/workflows/package-tuffex-ci.yml:38-40` 的注释与第 41 行的命令矛盾**（注释说只跑两个 audit，命令跑四个）。已按命令为准，并实跑 `audit:size` 确认今天是绿的。注释本身未做修改（超出研究范围）。
