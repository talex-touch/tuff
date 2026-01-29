---
title: "Tree 树形"
description: "基础树形组件，支持搜索过滤、单选/多选与展开控制。"
---
# Tree 树形

基础树形组件，支持搜索过滤、单选/多选与展开控制。

<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')
const value = ref()

const nodes = [
  {
    key: 'design',
    label: 'Design',
    children: [
      { key: 'design-ui', label: 'UI' },
      { key: 'design-ux', label: 'UX' },
    ],
  },
  {
    key: 'dev',
    label: 'Development',
    children: [
      { key: 'dev-web', label: 'Web' },
      { key: 'dev-app', label: 'App' },
    ],
  },
]
</script>

## 基础用法

<div class="group" style="max-width: 320px;">
  <TxSearchInput v-model="query" placeholder="过滤节点" />
  <TxTree
    v-model="value"
    :nodes="nodes"
    :default-expanded-keys="['design']"
    :filter-text="query"
  />
</div>

:::: details Show Code
```vue
<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')
const value = ref()
const nodes = [{ key: 'design', label: 'Design' }]
</script>

<template>
  <TxSearchInput v-model="query" placeholder="过滤节点" />
  <TxTree v-model="value" :nodes="nodes" :filter-text="query" />
</template>
```
::::

## API

### TxTree Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `nodes` | `TreeNode[]` | `[]` | 数据源 |
| `modelValue` | `string \| number \| Array<string \| number>` | - | 选中值 |
| `multiple` | `boolean` | `false` | 是否多选 |
| `selectable` | `boolean` | `true` | 是否可选 |
| `checkable` | `boolean` | `false` | 是否显示复选 |
| `disabled` | `boolean` | `false` | 禁用 |
| `defaultExpandedKeys` | `Array<string \| number>` | `[]` | 默认展开 |
| `expandedKeys` | `Array<string \| number>` | - | 受控展开 |
| `indent` | `number` | `16` | 缩进 |
| `filterText` | `string` | `''` | 搜索文本 |
| `filterMethod` | `(node, query) => boolean` | - | 自定义过滤 |

### TreeNode

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `string \| number` | 唯一标识 |
| `label` | `string` | 展示文本 |
| `disabled` | `boolean` | 禁用 |
| `children` | `TreeNode[]` | 子节点 |
| `icon` | `TxIconSource \| string` | 节点图标 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(value)` | 选中变化 |
| `select` | `({ key, node })` | 选择节点 |
| `toggle` | `({ key, expanded })` | 展开切换 |
| `update:expandedKeys` | `(keys)` | 展开变化 |

### Slots

| 名称 | 说明 |
|------|------|
| `item` | 自定义节点 |
| `empty` | 空状态 |
