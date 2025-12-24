# Select 选择器

下拉选择器组件，基于 Floating UI 实现浮层定位（点击展开、自动翻转、面板内滚动）。

<script setup lang="ts">
import { ref } from 'vue'

const value1 = ref('')
const value2 = ref('')
const value3 = ref('')
const value4 = ref('option18')
const value5 = ref('')
</script>

## 基础用法

<DemoBlock title="Select">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 300px;">
  <TuffSelect v-model="value1" placeholder="请选择">
    <TuffSelectItem value="option1" label="选项 1" />
    <TuffSelectItem value="option2" label="选项 2" />
    <TuffSelectItem value="option3" label="选项 3" />
  </TuffSelect>
</div>
</template>

<template #code>
```vue
<template>
  <TuffSelect v-model="value" placeholder="请选择">
    <TuffSelectItem value="option1" label="选项 1" />
    <TuffSelectItem value="option2" label="选项 2" />
    <TuffSelectItem value="option3" label="选项 3" />
  </TuffSelect>
</template>
```
</template>
</DemoBlock>

## 可搜索

<DemoBlock title="Select (searchable)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 300px;">
  <TuffSelect v-model="value5" placeholder="Searchable" searchable>
    <TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" />
  </TuffSelect>
</div>
</template>

<template #code>
```vue
<template>
  <TuffSelect v-model="value" placeholder="Searchable" searchable>
    <TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" />
  </TuffSelect>
</template>
```
</template>
</DemoBlock>

## 禁用状态

<DemoBlock title="Select (disabled)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 300px;">
  <TuffSelect v-model="value2" placeholder="禁用状态" disabled>
    <TuffSelectItem value="option1" label="选项 1" />
  </TuffSelect>
</div>
</template>

<template #code>
```vue
<template>
  <TuffSelect v-model="value" placeholder="禁用状态" disabled>
    <TuffSelectItem value="option1" label="选项 1" />
  </TuffSelect>
</template>
```
</template>
</DemoBlock>

## 禁用选项

<DemoBlock title="Select (disabled option)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 300px;">
  <TuffSelect v-model="value3" placeholder="请选择">
    <TuffSelectItem value="option1" label="可选项 1" />
    <TuffSelectItem value="option2" label="禁用选项" disabled />
    <TuffSelectItem value="option3" label="可选项 2" />
  </TuffSelect>
</div>
</template>

<template #code>
```vue
<template>
  <TuffSelect v-model="value" placeholder="请选择">
    <TuffSelectItem value="option1" label="可选项 1" />
    <TuffSelectItem value="option2" label="禁用选项" disabled />
    <TuffSelectItem value="option3" label="可选项 2" />
  </TuffSelect>
</template>
```
</template>
</DemoBlock>

## 滚动面板

<DemoBlock title="Select (scrollable dropdown)">
<template #preview>
<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 300px;">
  <TuffSelect v-model="value4" placeholder="请选择" :dropdown-max-height="220">
    <TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" />
  </TuffSelect>
</div>
</template>

<template #code>
```vue
<template>
  <TuffSelect v-model="value" :dropdown-max-height="220">
    <TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" />
  </TuffSelect>
</template>
```
</template>
</DemoBlock>

## API

### TuffSelect Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `string \| number` | `''` |
| placeholder | 占位文本 | `string` | `'请选择'` |
| disabled | 是否禁用 | `boolean` | `false` |
| searchable | 是否可搜索 | `boolean` | `false` |
| searchPlaceholder | 搜索框占位 | `string` | `'Search'` |
| dropdownMaxHeight | 下拉面板最大高度 | `number` | `280` |
| dropdownOffset | 触发器与面板间距 | `number` | `6` |

### TuffSelect Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 选中值改变时触发 | `(value: string \| number) => void` |
| update:modelValue | 值更新时触发 | `(value: string \| number) => void` |

### TuffSelectItem Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| value | 选项值 | `string \| number` | - |
| label | 选项标签 | `string` | - |
| disabled | 是否禁用 | `boolean` | `false` |
