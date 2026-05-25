# GlassSurface 玻璃拟态

用于渲染带玻璃拟态效果的容器。

<script setup>
import GlassSurfaceBasicDemo from '../.vitepress/theme/components/demos/GlassSurfaceBasicDemo.vue'
import GlassSurfaceBasicDemoSource from '../.vitepress/theme/components/demos/GlassSurfaceBasicDemo.vue?raw'
import GlassSurfaceControlsDemo from '../.vitepress/theme/components/demos/GlassSurfaceControlsDemo.vue'
import GlassSurfaceControlsDemoSource from '../.vitepress/theme/components/demos/GlassSurfaceControlsDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="GlassSurface" :code="GlassSurfaceBasicDemoSource">
  <template #preview>
    <GlassSurfaceBasicDemo />
  </template>
</DemoBlock>

## 参数调节（滑块）

<DemoBlock title="GlassSurface 参数调节" :code="GlassSurfaceControlsDemoSource">
  <template #preview>
    <GlassSurfaceControlsDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `width` | `string \| number` | `'200px'` | 宽度 |
| `height` | `string \| number` | `'200px'` | 高度 |
| `borderRadius` | `number` | `20` | 圆角 |
| `borderWidth` | `number` | `0.07` | 边缘强度 |
| `brightness` | `number` | `70` | 亮度 |
| `opacity` | `number` | `0.93` | 玻璃透明度 |
| `blur` | `number` | `11` | 模糊 |
| `displace` | `number` | `0.5` | 位移模糊强度 |
| `backgroundOpacity` | `number` | `0` | 背景透明度 |
| `saturation` | `number` | `1` | 饱和度 |
| `distortionScale` | `number` | `-180` | 色散强度 |
| `redOffset` | `number` | `0` | 红色通道偏移 |
| `greenOffset` | `number` | `10` | 绿色通道偏移 |
| `blueOffset` | `number` | `20` | 蓝色通道偏移 |
| `xChannel` | `'R' \| 'G' \| 'B'` | `'R'` | X 轴通道选择 |
| `yChannel` | `'R' \| 'G' \| 'B'` | `'G'` | Y 轴通道选择 |
| `mixBlendMode` | `string` | `'difference'` | 混合模式 |

## Fallback 降级

`TxGlassSurface` 会按浏览器能力依次选择渲染路径：

1. **SVG filter 折射路径**：当浏览器支持 `backdrop-filter: url(#filter)` 时，使用组件生成的 SVG displacement map，保留 RGB 通道位移、`distortionScale`、`redOffset` / `greenOffset` / `blueOffset`、`xChannel` / `yChannel`、`displace`、`saturation` 等折射参数。
2. **backdrop-filter 模糊路径**：当 SVG filter 不可用、但支持原生 `backdrop-filter` 时，降级为 `blur(${blur}px) saturate(1.8) brightness(1.06)` 的毛玻璃背景，并保留半透明背景与边框；此时不再渲染 RGB 位移 / 色散效果。
3. **纯半透明背景路径**：当 `backdrop-filter` 也不可用时，最终降级为半透明背景 + 边框，不再提供真实模糊和折射，但仍保持容器尺寸、圆角和基础可读性。

Safari 与 Firefox 当前会跳过 SVG filter 折射路径，优先进入后两级 fallback。
