---
title: LayoutSkeleton
description: Layout-level skeleton placeholder
category: Layout
status: beta
since: 1.0.0
tags: [skeleton, layout, loading]
---

# LayoutSkeleton

> Layout-level placeholder for page or panel loading.  
> **Status**: Beta

## Demo
<TuffDemo title="Layout Placeholder" description="The wrapper controls the size.">
  <template #preview>
    <div class="tuff-demo-row" style="width: 100%;">
      <div style="width: 100%; height: 240px;">
        <TxLayoutSkeleton />
      </div>
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <div style="height: 240px;">
    <TxLayoutSkeleton />
  </div>
</template>`" />
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <div style="height: 240px;">
    <TxLayoutSkeleton />
  </div>
</template>
```

## Usage Notes
- The wrapper controls size and layout ratio.
- Ideal for page-level loading with consistent rhythm.

## API (Brief)
<TuffPropsTable :rows="[
  { name: '—', type: '-', default: '-', description: 'No extra props; size follows the container' },
]" />
