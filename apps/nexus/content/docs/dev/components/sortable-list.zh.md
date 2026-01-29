---
title: "SortableList 拖拽排序"
description: "用于拖拽排序的列表容器（基于 HTML5 Drag & Drop）。"
---
# SortableList 拖拽排序

用于拖拽排序的列表容器（基于 HTML5 Drag & Drop）。

<script setup lang="ts">
import { ref } from 'vue'

const list = ref([
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two' },
  { id: 'three', title: 'Three' },
  { id: 'four', title: 'Four' },
])
</script>

## 基础用法

<DemoBlock title="SortableList">
<template #preview>
<div style="width: 420px;">
  <TxSortableList v-model="list" @reorder="(e) => console.log('reorder', e)">
    <template #item="{ item }">
      <div
        style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;"
      >
        <span style="font-weight: 600;">{{ item.title }}</span>
        <span data-tx-sort-handle="true" style="opacity: 0.6; cursor: grab;">drag</span>
      </div>
    </template>
  </TxSortableList>
</div>
</template>

<template #code>
```vue
<template>
  <TxSortableList v-model="list">
    <template #item="{ item }">
      <div>{{ item.id }}</div>
    </template>
  </TxSortableList>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `SortableListItem[]` | *必填* | 列表数据（必须有 `id`） |
| `disabled` | `boolean` | `false` | 禁用拖拽 |
| `handle` | `boolean` | `false` | 仅允许在 handle 上拖拽 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(value)` | v-model 更新 |
| `reorder` | `({ from, to, items })` | 排序完成 |
