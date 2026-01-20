---
title: Input 输入
description: 轻量输入框与搜索态
category: Form
status: beta
since: 1.0.0
tags: [input, field, search]
---

# Input 输入

> 更轻的输入框，更克制的边界，强调可读性与聚焦态。  
> **状态**：Beta

## 基础用法
```vue
<template>
  <TuffInput v-model="value" placeholder="输入内容..." />
  <TxSearchInput v-model="keyword" placeholder="搜索..." />
</template>
```

## Demo
<TuffDemo title="Focus State" description="聚焦态更轻，避免夺目。">
  <template #preview>
    <div class="tuff-demo-row">
      <TuffInput model-value="" placeholder="输入内容..." />
      <TxSearchInput model-value="" placeholder="搜索..." />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TuffInput model-value="" placeholder="输入内容..." />
  <TxSearchInput model-value="" placeholder="搜索..." />
</template>`" />
  </template>
</TuffDemo>

## 状态
- `disabled`：禁用态  
- `error`：错误态  
- `loading`：加载态

## API（简版）
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `string` | `''` | 输入值 |
| `placeholder` | `string` | `''` | 占位文案 |
| `disabled` | `boolean` | `false` | 禁用状态 |

## Design Notes
- 聚焦态优先通过边框与阴影的细微变化体现。  
- 搜索态更轻，适合工具栏与列表筛选。
