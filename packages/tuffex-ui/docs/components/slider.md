# Slider 滑块

用于在区间内选择数值的滑块组件。

<script setup lang="ts">
import { ref } from 'vue'

const value = ref(30)
const value2 = ref(60)
const value3 = ref(42)
const value4 = ref(30)
</script>

## 基础用法

<DemoBlock title="Slider">
<template #preview>
<div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxSlider v-model="value" :min="0" :max="100" :step="1" />
  <div style="margin-top: 8px; color: var(--tx-text-color-secondary);">Value: {{ value }}</div>
</div>
</template>

<template #code>
```vue
<template>
  <TxSlider v-model="value" :min="0" :max="100" :step="1" />
  <div>Value: {{ value }}</div>
</template>
```
</template>
</DemoBlock>

## 禁用

<DemoBlock title="Slider (disabled)">
<template #preview>
<div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxSlider v-model="value3" disabled show-value />
</div>
</template>

<template #code>
```vue
<template>
  <TxSlider v-model="value" disabled show-value />
</template>
```
</template>
</DemoBlock>

## 格式化显示

<DemoBlock title="Slider (formatValue)">
<template #preview>
<div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxSlider
    v-model="value4"
    :min="0"
    :max="100"
    show-value
    :format-value="(v) => `${v}%`"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxSlider v-model="value" show-value :format-value="(v) => `${v}%`" />
</template>
```
</template>
</DemoBlock>

## 显示数值

<DemoBlock title="Slider (show value)">
<template #preview>
<div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxSlider v-model="value2" :min="0" :max="100" :step="1" show-value />
</div>
</template>

<template #code>
```vue
<template>
  <TxSlider v-model="value" :min="0" :max="100" :step="1" show-value />
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `number` | `0` | 当前值 |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步长 |
| `disabled` | `boolean` | `false` | 禁用 |
| `showValue` | `boolean` | `false` | 右侧显示当前值 |
| `formatValue` | `(value: number) => string` | - | 格式化显示值 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `number` | v-model 更新 |
| `change` | `number` | change 事件 |
