# Research: TuffLogoStroke

- **Query**: 源码/API、描边动画应该是什么样子、demo、当前格子的问题、紧凑提案
- **Scope**: internal（源码 + ego 实测帧）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/tuff-logo-stroke/src/TxTuffLogoStroke.vue` | 组件（271 行） |
| `packages/tuffex/packages/components/src/tuff-logo-stroke/src/types.ts`、`index.ts`、`__tests__/tuff-logo-stroke.test.ts` | 类型 / 导出 / 单测 |
| `apps/nexus/app/components/content/demos/TuffLogoStrokeModesDemo.vue`、`TuffLogoStrokePaletteDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/tuff-logo-stroke.{en,zh}.mdc` | 文档 |

### 公共 API（10-19）

| prop | 类型 | 默认 |
|---|---|---|
| `size` | `string \| number` | `120`（宽高，数字转 px） |
| `mode` | `'once' \| 'breathe' \| 'hover' \| 'loop'` | `'once'`（`loop` 归一为 `breathe`，21-25） |
| `durationMs` | `number` | `2200`，写入 `--tx-tuff-logo-duration` |
| `strokeColor` | `string` | `'#4C4CFF'` |
| `fillStartColor` / `fillEndColor` | `string` | `'#199FFE'` / `'#810DC6'` |
| `outerStartColor` / `outerEndColor` | `string` | `'#D73E4D'` / `'#7F007F'` |

无 slot / emit / expose；`aria-label` 写死为 "Tuff logo stroke animation"；渐变与滤镜 id 用 `useId()` 按实例生成。

### 画的是什么（viewBox 100×100，59-109）

1. `__outline`：70×70、rx 30 的圆角方（接近圆），`strokeColor` 2 单位，**高斯模糊 σ4** → 呈柔光晕，而不是一条线。
2. `__ring`：r=32 的圆，描边为 `radialGradient`（outerStart→outerEnd，stop-opacity 0.4），4 单位。渐变半径 = bbox 的 50% ≈ 32，圆环正好落在 100% 端 → 实际颜色 ≈ `outerEndColor` 的 40%（暗紫），`outerStartColor` 几乎看不到。
3. `__core-stroke`：波浪"水滴"路径，线性渐变（fillStart→fillEnd，旋转 45°）描边 2.5 单位。
4. `__core-fill`：同一路径，渐变填充 + σ4 模糊。

### 时间线（129-250；replay 后实测）

- **once**：outline 在 0-45% 画完，ring 20-70%，core 描边 40-100%，fill 60-100% 淡入，之后静止。实测：800ms 时 outline 已完成、ring 46/100；1500ms ring 完成、core 62/100、fill 0.26；2400ms 全部完成。
- **breathe / loop**：同样入场，之后从 0.82×时长起整个 svg `scale 1→1.03` + `brightness 1.08 saturate 1.1` 脉动，周期 1.2×时长，无限循环。
- **hover**：静止时所有描边 dashoffset 为 100（不可见），fill opacity 0.14（只有淡淡一团）；悬停时播放入场；移开立即复位。
- reduced motion：直接画完，不脉动。
- 最终效果：模糊蓝光晕 + 暗紫圆环里的发光球，中间是清晰的渐变水滴轮廓和模糊的渐变填充。

### 当前格子（研究时 3025-3037 行）的问题

```vue
<TxTuffLogoStroke :size="72" />
```

- mode once，页面加载时播放 2.2s；72px 时描边只有 1.4-1.8px，模糊约 2.9px，最终帧就是一个紫色发光小球（截图），看不出"描边绘制"，也看不出有几种模式。reset 能重播（已验证），但只有一个 logo，而且播完后仍是那个小球。

### 现有 demo

- Modes：3 个 84px（once / breathe / hover），标签 en 为 "once / breathe / hover me"，zh 为 "once / 入场一次"、"breathe / 循环呼吸"、"hover / 悬停触发"；flex wrap gap 18，每项纵向 gap 8，说明文字 12px、opacity .72。
- Palette：128px breathe 2800ms，stroke `#3b82f6`，fill `#0ea5e9→#8b5cf6`，outer `#fb7185→#7e22ce`（颜色更亮）。

### 紧凑提案

```vue
<div class="docs-gallery__row docs-gallery__row--loose">
  <div v-for="mode in logoModes" :key="mode.value" class="docs-gallery__meter">
    <TxTuffLogoStroke :size="64" :mode="mode.value" />
    <span class="docs-gallery__meter-text">{{ mode.label }}</span>
  </div>
</div>
```

```ts
const logoModes = computed(() => [
  { value: 'once' as const, label: 'once' },
  { value: 'breathe' as const, label: 'breathe' },
  { value: 'hover' as const, label: copy.value.hoverMe }, // en 'hover me' / zh '悬停'
])
```

- 尺寸约 3×64 + 2×22 = 236 宽，64 + 8 + 约 16 ≈ 88 高，放得下。
- 重播：once、breathe 随重挂载重画；hover 靠指针触发；breathe 持续脉动（reduced motion 下不动）。
- hover 款静止时几乎不可见，必须配说明文字。可选：暗色下改用 Palette demo 的亮色系。

## Caveats / Not Found

- `hoverMe` 是新文案 key，`copy` 里还没有，需要补 zh / en。
