---
title: Grid
description: Structured layout and alignment
category: Layout
status: beta
since: 1.0.0
tags: [grid, layout, alignment]
---

# Grid

> A structured layout system that keeps rhythm and alignment.  
> **Status**: Beta

## Demo
<TuffDemo
  title="Grid Rhythm"
  description="Consistent spacing keeps the layout steady."
  code-lang="vue"
  :code='`<template>
  <TxGrid :cols="4" gap="12">
    <TxGridItem>1</TxGridItem>
    <TxGridItem>2</TxGridItem>
    <TxGridItem>3</TxGridItem>
    <TxGridItem>4</TxGridItem>
  </TxGrid>
</template>`'
>
  <template #preview>
    <TxGrid :cols="4" gap="12">
      <TxGridItem>1</TxGridItem>
      <TxGridItem>2</TxGridItem>
      <TxGridItem>3</TxGridItem>
      <TxGridItem>4</TxGridItem>
    </TxGrid>
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <TxGrid :cols="4" gap="12">
    <div v-for="item in items" :key="item.id">
      {{ item.title }}
    </div>
  </TxGrid>
</template>
```

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'cols', type: 'number', default: '4', description: 'Columns' },
  { name: 'gap', type: 'number', default: '12', description: 'Gap' },
  { name: 'responsive', type: 'boolean', default: 'true', description: 'Responsive' },
]" />

## Design Notes
- Spacing defines rhythm.  
- Reduce columns when density rises.
