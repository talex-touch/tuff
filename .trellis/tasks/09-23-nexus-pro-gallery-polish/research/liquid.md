# Research: Liquid（TxLiquid + TxLiquidItem）

- **Query**: 源码/API、渲染与动画、demo、当前格子为什么看起来像坏了、紧凑提案
- **Scope**: internal（源码 + ego 实测，包括在文档 demo 上换 fill 的现场试验）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/liquid/src/TxLiquid.vue` | 群组：silhouette SVG（goo 滤镜 + 阴影）+ melt overlay + slot |
| `packages/tuffex/packages/components/src/liquid/src/TxLiquidItem.vue` | 公共 item，按条件分派到 Mirrored / Observed |
| `packages/tuffex/packages/components/src/liquid/src/LiquidMirroredItem.vue` | 由 x / y / scale 驱动的镜像模式（默认） |
| `packages/tuffex/packages/components/src/liquid/src/LiquidObservedItem.vue` | observe / move / shape / dissolve 走测量引擎 |
| `packages/tuffex/packages/components/src/liquid/src/{types,filter-primitives,shadow,spring,tuning,observer,geometry,context,use-reduced-motion}.ts` | 类型、滤镜链、阴影解析、弹簧、引擎 |
| `apps/nexus/app/components/content/demos/LiquidMorphMenuDemo.vue`、`LiquidMoveTrailDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/liquid.{en,zh}.mdc` | 文档 |

### 公共 API

**TxLiquid**（TxLiquid.vue:20-26）

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `blur` | `number` | `6` | goo 模糊 σ，决定多远开始桥接 |
| `contrast` | `number` | `18` | alpha 斜率 |
| `fill` | `string` | `'#fff'` | 液体颜色，可用 `var()`（写成 `<g>` 的 `style.fill`） |
| `shadow` | `string` | — | box-shadow 语法，在 JS 里解析（shadow.ts:41-58）：数字必须是字面长度；无 inset 且 spread 为 0 的层 → svg 上的 CSS `drop-shadow()`；inset / spread 层 → SVG `feFlood flood-color` |
| `filterPadding` | `number` | `24` | 滤镜区域余量 |

默认 slot；无 emit / expose / CSS 变量。

**TxLiquidItem**（TxLiquidItem.vue:17-29）

| prop | 类型 | 默认 |
|---|---|---|
| `effect` | `'morph' \| 'move'` | `'morph'` |
| `morph` | `MorphTuning { shape, speed, bounce, contentBlur, advanced }` | — |
| `move` | `MoveTuning { springiness, wobble, stretch, trail, advanced }` | — |
| `dissolve` | `boolean \| number \| DissolveOptions` | — |
| `x` / `y` / `scale` | `number` | `0` / `0` / `1` |
| `transition` | `'snappy' \| 'smooth' \| 'bouncy' \| SpringConfig \| { duration, ease }` | `'smooth'` |
| `delay` | `number` | `0` |
| `observe` | `boolean` | `false` |
| `radius` | `number \| [tl, tr, br, bl]` | 取第一个子元素的计算圆角 |

必须放在 `TxLiquid` 里（否则抛错）。class 等属性透传到包装元素 `div.tx-liquid-item`（inline-block，transform 由 JS 管理）。

### 渲染与动画

- 群组 `div.tx-liquid`（relative + isolation）；silhouette SVG 在 z-index −1，位于所有子元素之下（103-127）；goo 链：`feGaussianBlur σ=blur` → alpha 矩阵（contrast，截距 `0.5 − contrast × 5/12`）→ `SourceGraphic atop goo`（filter-primitives.ts:90-139）；melt overlay 在 z-index 9999。
- 镜像 item：blob 是按包装元素 offset 盒生成的 rect / path，圆角取第一个子元素；x / y / scale 变化时，用弹簧编译出的缓动在同一个 rAF 时钟里同时驱动元素和 blob（LiquidMirroredItem.vue:140-165）。**挂载时直接写 transform，没有入场动画**（171-182）。
- 弹簧预设（spring.ts:31-35）：snappy 480/34，smooth 190/26，bouncy 320/17。reduced motion 下过渡变为瞬时。
- 前提：item 内容背景透明（液体本身就是表面）；fill 与页面有对比；群组盒子容得下位移；桥接需要 blur ≳ 间距。

### 当前格子（研究时 2929-2947 行）为什么"坏了"（实测）

```vue
<TxLiquid>
  <TxLiquidItem v-for="tileIndex in 3" :key="tileIndex">
    <div class="docs-gallery__tile">{{ tileIndex }}</div>
  </TxLiquidItem>
</TxLiquid>
```

- 没有 x / y → 永远不动，液体效果只剩一块静态剪影。
- inline-block 包装之间的空白被模板压缩 → 间距为 0；群组实测 86.3×34，三个 tile 贴在一起，blob 合并成一整块。
- 默认 fill `#fff`：σ6 模糊后阈值约落在 alpha 0.39-0.44，剪影比每个 tile 的边多出约 1px，并在 tile 之间桥接 → 白色亮边；tile 自己的不透明底（`--tx-fill-color-lighter` #1d1d1d）和边框盖住其余部分 → 就是"挤在一起 + 白色亮描边"。
- 亮色：白色液体在白页面上看不见（截图），只剩 tile。

### 现有 demo

- `LiquidMorphMenuDemo.vue`：TxLiquid 240×168，blur 8，fill `var(--tx-bg-color, #fff)`，shadow `0 2px 8px rgba(0,0,0,.14), inset 0 0 0 1px rgba(127,127,127,.12)`；4 个 item `position: absolute; left: calc(50% - 24px); bottom: 16px`；卫星 ✦ ☾ ♪ 展开到 (−64,−44)、(0,−76)、(64,−44)，`transition="bouncy"`，delay 0 / 40 / 80；主按钮 ＋ 切换 `open` 并旋转 45°；按钮是 48×48 的 `TxButton circle variant="ghost" :border="false"`。
- `LiquidMoveTrailDemo.vue`：TxLiquid 240×56，blur 7，fill `var(--tx-bg-color)`；一个 `effect="move" :move="{ trail: 0.6 }"` 的 item，48×40 胶囊 thumb 用 CSS transition 平移到 [8, 96, 184]，下方按钮 1-3。
- 暗色实测：fill #141414 叠在 #121212 上，几乎只剩 inset 圈；在页面里把 demo 的 `<g>` fill 改成 `var(--tx-fill-color)`（#303030）后，气泡清晰可见。移动途中的 goo 桥接大约在 100-300ms 可见（bouncy 约 0.4s 收敛）。收起时卫星叠在透明主按钮下面，字形会透出来。

### 紧凑提案：迷你 morph 菜单（群组 220×132）

```vue
<TxLiquid
  class="docs-gallery__liquid"
  :blur="8"
  fill="var(--tx-fill-color)"
  shadow="1px 2px 8px rgba(0, 0, 0, 0.24), inset 0 0 0 1px rgba(127, 127, 127, 0.16)"
>
  <TxLiquidItem
    v-for="(item, index) in liquidItems"
    :key="item.icon"
    class="docs-gallery__liquid-slot"
    :x="liquidOpen ? item.x : 0"
    :y="liquidOpen ? item.y : 0"
    transition="bouncy"
    :delay="index * 40"
  >
    <TxButton circle variant="ghost" :border="false" :icon="item.icon" :aria-label="item.label" class="docs-gallery__liquid-btn" />
  </TxLiquidItem>
  <TxLiquidItem class="docs-gallery__liquid-slot">
    <TxButton
      circle
      variant="ghost"
      :border="false"
      icon="i-carbon-add"
      class="docs-gallery__liquid-btn docs-gallery__liquid-main"
      :class="{ 'is-open': liquidOpen }"
      :aria-label="copy.liquidToggle"
      :aria-expanded="liquidOpen"
      @click="liquidOpen = !liquidOpen"
    />
  </TxLiquidItem>
</TxLiquid>
```

```ts
const liquidOpen = ref(false)
const liquidItems = computed(() => [
  { icon: 'i-carbon-star', x: -56, y: -34, label: '' /* copy */ },
  { icon: 'i-carbon-moon', x: 0, y: -62, label: '' },
  { icon: 'i-carbon-music', x: 56, y: -34, label: '' },
])
```

```css
.docs-gallery__liquid { width: 220px; height: 132px; }
.docs-gallery__liquid-slot { position: absolute; left: calc(50% - 20px); bottom: 10px; }
.docs-gallery__liquid-btn { width: 40px; height: 40px; }
.docs-gallery__liquid-main { transition: rotate 260ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.docs-gallery__liquid-main.is-open { rotate: 45deg; }
@media (prefers-reduced-motion: reduce) { .docs-gallery__liquid-main { transition: none; } }
```

- 颜色：`--tx-fill-color`（暗 #303030 / 亮 #f0f2f5）两种主题都可见（暗色已在页面里实测）。阴影按单一光源 x:y = 1:2，用字面 rgba（解析器只认字面长度；inset spread 层会变成 SVG `flood-color` 属性，那里能不能用 `var()` 未验证）。
- 40px 按钮下，顶部卫星上沿距群组顶部 132 − 10 − 40 − 62 = 20px，不会出界。
- 主按钮放最后，收起时盖在卫星上面（同 demo）；卫星字形透出的问题仍在，可选：收起时让卫星 opacity / scale 变小。
- 重播：key 重挂载不会有动画（挂载时直接写 transform），`liquidOpen` 也会保留。想让人一眼看懂，需要：(a) 仿 ProgressBar 定时自动开合（reduced motion 下不启动），或 (b) hover 格子时展开，或 (c) reset 时同时重置 `liquidOpen`（当前的包装组件做不到）。
- 备选：Move trail（240×56 + 按钮行，约 100px 高），`effect="move" :move="{ trail: 0.6 }"`，thumb 在几个位置之间自动循环；水滴拖尾最能看出"液态"，同样需要状态变化才看得到。

## Caveats / Not Found

- `liquidToggle` 和三个卫星的 aria-label 都是新文案 key，需补 zh / en。
- 提案里的几何（220×132、±56 / −34 / −62）是按 demo 比例缩放推算的，未在浏览器实测。
