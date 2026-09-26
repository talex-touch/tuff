# Design — TxStatCard 发光图标徽章

依据：research/stat-card.md（消费方、单测契约、文档段落、设计规则、图标渲染）。

## DOM

```vue
<!-- 默认 / insight 变体，替换 __decoration + __icon-layer -->
<div v-if="iconClass && !isProgressVariant" class="tx-stat-card__badge" aria-hidden="true">
  <span class="tx-stat-card__halo" />
  <span class="tx-stat-card__badge-body">
    <i ref="iconRef" class="tx-stat-card__icon" :class="iconClass" />
  </span>
</div>
```

- `<i>` 保留 `tx-stat-card__icon` 类名与 `ref="iconRef"`（单测 `:49` 与取色逻辑都依赖）。
- 删除 `.tx-stat-card__decoration` / `__glow` / `__icon-layer` 及其样式；`--tx-stat-card-icon-opacity(-hover)` 不再读取。
- progress 变体结构不变（环 + 环心图标），只改取色与槽位变量（见下）。

## 槽位（徽章与圆环共用）

- 根上定义 `--tx-stat-card-slot: 72px`、`--tx-stat-card-slot-inset: 18px`。`.tx-stat-card__badge` 与 `.tx-stat-card__progress` 都是 `position: absolute; right: var(--tx-stat-card-slot-inset); top: 50%; translateY(-50%); size: var(--tx-stat-card-slot)`（圆环原来的字面量改为读变量，几何不变）。
- 徽章本体 `__badge-body` 居中于槽位，初值 56px、圆角 16px（浏览器里定稿）；`__halo` 为槽位中心的径向光池，可超出槽位，在卡片圆角处柔和收住（卡片 `overflow: hidden` 本来就在）。
- `.fake-background > *` 的全局规则会把直接子元素设成 `relative; z-index: 1`：`__badge` 用 scoped 选择器显式声明 `position: absolute; z-index: 0`。
- **内容不压槽位**：`.tx-stat-card__badge ~ .tx-stat-card__content` 与 `.tx-stat-card__progress ~ .tx-stat-card__content` 右侧预留 `slot + inset + 8px`。

## 窄卡（容器查询）

- 根 `container-type: inline-size`（卡片本身 `width: 100%`，宽度由父级决定，内联尺寸包含不影响现有布局；在 `fit-content` 父级里会塌陷——文档注明）。
- `@container (max-width: 239px)`：槽位缩到 36px，移到右上角（`top: 12px; right: 12px; transform: none`），内容取消右侧预留；顶对齐的标签（insight / progress 的 `label--top`）右侧留 44px；默认变体内容贴底，角落本来就空。徽章本体 36px、圆角 11px、图标 18px；圆环内盘 inset 按比例缩小，环宽随 `radial-gradient` 百分比自动缩放。
- 阈值 240px 是初值：core-app 插件存储页 4 列（估算 120–160px）、ProviderRegistry 5 列、TemplateDashboard 5 列进窄态；画廊 320px、core-app 插件功能页 2 列（260–338px）保持宽态。浏览器实测后定稿。

## 取色

- 保留"挂载 / `iconClass` / `variant` 变化时读 `<i>` 计算色 → 根上 `--tx-stat-card-icon-color` + `tx-stat-card--tinted`"的机制（任何图标类都适用，单测 `:133–158` 不动）。
- **主题切换重读**：模块级共享一个 `MutationObserver`（`document.documentElement`，`attributeFilter: ['class', 'data-theme']`）与 `matchMedia('(prefers-color-scheme: dark)')`，挂载的卡片订阅、卸载退订，变化后下一帧重读。无 `window` 时不建（SSR 安全）。
- **默认墨色写在父层**：`__badge` 与 `__progress-inner` 上 `color: var(--tx-color-primary)`，`<i>` 继承；宿主颜色类落在 `<i>` 上照常胜出。因此不带颜色类的图标得到主色徽章，显式灰色（含 `--tx-color-info`）得到中性徽章。
- **progress 跟随取色**：`--tx-stat-card-progress-color: var(--tx-stat-card-icon-color)`；删掉 `.tx-stat-card__progress-icon` 上压过宿主颜色类的 `color`。`ComponentsOperationsStatusDemo` 的 success / warning / danger 环因此按调用方的本意着色。

## 徽章材质

| 部件 | 中性（未着色） | 着色（`--tinted`） |
| --- | --- | --- |
| `__badge-body` 底 | `var(--tx-fill-color-light)` | `linear-gradient(145deg, icon 30% → icon 10%)`（左上亮、右下暗，与全局光源一致） |
| ring / 高光 | `inset 0 0 0 1px var(--tx-border-color-lighter)` | `inset 0 0 0 1px icon 34%` + `inset 0 1px 0 var(--tx-color-white) 18%` |
| 投影 | 无 | `2px 4px 14px icon 26%`（1:2，过 `shadow-light-source`） |
| `__halo` | 不显示 | `radial-gradient(closest-side, icon 30%, transparent)`，挂载淡入到 0.7，hover 到 1 |
| 图标 | 继承 / 宿主色 | 同左 |

（`icon N%` = `color-mix(in srgb, var(--tx-stat-card-icon-color) N%, transparent)`；不在 `<i>` 上画背景，多色图标集不会被顶掉，Nexus 图标层异步到达前也不会出现实心方块。）

图标尺寸由组件决定：`.tx-stat-card__icon { font-size: 28px }`（(0,2,0)，继续压住宿主 `text-6xl`），`<i>` 是 flex 项，宽高生效。

## 动效

- hover：`__badge-body` `translateY(-2px)`（transform 过渡）；`__halo` opacity 增强；`__badge-body::after` 一道斜向高光从左到右扫过一次（hover 态才带 transform 过渡，离开时瞬间复位，所以每次 hover 只扫一次）；根描边颜色即时变化（保留字面量 `.tx-stat-card:hover {` 规则，单测 `:53`）。
- 挂载：`--glow-in` 让光晕 0.6s 淡入（沿用现有 `triggerGlow`）。
- reduced-motion：第一个 `@media (prefers-reduced-motion: reduce)` 块的第一条规则选择器列表为 `.tx-stat-card__halo, .tx-stat-card__badge-body, .tx-stat-card__badge-body::after, .tx-stat-card__progress-ring { transition: none; }`（`__progress-ring` 必须在最后，单测 `:188–190` 的正则）；另外取消 hover 浮起与扫光（`::after` 不移动）。静止帧完整：光晕在 `--glow-in` 后直接是终态。

## 体积

替换水印 + 柔光约 1.4 KB，徽章 + 容器查询 + 取色调整预计 1.5–1.8 KB；`audit:size` 余量约 1.1–1.9 KiB。Tabs 子任务删除关键帧会释放更多空间；若本子任务先落地时超限，按门禁要求带日期说明重设基线，或精简扫光规则。

## 修订 v3：右侧色光（取代徽章，2026-09-26）

**DOM**（默认 / insight 与 progress 变体都有色光；progress 的环画在色光之上）：

```vue
<div v-if="iconClass" class="tx-stat-card__aura" aria-hidden="true">
  <span class="tx-stat-card__aura-blob is-a" />
  <span class="tx-stat-card__aura-blob is-b" />
  <span class="tx-stat-card__aura-blob is-c" />
</div>
<!-- 默认 / insight：图标直接放在槽位里，无框 -->
<div v-if="iconClass && !isProgressVariant" class="tx-stat-card__glyph" aria-hidden="true">
  <i ref="iconRef" class="tx-stat-card__icon" :class="iconClass" />
</div>
```

删除 `__badge` / `__badge-body` / `__halo` 及其样式（ring、内高光、1:2 投影、扫光、hover 浮起）。

**色光**：
- `.tx-stat-card__aura`：`position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; border-radius: inherit`；`mask-image: linear-gradient(to left, #000 0%, #000 20%, transparent 72%)`（带 `-webkit-`），色光只在右侧、向文字方向渐隐；默认 `opacity: 0`，`.tx-stat-card--tinted.tx-stat-card--glow-in` 时 `opacity: 1`（0.8s 淡入，这是挂载状态变化，不是 hover）。
- 三团色斑 `.tx-stat-card__aura-blob`：`position: absolute; border-radius: 50%; filter: blur(22px); will-change: transform`；只用 `transform` 做动画（模糊在本地空间先算，变换动画可复用栅格，不会每帧重算模糊；**不要**动 `border-radius` / 尺寸 / `filter`）。
  - `is-a`：宽 60%（`aspect-ratio: 1`），`right: -14%; top: -34%`，`background: color-mix(in srgb, var(--tx-stat-card-icon-color) 55%, transparent)`，17s；
  - `is-b`：宽 48%，`right: 12%; bottom: -44%`，色相偏移 `oklch(from var(--tx-stat-card-icon-color) l c calc(h + 42))` 取 45% 透明度（`@supports not (color: oklch(from red l c h))` 时回落为图标色 35%），21s，负延迟错开相位；
  - `is-c`：宽 32%，`right: 6%; top: 26%`，提亮 `color-mix(in oklch, var(--tx-stat-card-icon-color) 50%, var(--tx-color-white, #fff))` 取 40%，13s。
  - 各自一个 `@keyframes`：`translate(±10–18%) rotate(30–60deg) scale(0.9–1.2)`，`ease-in-out infinite alternate`，周期互不整除，叠加后读起来是持续形变的色场。
- 未着色（灰色）图标：色光层保留（静止时 opacity 0），只把色斑设为 `display: none`。实现时改的：整层 `display: none` 的话，`--tinted` 与 `--glow-in` 会在同一帧样式计算前一起加上，从 `display: none` 出来的元素没有起始透明度，挂载淡入永远不会播。视觉结果相同：灰色卡什么都不画、不跑动画。
- reduced-motion：`.tx-stat-card__aura-blob { animation: none }`，静止帧就是三团色斑的初始构图，完整可见；色光淡入的 transition 也关掉。

**图标**：`.tx-stat-card__glyph` 占槽位（`right: var(--tx-stat-card-slot-inset)`，垂直居中，窄态移到右上角，同之前的槽位规则）；默认墨色 `color: var(--tx-color-primary)` 写在 `__glyph` 上，`<i>` 继承、宿主颜色类照常胜出；字号 30px（窄态 18px）；无底板、无投影、无光晕。

**hover**：卡片没有 hover 动效；保留字面量 `.tx-stat-card:hover {`（根描边即时提亮，单测 `:53` 需要）。

**取色 / 主题 / KeepAlive / 对比度**：沿用 v2 的机制（`theme-change.ts`、`onActivated`、空值保留）。
