# GlowText 扫光

用于在文本或任意内容（包括图片/卡片）上叠加“高光扫过”的动效。

> 默认启用 `adaptive` 模式，在彩色/渐变文字上也能保持可见扫光；如需经典效果可设置 `mode="classic"`。

<script setup lang="ts">
import GlowTextBasicDemo from '../.vitepress/theme/components/demos/GlowTextBasicDemo.vue'
import GlowTextBasicDemoSource from '../.vitepress/theme/components/demos/GlowTextBasicDemo.vue?raw'

import GlowTextImageDemo from '../.vitepress/theme/components/demos/GlowTextImageDemo.vue'
import GlowTextImageDemoSource from '../.vitepress/theme/components/demos/GlowTextImageDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="GlowText" :code="GlowTextBasicDemoSource">
  <template #preview>
    <GlowTextBasicDemo />
  </template>
</DemoBlock>

## 作用于图片/卡片

<DemoBlock title="GlowText on image" :code="GlowTextImageDemoSource">
  <template #preview>
    <GlowTextImageDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `tag` | `string` | `span` | 外层渲染标签 |
| `active` | `boolean` | `true` | 是否启用扫光 |
| `repeat` | `boolean` | `true` | 是否循环 |
| `durationMs` | `number` | `1400` | 动画时长(ms) |
| `delayMs` | `number` | `0` | 延迟(ms) |
| `angle` | `number` | `20` | 扫光角度(deg) |
| `bandSize` | `number` | `38` | 高光带宽度(%) |
| `color` | `string` | `rgba(255, 255, 255, 0.9)` | 高光颜色 |
| `opacity` | `number` | `0.75` | 高光不透明度 |
| `blendMode` | `string` | `screen` | 混合模式（`adaptive` 下会优先尝试 `plus-lighter`；如 `screen` / `overlay` / `lighten`） |
| `mode` | `'classic' \| 'adaptive'` | `adaptive` | 扫光模式（`adaptive` 更适合彩色文字） |
| `backdrop` | `string` | - | 自定义 `backdrop-filter`（如 `brightness(1.2) saturate(1.1)`） |
| `radius` | `number` | `10` | 圆角(px) |
