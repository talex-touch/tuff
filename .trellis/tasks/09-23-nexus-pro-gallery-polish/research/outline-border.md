# Research: OutlineBorder

- **Query**: 源码/API、渲染、demo、当前格子为什么只看到"双层边框"、紧凑提案
- **Scope**: internal（源码 + ego 截图）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/outline-border/src/TxOutlineBorder.vue` | 组件（198 行） |
| `packages/tuffex/packages/components/src/outline-border/src/types.ts`、`index.ts`、`__tests__/outline-border.test.ts` | 类型 / 导出 / 单测 |
| `apps/nexus/app/components/content/demos/OutlineBorderBasicDemo.vue`、`OutlineBorderMaskClipDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/outline-border.{en,zh}.mdc` | 文档 |

### 公共 API（10-25）

| prop | 类型 | 默认 |
|---|---|---|
| `as` | `string` | `'div'` |
| `variant` | `'border' \| 'ring' \| 'ring-offset' \| 'ring-inset'` | `'ring-offset'` |
| `shape` | `'circle' \| 'rect' \| 'squircle'` | `'circle'`（未给 borderRadius 时：circle 9999px / squircle 24% / rect 12px，31-44） |
| `borderRadius` | `string \| number` | — |
| `borderWidth` | `string \| number` | `'1px'` |
| `borderColor` | `string` | `'var(--tx-border-color)'` |
| `borderStyle` | `'solid' \| 'dashed' \| 'dotted'` | `'solid'` |
| `ringWidth` / `ringColor` | — | 回退到 borderWidth / borderColor |
| `offset` | `string \| number` | `'2px'` |
| `offsetBg` | `string` | `'var(--tx-bg-color)'` |
| `padding` | `string \| number` | `0`（加在 `.tx-outline-border__inner`） |
| `clipMode` | `'none' \| 'overflow' \| 'clipPath' \| 'mask'` | `'overflow'` |
| `clipShape` | `'auto' \| 'circle' \| 'rounded' \| 'squircle' \| 'hexagon'` | `'auto'` |

默认 slot；无 emit。根上 CSS 变量：`--tx-outline-radius`、`--tx-outline-padding`。

### 渲染

- 根为 inline-block 带圆角；`border` 写真实 CSS border；三种 ring 写 box-shadow（70-86）：ring `0 0 0 w c`；ring-inset `inset 0 0 0 w c`；ring-offset `0 0 0 o offsetBg, 0 0 0 calc(o + w) c`。
- 内容层裁剪：overflow（圆角 + overflow hidden）、clipPath（圆 / 六边形 polygon / inset round）、mask（圆 / 六边形 / squircle 的 SVG data URI）。
- 没有任何动画。ring 只跟随 border-radius（六边形 mask 外面是一圈圆环，文档交互约定里已注明）。
- `ring-inset` 画在根的背景层，位于 slot 内容之下 → 不透明内容（头像等）会把它完全盖住。

### 当前格子（研究时 2949-2967 行）为什么"没什么特别"

```vue
<div class="docs-gallery__block">
  <TxOutlineBorder border-radius="14px">
    <div class="docs-gallery__tile docs-gallery__overlay-body">{{ copy.installTitle }}</div>
  </TxOutlineBorder>
</div>
```

- 默认 ring-offset：2px 间隙填的是 `--tx-bg-color` #141414（≈ 页底 #121212，看不出来）+ 1px `--tx-border-color` #4c4d4f 的环；tile 本身还有 1px 边 → 两条平行的灰线 = "双层边框"。
- 裁剪圆角 14px，而 tile 自身圆角 8px → 内边框的角被切，两条线不同心。
- 全是中性灰、没有头像或媒体 → 看不出这是"环 / 裁剪工具"；没有动画，reset 也没东西可重播。

### 现有 demo

- Basic：flex wrap gap 18；44px 渐变头像 "TX"（radius 999，`#409eff→#7c3aed`），`ring-width 2`、`ring-color` primary、`offset 2`、`offset-bg var(--tx-bg-color)`；44px 方形头像 "UI"，`variant="border"` 2px `--tx-border-color`、padding 2、`shape="rect"`、radius 12。
- MaskClip：`variant="ring"` 2px primary、`clip-mode="mask"`、`clip-shape="hexagon"`，56px 渐变 "AI"（字面色值）。

### 紧凑提案：带说明的一排变体

```vue
<div class="docs-gallery__row docs-gallery__row--loose">
  <div class="docs-gallery__meter">
    <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="3">
      <TxAvatar name="Talex" :size="44" />
    </TxOutlineBorder>
    <span class="docs-gallery__meter-text">ring-offset</span>
  </div>
  <div class="docs-gallery__meter">
    <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-success)">
      <TxAvatar name="Kiri" :size="44" />
    </TxOutlineBorder>
    <span class="docs-gallery__meter-text">ring</span>
  </div>
  <div class="docs-gallery__meter">
    <TxOutlineBorder
      variant="border"
      shape="rect"
      :border-radius="14"
      :border-width="2"
      :padding="3"
      border-color="var(--tx-color-warning)"
    >
      <TxAvatar name="Ame" :size="40" shape="rounded" />
    </TxOutlineBorder>
    <span class="docs-gallery__meter-text">border</span>
  </div>
  <div class="docs-gallery__meter">
    <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-primary)" clip-mode="mask" clip-shape="hexagon">
      <TxAvatar name="Louis" :size="44" shape="square" />
    </TxOutlineBorder>
    <span class="docs-gallery__meter-text">mask · hexagon</span>
  </div>
</div>
```

- TxAvatar：默认 circle，`size` 可以给数字（px），默认底色 `--tx-fill-color`、字色 `--tx-text-color-primary`；头像保持中性，颜色只放在环上。
- 尺寸约 4×44 + 3×22 ≈ 242 宽、约 70 高。
- 按设计规则"嵌套圆角必须同心"：border 款的内层圆角应为外圆角减去 border + padding；注意组件的 `.tx-outline-border__content` 与外层用同一个 `--tx-outline-radius`（组件层面不同心），需要实测后微调。
- 六边形 mask 外面是圆环（组件已知限制）；观感不好就去掉第 4 个。
- 不要用 `ring-inset`（会被不透明头像盖住）。
- 静态组件：reset 无可重播。可选的互动版：头像选择器（点选后，选中项用 ring-offset primary，画廊 CSS 给 `box-shadow` 加 0.18s 过渡并带 reduced-motion 兜底），能把"选中描边"的用途讲清楚。
- `offsetBg` 默认 `--tx-bg-color`：暗 #141414 对页底 #121212、亮 #fff 对 #fff，两种主题下间隙都读作页面色。

## Caveats / Not Found

- 提案未在浏览器实测；嵌套圆角的具体数值要看渲染结果调整。
