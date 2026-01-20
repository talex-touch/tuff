---
title: ProgressBar
description: Multi-state progress bar with loading feedback
category: Feedback
status: beta
since: 1.0.0
tags: [progress, bar, loading]
---

# ProgressBar

> Finer-grained progress feedback with loading / success / error states.  
> **Status**: Beta

## Demo
<TuffDemo title="Stateful Progress" description="Loading, warning, and success in one panel.">
  <template #preview>
    <div class="tuff-demo-row" style="flex-direction: column; align-items: stretch; width: 100%;">
      <TxProgressBar :percentage="32" show-text />
      <TxProgressBar :percentage="68" status="warning" show-text />
      <TxProgressBar success message="Done" />
      <TxProgressBar loading message="Syncing" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxProgressBar :percentage="32" show-text />
  <TxProgressBar :percentage="68" status="warning" show-text />
  <TxProgressBar success message="Done" />
  <TxProgressBar loading message="Syncing" />
</template>`" />
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <TxProgressBar :percentage="45" show-text />
  <TxProgressBar loading />
</template>
```

## API (Brief)
<TuffPropsTable :rows="[
  { name: 'percentage', type: 'number', default: '0', description: 'Progress percentage' },
  { name: 'loading', type: 'boolean', default: 'false', description: 'Indeterminate loading state' },
  { name: 'status', type: \"'success' | 'error' | 'warning'\", default: '-', description: 'Status tone' },
  { name: 'message', type: 'string', default: '-', description: 'Custom label' },
  { name: 'showText', type: 'boolean', default: 'false', description: 'Show percentage text' },
  { name: 'maskVariant', type: \"'solid' | 'dashed' | 'plain'\", default: 'solid', description: 'Track style' },
  { name: 'flowEffect', type: \"'none' | 'shimmer' | 'wave' | 'particles'\", default: 'none', description: 'Flow overlay effect' },
]" />
