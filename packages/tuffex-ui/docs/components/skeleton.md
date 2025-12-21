# Skeleton 骨架屏

用于加载时展示占位骨架。

<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(true)
</script>

## 基础用法

<DemoBlock title="Skeleton">
<template #preview>
<TxButton @click="loading = !loading">Toggle</TxButton>

<div style="margin-top: 12px; width: 360px;">
  <TxSkeleton :loading="loading" :lines="3" />
</div>
</template>

<template #code>
```vue
<template>
  <TxButton @click="loading = !loading">Toggle</TxButton>
  <TxSkeleton :loading="loading" :lines="3" />
</template>
```
</template>
</DemoBlock>

## 圆形

<DemoBlock title="Skeleton (circle)">
<template #preview>
<div style="width: 48px;">
  <TxSkeleton variant="circle" :width="48" :height="48" />
</div>
</template>

<template #code>
```vue
<template>
  <TxSkeleton variant="circle" :width="48" :height="48" />
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `loading` | `boolean` | `true` | 是否显示骨架；为 false 时渲染默认 slot |
| `variant` | `'text' \| 'rect' \| 'circle'` | `'text'` | 形态 |
| `width` | `string \| number` | `'100%'` | 宽度 |
| `height` | `string \| number` | `12` | 高度 |
| `radius` | `string \| number` | `8` | 圆角（circle 忽略） |
| `lines` | `number` | `1` | 行数 |
| `gap` | `string \| number` | `10` | 行间距 |
