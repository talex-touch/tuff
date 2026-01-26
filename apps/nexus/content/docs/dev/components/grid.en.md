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

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Grid Rhythm" description="Consistent spacing keeps the layout steady." code-lang="vue"}
---
code: |
  <template>
    <TxGrid :cols="4" gap="12">
      <TxGridItem>1</TxGridItem>
      <TxGridItem>2</TxGridItem>
      <TxGridItem>3</TxGridItem>
      <TxGridItem>4</TxGridItem>
    </TxGrid>
  </template>
---
#preview
<tx-grid :cols="4" gap="12">
  <tx-grid-item>1</tx-grid-item>
  <tx-grid-item>2</tx-grid-item>
  <tx-grid-item>3</tx-grid-item>
  <tx-grid-item>4</tx-grid-item>
</tx-grid>
::

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxGrid :cols="4" gap="12">
      <div v-for="item in items" :key="item.id">
        {{ item.title }}
      </div>
    </TxGrid>
  </template>
---
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: cols
    type: 'number'
    default: '4'
    description: 'Columns'
  - name: gap
    type: 'number'
    default: '12'
    description: 'Gap'
  - name: responsive
    type: 'boolean'
    default: 'true'
    description: 'Responsive'
---
::

## Design Notes
- Spacing defines rhythm.  
- Reduce columns when density rises.

## Composite Patterns
::TuffDemo{title="Card Grid" description="Grid paired with cards for layout blocks." code-lang="vue"}
---
code: |
  <template>
    <TxGrid :cols="2" gap="12">
      <TxCard>Card A</TxCard>
      <TxCard>Card B</TxCard>
    </TxGrid>
  </template>
---
#preview
<tx-grid :cols="2" gap="12">
  <tx-card>Card A</tx-card>
  <tx-card>Card B</tx-card>
</tx-grid>
::
