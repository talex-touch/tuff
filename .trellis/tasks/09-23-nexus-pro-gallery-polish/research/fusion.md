# Research: Fusion 格子静止时完全空白的根因与方案

- **Query**: 画廊 Fusion 格子（`trigger="hover"`，slot a/b 各一个圆形 TxButton）静止时什么都看不见。查清原因并给出紧凑、暗/亮色可读、能一眼看出"融合"的 specimen。
- **Scope**: internal（源码 + 数值计算 + Chromium 源码核对滤镜区域）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/fusion/src/TxFusion.vue` | 组件（198 行） |
| `packages/tuffex/packages/components/src/fusion/src/types.ts` | `FusionTrigger = 'hover' \| 'click' \| 'manual'`、`FusionDirection = 'x' \| 'y'` |
| `packages/tuffex/packages/components/src/fusion/__tests__/fusion.test.ts` | slot 渲染、CSS 变量、滤镜接线、时长钳制、hover/click/manual/disabled |
| `apps/nexus/app/components/content/demos/Fusion*.vue` | 5 个 demo（见下） |
| `apps/nexus/content/docs/dev/components/fusion.{en,zh}.mdc` | 文档页 |
| `packages/tuffex/packages/components/src/button/src/style/index.scss` | `.tx-button.circle` 32×32、`background-color: transparent`、1px 边 |
| `packages/tuffex/packages/components/style/index.scss` | `.fake-background::before`（TxButton 的半透明底，`opacity: var(--fake-opacity, .75) !important`） |

### API

| Prop | Type | Default |
|---|---|---|
| `modelValue` | `boolean \| undefined` | `undefined`（不传则内部状态） |
| `disabled` | `boolean` | `false` |
| `trigger` | `'hover' \| 'click' \| 'manual'` | `'hover'` |
| `direction` | `'x' \| 'y'` | `'x'` |
| `gap` | `number`(px) | `40`（静止时两块中心相距 gap，各平移 ±gap/2） |
| `duration` | `number`(ms) | `260` |
| `easing` | `string` | `'cubic-bezier(0.2, 0.8, 0.2, 1)'` |
| `blur` | `number` | `19`（`feGaussianBlur stdDeviation`） |
| `alpha` | `number` | `29`（颜色矩阵 alpha 乘数） |
| `alphaOffset` | `number` | `-10`（颜色矩阵 alpha 偏移） |

- **Slots**：`a`、`b`（无 slot props）。**Emits**：`update:modelValue`、`change`。**Expose**：无。
- **CSS 变量**（写在 `.tx-fusion__stage`）：`--tx-fusion-duration`、`--tx-fusion-easing`、`--tx-fusion-gap`。
- 结构：`div.tx-fusion`（inline-block；仅 click 模式有 `role="button"`/tabindex/aria-pressed）→ 0×0 SVG `<filter>`：`feGaussianBlur(SourceGraphic, blur)` → `feColorMatrix(alpha 行 = [0 0 0 alpha alphaOffset])` → `.tx-fusion__goo`（`filter: url(#id)`，grid 单格）→ 两个 `.tx-fusion__blob` 叠在同一格，`transform: translate3d(∓gap/2, 0, 0)`；`.is-active` 时都回到 `translate3d(0,0,0) scale(1.02)`，`transition: transform var(--tx-fusion-duration) var(--tx-fusion-easing)`，`will-change: transform`。
- 动画：只有 active 切换时的平移过渡；没有入场/循环动画，也没有 reduced-motion 分支（transition 本身不受控）。
- 滤镜链最后一步就是阈值化后的模糊图（没有 `feComposite` 把清晰原图叠回去）→ **slot 里的文字、图标、边框都会被模糊掉**，只适合纯色块。

### 根因：goo 阈值把 32px 按钮整个抹掉（定量）

颜色矩阵输出 `α' = clamp(alpha·A + alphaOffset, 0, 1)`，默认 `α' = 29·A − 10`，其中 `A` 是高斯模糊后的 alpha。可见需 `A > 10/29 ≈ 0.345`，完全不透明需 `A ≥ 11/29 ≈ 0.379`。

实心圆盘（半径 r、不透明度 a）模糊后中心 `A = a·(1 − e^(−r²/2σ²))`。σ=19：32px 实心圆（r=16）中心只有 **0.296**，已低于阈值——即使是完全不透明的 32px 圆也会消失。

当前格子里的 TxButton circle（32px）：`background-color: transparent` + 1px 边 + `.fake-background::before` 以 `--tx-fill-color-lighter`（暗色 #1d1d1d）75% 不透明 + 16px 线条图标。按像素卷积计算（`/tmp/goo_calc.py`，1px 网格，σ=19）：

| 位置 | 模糊后 A | 输出 α' |
|---|---|---|
| 静止，按钮 a 中心（x=−20） | 0.278 | **0** |
| 静止，两者之间（x=0） | 0.303 | **0** |
| 激活（两者重合）中心 | 0.241 | **0** |

→ 静止与悬停后都完全不可见，格子全空。即使可见，颜色也是 #1d1d1d 贴暗色页面，同样看不出来。

阈值对尺寸的要求（实心圆，默认 σ=19 / 29 / −10）：r=16 → 不可见；r=24（48px）→ 可见半径≈22；r=28 → ≈28；r=36 → ≈38。换成经典 goo 参数 σ=10 / 18 / −7：r=14 → ≈12，r=16 → ≈15，r=20 → ≈20，r=28 → ≈29（小块基本保持原尺寸）。

### 滤镜区域是否会裁掉平移出去的色块（已核对，Chrome 下不会）

`<filter>` 未设 x/y/width/height，默认 objectBoundingBox 的 −10%/120%。担心点：`.tx-fusion__goo` 的盒子只有最大 blob 那么大，blob 平移 ±gap/2 会出界。Chromium `third_party/blink/renderer/core/paint/paint_layer.cc`：`UpdateFilterReferenceBox()` 用 `LocalBoundingBoxIncludingSelfPaintingDescendants()`，其中 `ExpandRectForSelfPaintingDescendants` 会把带 transform 的自绘子层按其变换后矩形并入（blob 有 `will-change: transform`，是独立层）。所以在 Chrome 中参考框已包含平移后的 blob，不会被裁。Firefox 未核对。

### Nexus demos（全部用大尺寸、纯色/半透明色块，参数统一 `:blur="19" :alpha="29" :alpha-offset="-10"`）

| Demo | 内容 | 尺寸 / gap / trigger |
|---|---|---|
| `FusionFusionDemo.vue` | 深蓝径向渐变 320px 高舞台；紫色 260px 圆 + 黄绿 110px 圆（hsla ~0.76 α）；下方另一组 92×56 药丸（primary / success）纵向 | gap 240 hover + 外部 Toggle 按钮；第二组 gap 46 `direction="y"` click |
| `FusionFusionAvatarBadgeDemo.vue` | 84px 主色渐变"头像"TA + 34px 危险色"8" badge | gap 64 hover |
| `FusionFusionButtonTooltipDemo.vue` | 主色药丸 "Save ⌘S" + 玻璃气泡 "Saved to drafts"，纵向 | gap 44 `direction="y"` hover + Toggle |
| `FusionFusionChipIconDemo.vue` | 玻璃 "Synced" chip + 40px 绿色 ✓ 圆 | gap 54 hover |
| `FusionFusionMiniCardFabDemo.vue` | 320×108 玻璃卡 + 56px 主色 "+" FAB | gap 92 hover + Toggle |

注：按上面的阈值算，34px 的 badge 在 σ=19 下单独时也接近不可见；带文字的 demo 文字会被模糊。

### 当前画廊格子（研究时 ~2840–2859 行，锚点 `docPath('fusion')`）

```vue
<TxFusion v-model="fusionOpen" trigger="hover">
  <template #a>
    <TxButton circle icon="i-carbon-add" />
  </template>
  <template #b>
    <TxButton circle icon="i-carbon-edit" />
  </template>
</TxFusion>
```

`const fusionOpen = ref(false)`（~542 行）。

### 方案

两个**实心**色块、紧凑 goo 参数，静止时明显分开，激活时融合：

```vue
<TxFusion
  v-model="fusionOpen"
  trigger="manual"
  :gap="72"
  :duration="640"
  :blur="10"
  :alpha="18"
  :alpha-offset="-7"
>
  <template #a><span class="docs-gallery__blob docs-gallery__blob--a" /></template>
  <template #b><span class="docs-gallery__blob docs-gallery__blob--b" /></template>
</TxFusion>
```

（`trigger` 取 `"manual"` 或 `"hover"`，见下方"驱动"。）

```css
.docs-gallery__blob { display: block; border-radius: 999px; }
.docs-gallery__blob--a { width: 64px; height: 64px; background: var(--tx-color-primary); }
.docs-gallery__blob--b { width: 40px; height: 40px;
  background: color-mix(in srgb, var(--tx-color-primary) 45%, var(--tx-color-success)); }
```

- 几何：a 中心 −36（覆盖 −68…−4），b 中心 +36（覆盖 16…56），总宽 ~124px、高 64px，舞台内居中。按同一卷积计算（σ=10、18/−7）：静止时两块中间 x=0 输出 **0**（清晰分离），b 边缘 x=16 约 0.42，两块中心 1.0。对照：若用默认 σ=19 配 72px+48px/gap 84，静止时中间已是 1.0（两块被"粘"成一体），看不出融合前后差别——所以紧凑尺寸下要换小 σ。
- 融合终态是两块完全重合（`translate 0 + scale 1.02`），即只剩大块；看点是 `duration` 期间形成的"颈"。`duration` 放慢到 ~600ms 更易看清。
- 驱动：
  - 自动循环（推荐，一眼可见）：`trigger="manual"` + 周期切换 `fusionOpen`（如 1.6s）。画廊已有 ProgressBar 的 `setInterval` + `prefers-reduced-motion` 早退模式（`onMounted` ~279 行）可照搬；但画廊级定时器不随 reset 重启，想随 reset 从头播放需用函数 ref 或子组件承载定时器。reduced-motion 下保持静止分离态。
  - 或保留 `trigger="hover"`（不传 v-model 也行），加一行 `docs-gallery__muted` 提示"悬停融合"（新增中英文案）。静止态已可见，满足"不空"。
- 颜色只用 token，暗/亮色都成立；色块内不要放文字/图标（会被模糊）。
- reset：组件内部 `internalActive` 仅在非受控时随 remount 归零；受控的 `fusionOpen` 属于画廊状态，不会被 reset 改变。

## Caveats / Not Found

- 数值为 1px 网格离散卷积的近似（脚本在 `/tmp/goo_calc.py`，不入仓），与浏览器实现存在亚像素差异，但结论（32px/σ19 不可见、64+40/σ10 分离清晰）余量足够。
- 未在浏览器目测；建议 ego 中确认静止/激活两态与过渡中的"颈"。
