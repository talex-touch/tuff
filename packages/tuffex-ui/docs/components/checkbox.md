# Checkbox 复选框

复选框组件，具有 SVG 动画勾选效果。

<script setup lang="ts">
import { ref } from 'vue'

const checked1 = ref(false)
const checked2 = ref(true)
const checked3 = ref(false)
const checked4 = ref(true)
const checked5 = ref(false)
</script>

## 基础用法

<DemoBlock title="Checkbox">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
  <TxCheckbox v-model="checked1" label="选项 1" />
  <TxCheckbox v-model="checked2" label="选项 2" />
</div>
</template>

<template #code>
```vue
<template>
  <TxCheckbox v-model="checked" label="选项" />
</template>
```
</template>
</DemoBlock>

## 禁用状态

<DemoBlock title="Checkbox (disabled)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
  <TxCheckbox v-model="checked3" label="禁用" disabled />
  <TxCheckbox v-model="checked4" label="禁用且选中" disabled />
</div>
</template>

<template #code>
```vue
<template>
  <TxCheckbox v-model="checked" label="禁用" disabled />
</template>
```
</template>
</DemoBlock>

## 使用插槽

<DemoBlock title="Checkbox (slot)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
  <TxCheckbox v-model="checked5">
    <span style="color: var(--tx-color-primary);">自定义标签</span>
  </TxCheckbox>
</div>
</template>

<template #code>
```vue
<template>
  <TxCheckbox v-model="checked">
    <span>自定义标签</span>
  </TxCheckbox>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `boolean` | `false` |
| disabled | 是否禁用 | `boolean` | `false` |
| label | 标签文本 | `string` | - |

### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 状态改变时触发 | `(value: boolean) => void` |
| update:modelValue | 值更新时触发 | `(value: boolean) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义标签内容 |

