---
title: Input
description: Lightweight inputs and search states
category: Form
status: beta
since: 1.0.0
tags: [input, field, search]
---

# Input

> Lighter inputs, restrained borders, and focused readability.  
> **Status**: Beta

## Basic Usage
```vue
<template>
  <TuffInput v-model="value" placeholder="Type here..." />
  <TxSearchInput v-model="keyword" placeholder="Search..." />
</template>
```

## Demo
<TuffDemo title="Focus State" description="Lighter focus that stays readable.">
  <template #preview>
    <div class="tuff-demo-row">
      <TuffInput model-value="" placeholder="Type here..." />
      <TxSearchInput model-value="" placeholder="Search..." />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TuffInput model-value="" placeholder="Type here..." />
  <TxSearchInput model-value="" placeholder="Search..." />
</template>`' />
  </template>
</TuffDemo>

## States
- `disabled`: disabled state  
- `error`: error state  
- `loading`: loading state

## API (Lite)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `string` | `''` | Input value |
| `placeholder` | `string` | `''` | Placeholder |
| `disabled` | `boolean` | `false` | Disabled state |

## Design Notes
- Use subtle border/shadow shifts to express focus.  
- Search states should feel lighter for toolbars and lists.
