---
title: "Checkbox 复选框"
description: "复选框组件，具有 SVG 动画勾选效果。"
---
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
&lt;template&gt;
  &lt;TxCheckbox v-model="checked" label="选项" /&gt;
&lt;/template&gt;
```
</template>
</DemoBlock>

## 文案在前（labelPlacement = start）

<DemoBlock title="Checkbox (label start)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
  <TxCheckbox v-model="checked1" label="我在前面" label-placement="start" />
  <TxCheckbox v-model="checked2" label="我也在前面" label-placement="start" />
</div>
</template>

<template #code>
```vue
&lt;template&gt;
  &lt;TxCheckbox v-model="checked" label="我在前面" label-placement="start" /&gt;
&lt;/template&gt;
```
</template>
</DemoBlock>

## 无文案

无 label / 无插槽时，建议传入 `aria-label`。

<DemoBlock title="Checkbox (no label)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
  <TxCheckbox v-model="checked5" aria-label="勾选" />
</div>
</template>

<template #code>
```vue
&lt;template&gt;
  &lt;TxCheckbox v-model="checked" aria-label="勾选" /&gt;
&lt;/template&gt;
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
&lt;template&gt;
  &lt;TxCheckbox v-model="checked" label="禁用" disabled /&gt;
&lt;/template&gt;
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
&lt;template&gt;
  &lt;TxCheckbox v-model="checked"&gt;
    &lt;span&gt;自定义标签&lt;/span&gt;
  &lt;/TxCheckbox&gt;
&lt;/template&gt;
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
| labelPlacement | 标签位置（start=前置，end=后置） | `'start' \| 'end'` | `'end'` |
| ariaLabel | 无标签时的可访问性文本 | `string` | - |

### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 状态改变时触发 | `(value: boolean) => void` |
| update:modelValue | 值更新时触发 | `(value: boolean) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义标签内容 |

