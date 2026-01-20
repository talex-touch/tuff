---
title: Grid 栅格
description: 结构化布局与对齐
category: Layout
status: beta
since: 1.0.0
tags: [grid, layout, alignment]
---

# Grid 栅格

> 用于结构化布局与信息栅格化，强调对齐与节奏。  
> **状态**：Beta

## Demo
<TuffDemo title="Grid Rhythm" description="保持间距一致，避免视觉跳动。">
  <template #preview>
    <TxGrid :cols="4" gap="12">
      <TxGridItem>1</TxGridItem>
      <TxGridItem>2</TxGridItem>
      <TxGridItem>3</TxGridItem>
      <TxGridItem>4</TxGridItem>
    </TxGrid>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxGrid :cols="4" gap="12">
    <TxGridItem>1</TxGridItem>
    <TxGridItem>2</TxGridItem>
    <TxGridItem>3</TxGridItem>
    <TxGridItem>4</TxGridItem>
  </TxGrid>
</template>`" />
  </template>
</TuffDemo>

## 基础用法
```vue
<template>
  <TxGrid :cols="4" gap="12">
    <div v-for="item in items" :key="item.id">
      {{ item.title }}
    </div>
  </TxGrid>
</template>
```

## API（简版）
<TuffPropsTable :rows="[
  { name: 'cols', type: 'number', default: '4', description: '列数' },
  { name: 'gap', type: 'number', default: '12', description: '间距' },
  { name: 'responsive', type: 'boolean', default: 'true', description: '响应式' },
]" />

## Design Notes
- 网格间距是视觉节奏的核心。  
- 内容密度过高时优先减少列数。
