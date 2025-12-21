# Spinner 加载

用于展示加载中的旋转指示器。通常作为更复杂 Loading 组件的基础。

## 基础用法

<DemoBlock title="Spinner">
<template #preview>
<TxSpinner />
</template>

<template #code>
```vue
<template>
  <TxSpinner />
</template>

<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuff-ui'
</script>
```
</template>
</DemoBlock>

## 尺寸

<DemoBlock title="Spinner sizes">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxSpinner :size="12" />
  <TxSpinner :size="16" />
  <TxSpinner :size="24" />
  <TxSpinner :size="32" />
</div>
</template>

<template #code>
```vue
<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxSpinner :size="12" />
    <TxSpinner :size="16" />
    <TxSpinner :size="24" />
    <TxSpinner :size="32" />
  </div>
</template>

<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuff-ui'
</script>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `size` | `number` | `16` | 尺寸(px) |
| `strokeWidth` | `number` | `2` | 线宽 |
