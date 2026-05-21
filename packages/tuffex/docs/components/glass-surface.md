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

> 该组件会根据浏览器能力自动降级（不支持 SVG filter / backdrop-filter 时）。
