# GlassSurface 玻璃拟态

用于渲染带玻璃拟态效果的容器。

## 基础用法

<DemoBlock title="GlassSurface">
<template #preview>
<TxGlassSurface :width="320" :height="160" :border-radius="18" :background-opacity="0.15">
  <div style="padding: 16px; color: var(--tx-text-color-primary);">Glass</div>
</TxGlassSurface>
</template>

<template #code>
```vue
<template>
  <TxGlassSurface :width="320" :height="160" :border-radius="18" :background-opacity="0.15">
    <div style="padding: 16px;">Glass</div>
  </TxGlassSurface>
</template>

<script setup lang="ts">
import { TxGlassSurface } from '@talex-touch/tuff-ui'
</script>
```
</template>
</DemoBlock>

## API

### Props（节选）

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `width` | `string \| number` | `'200px'` | 宽度 |
| `height` | `string \| number` | `'200px'` | 高度 |
| `borderRadius` | `number` | `20` | 圆角 |
| `backgroundOpacity` | `number` | `0` | 背景透明度 |
| `saturation` | `number` | `1` | 饱和度 |
| `blur` | `number` | `11` | 模糊 |

> 该组件会根据浏览器能力自动降级（不支持 SVG filter / backdrop-filter 时）。
