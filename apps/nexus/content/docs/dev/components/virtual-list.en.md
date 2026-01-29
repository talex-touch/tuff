---
title: "VirtualList 虚拟列表"
description: "用于长列表渲染场景，降低 DOM 数量提升性能。"
---
# VirtualList 虚拟列表

用于长列表渲染场景，降低 DOM 数量提升性能。

<script setup lang="ts">
const items = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)
</script>

## 基础用法

<div class="group">
  <TxVirtualList :items="items" :item-height="36" height="240px">
    <template #item="{ item, index }">
      <div style="padding: 6px 12px; width: 100%;">
        {{ index + 1 }}. {{ item }}
      </div>
    </template>
  </TxVirtualList>
</div>

:::: details Show Code
```vue
<script setup lang="ts">
const items = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)
</script>

<template>
  <TxVirtualList :items="items" :item-height="36" height="240px">
    <template #item="{ item, index }">
      <div style="padding: 6px 12px; width: 100%;">
        {{ index + 1 }}. {{ item }}
      </div>
    </template>
  </TxVirtualList>
</template>
```
::::

## API

### TxVirtualList Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `items` | `any[]` | `[]` | 数据列表 |
| `itemHeight` | `number` | - | 单项高度 |
| `height` | `number \| string` | `320` | 容器高度 |
| `overscan` | `number` | `4` | 预渲染数量 |
| `itemKey` | `string \| (item, index) => string \| number` | `index` | 唯一 key |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `scroll` | `({ scrollTop, startIndex, endIndex })` | 滚动事件 |

### Slots

| 名称 | 说明 |
|------|------|
| `item` | 自定义项渲染 |

### Expose

| 名称 | 说明 |
|------|------|
| `scrollToIndex(index)` | 滚动到指定索引 |
| `scrollToTop()` | 滚动到顶部 |
| `scrollToBottom()` | 滚动到底部 |
