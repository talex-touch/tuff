# BaseSurface 基础表面层

`TxBaseSurface` 是 Tuffex 的底层材质渲染组件。它只负责 pure / mask / blur / glass / refraction 等视觉层，不承担卡片语义、交互状态或布局职责；需要完整容器时优先使用 `TxCard`。

## 基础用法

<DemoBlock title="BaseSurface">
<template #preview>
<TxBaseSurface mode="glass" :blur="12" :radius="16" style="width: 220px; height: 96px; display: grid; place-items: center;">
  Glass surface
</TxBaseSurface>
</template>

<template #code>

```vue
<template>
  <TxBaseSurface
    mode="glass"
    :blur="12"
    :radius="16"
    style="width: 220px; height: 96px;"
  >
    Glass surface
  </TxBaseSurface>
</template>
```

</template>
</DemoBlock>

## 设计说明

- `tag` 控制根元素标签，默认插槽内容渲染在所有材质层之上。
- `pure` 只渲染根背景；`mask` 渲染遮罩层并将 `opacity` clamp 到 `0..1`。
- `blur` / `glass` 在 `moving=true` 或 `autoDetect` 检测到 transform 运动时降级；`fallbackMode='mask'` 使用 `fallbackMaskOpacity`，`fallbackMode='pure'` 不渲染 mask 层。
- `glass` / `refraction` 会将归一化后的尺寸、圆角、模糊、亮度、折射等参数透传给 `TxGlassSurface`。
- `refraction` 会额外渲染 filter/mask/edge 层，并输出 renderer/profile/tone class 与 light/strength CSS 变量。
- `autoDetect` 会监听根节点及祖先节点的 style/transition 变化，组件卸载时清理 listener 和 `MutationObserver`。

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `mode` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'pure'` | 表面模式 |
| `radius` | `string \| number` | - | 根节点圆角 |
| `color` | `string` | - | pure/mask 背景色 |
| `opacity` | `number` | `0.75` | mask 透明度 |
| `fallbackMaskOpacity` | `number` | - | 运动降级到 mask 时的透明度 |
| `blur` | `number` | `10` | filter/glass 模糊强度 |
| `filterSaturation` | `number` | `1.5` | filter 层饱和度 |
| `filterContrast` | `number` | `1` | filter 层对比度 |
| `filterBrightness` | `number` | `1` | filter 层亮度 |
| `saturation` | `number` | `1.8` | glass/refraction 饱和度 |
| `brightness` | `number` | `70` | glass/refraction 亮度；`<=3` 按倍率转百分比 |
| `backgroundOpacity` | `number` | `0` | glass 背景透明度 |
| `borderWidth` | `number` | `0.07` | glass 边缘宽度系数 |
| `displace` | `number` | `0.5` | refraction 位移强度 |
| `distortionScale` | `number` | `-180` | refraction 扭曲缩放 |
| `redOffset` / `greenOffset` / `blueOffset` | `number` | `0 / 10 / 20` | RGB 色散偏移 |
| `xChannel` / `yChannel` | `'R' \| 'G' \| 'B'` | `'R' / 'G'` | 位移采样通道 |
| `mixBlendMode` | `GlassSurfaceProps['mixBlendMode']` | `'difference'` | refraction 混合模式 |
| `refractionStrength` | `number` | - | 0-100 统一折射强度 |
| `refractionProfile` | `'soft' \| 'filmic' \| 'cinematic'` | - | 折射风格 |
| `refractionTone` | `'mist' \| 'balanced' \| 'vivid'` | `'balanced'` | 折射色调 |
| `refractionAngle` | `number` | - | 色散方向角度 |
| `refractionLightX` / `refractionLightY` | `number` | - | 光源坐标，范围 `0..1` |
| `refractionHaloOpacity` | `number` | - | halo 透明度覆盖 |
| `overlayOpacity` | `number` | `0` | 非 mask 模式下的附加 mask 透明度 |
| `moving` | `boolean` | `false` | 手动运动降级开关 |
| `fallbackMode` | `'pure' \| 'mask'` | `'mask'` | 运动降级目标模式 |
| `settleDelay` | `number` | `150` | 非 refraction 模式恢复延迟 |
| `autoDetect` | `boolean` | `false` | 自动检测 transform 运动 |
| `transitionDuration` | `number` | `299` | 材质层过渡时长 |
| `fake` | `boolean` | `false` | fake pseudo-element 模式 |
| `fakeIndex` | `number` | `0` | fake 层 z-index |
| `preset` | `'default' \| 'card'` | `'default'` | 视觉预设 |
| `refractionRenderer` | `'svg' \| 'css'` | `'svg'` | refraction 渲染器标记 |
| `tag` | `string` | `'div'` | 根元素标签 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `default` | 表面层内容 |
