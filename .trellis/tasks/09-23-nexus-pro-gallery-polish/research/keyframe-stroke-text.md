# Research: KeyframeStrokeText

- **Query**: 源码/API、动画原理与颜色/时序 prop、现有 demo、画廊格子为什么难看、紧凑 specimen 提案
- **Scope**: internal（源码 + ego 实测）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/keyframe-stroke-text/src/TxKeyframeStrokeText.vue` | 组件（198 行） |
| `packages/tuffex/packages/components/src/keyframe-stroke-text/src/types.ts` | `KeyframeStrokeTextProps` |
| `packages/tuffex/packages/components/src/keyframe-stroke-text/index.ts` | 导出 `KeyframeStrokeText` / `TxKeyframeStrokeText` / `TxKeyframeStrokeTextInstance` |
| `packages/tuffex/packages/components/src/keyframe-stroke-text/__tests__/keyframe-stroke-text.test.ts` | 单测（`getBBox` 被 mock 成常量） |
| `apps/nexus/app/components/content/demos/KeyframeStrokeTextKeyframeStrokeTextDemo.vue`、`KeyframeStrokeTextChineseDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/keyframe-stroke-text.{en,zh}.mdc` | 文档 |

### 公共 API（TxKeyframeStrokeText.vue:10-19）

| prop | 类型 | 默认 |
|---|---|---|
| `text` | `string` | `''`（为空时渲染 NBSP） |
| `strokeColor` | `string` | `'#4C4CFF'` |
| `fillColor` | `string` | `'#111827'` |
| `durationMs` | `number` | `1800` |
| `strokeWidth` | `number` | `2`（同时决定 viewBox 内边距 `max(4, strokeWidth * 3)`） |
| `fontSize` | `string \| number` | `64`（数字转 px） |
| `fontWeight` | `string \| number` | `700` |
| `fontFamily` | `string` | `'inherit'` |

无 slot、无 emit、无 expose。根是 `<svg role="img" :aria-label="text">`。根上内联的 CSS 变量（51-68）：`--tx-kf-stroke-color`、`--tx-kf-fill-color`、`--tx-kf-duration`、`--tx-kf-stroke-width`、`--tx-kf-stroke-length`（= `getComputedTextLength()`）、`--tx-kf-font-size`、`--tx-kf-font-weight`、`--tx-kf-font-family`、`--tx-kf-view-height`。

### 渲染与动画

- 三层 `<text>`：measure（opacity 0）、stroke（fill 透明，`stroke-dasharray` / `stroke-dashoffset` = `--tx-kf-stroke-length`）、fill（147-163）。
- 只有挂载时的入场动画（`forwards`）：描边 `stroke-dashoffset` 从 L 到 0，占时长的 0-70%（`cubic-bezier(.65,0,.35,1)`）；填充 opacity 在 55% 之前为 0，55-100% 淡入（165-185）。`prefers-reduced-motion` 直接给最终态（187-197）。
- 颜色完全由调用方给；默认值是为亮色底设计的（深藏青填充）。
- `preserveAspectRatio="xMinYMid meet"`（96 行）；高度取实测 viewBox 高度，宽度 auto 按比例。
- 描边时序实测（replay 之后）：60ms dashoffset 102.1 → 500ms 79.7 → 1000ms 5.8 → 1900ms 0，此时 fill opacity 1。

### 当前格子（研究时 2915-2927 行）为什么难看

```vue
<TxKeyframeStrokeText text="Tuffex" :font-size="34" />
```

1. **组件 bug：测量不幂等（造成"偏左"，实际还偏上）。** `syncMetrics()`（34-49）对 measure `<text>` 调 `getBBox()`，但这个 `<text>` 本身渲染在 `:x="textX" :y="textY"`（103-104），随后又设 `textX = padding - bbox.x`、`textY = padding - bbox.y`。第一次调用（文字还在 0,0）结果正确；render flush 把偏移写进 DOM 之后再调用，量到的就是已偏移的框，textX / textY 回到 ≈0。调用顺序：immediate watch（70-77）和 onMounted（79-88）都在 flush 前执行，结果正确；onMounted 里排进队列的 `document.fonts.ready.then(syncMetrics)` 在 flush 之后执行 → 最终值 ≈0。
   - 画廊实测：viewBox `0 0 114.17 52.00`，`x="0" y="0.65"`，`getBBox()` = [0, −32.4, 102.2, 40] → 字形画在 SVG 框上方 32px，贴左，右侧空出 12px（SVG 框本身是居中的：舞台 904-1322，框 1056-1170）。
   - 组件自己的文档页同样复现：三个 demo 都是 x≈0、y≈0，字形分别在框上方 54 / 40 / 39px。
   - reset 后 60ms 就已经是 x=0、y=0.65，重挂载规避不了。
   - 单测把 `getBBox` mock 成与 x / y 无关的常量（测试 11-16 行），所以测不出来。
2. **默认颜色在暗色下看不见。** 填充 `#111827` ≈ 页底 `#121212`；填充层盖住 2px 描边的内半边 → 只剩一圈细的 `#4C4CFF` 轮廓。文档 prop 表本来就写了"深色背景请选高对比 strokeColor"。
3. **描边虚线长度按整词步进宽度计算。** `--tx-kf-stroke-length` = `getComputedTextLength()`（"Tuffex" 34px 时为 102px）。放大截图可见只有 'e' 外轮廓底部缺一段，其余字形完整 → 推断虚线按字形轮廓重新起算，长于 102px 的轮廓在动画结束后仍留缺口。这个比例与字号无关（两者同比缩放），只有更长的文本（更大的步进宽度）能避免。
4. 页面加载时（ClientOnly 挂载）播放一次约 1.8s，用户滚到这里时早已结束。

### 现有 demo

- `KeyframeStrokeTextKeyframeStrokeTextDemo.vue`：纵向 flex gap 18；"TuffEx" 56px 默认色；"Stroke + Fill" stroke `#0ea5e9`、fill `#0f172a`、2400ms、strokeWidth 1.8、42px、600。
- `KeyframeStrokeTextChineseDemo.vue`："关键帧描边动画" stroke `#16a34a`、fill `#14532d`、2600ms、1.6、40px、700。
- 填充都是深色（只适合亮色）；第一个 demo 的 SVG 被纵向 flex 拉伸到 782px 宽，再加上 xMin 对齐，整体贴左。

### 紧凑 specimen 提案（362×140 舞台）

前提：先在 tuffex 源码里修好问题 1（让 `syncMetrics` 幂等，例如用 bbox 减去当前已应用的 textX / textY，或者测一个始终在原点的 text），并重建 dist。

```vue
<TxKeyframeStrokeText
  text="Talex Touch"
  stroke-color="var(--tx-color-primary)"
  fill-color="var(--tx-text-color-primary)"
  :stroke-width="1.5"
  :font-size="44"
  :font-weight="700"
  :duration-ms="2400"
/>
```

- 颜色走令牌：暗色 `#409eff` 描边 → 填充 `#e5eaf3`；亮色 `#409eff` → `#303133`，两种主题都高对比。（`var()` 经内联的 `--tx-kf-*` 变量传到 `stroke` / `fill`，属标准 CSS 变量解析，未单独在浏览器验证。）
- 11 个字符，步进宽度约 250px（估算），大于单个字形轮廓长度，可避开问题 3；高度约 64px，放得下。若继续用 "Tuffex"，'e' 的缺口会保留。
- 重播：可以（新节点会重启 CSS 动画，已实测）。

## Caveats / Not Found

- "虚线按字形轮廓重新起算"是根据截图推断的 Chrome 行为，没有找到规范出处。
- 44px 下的文本宽度是估算值，未实测。
