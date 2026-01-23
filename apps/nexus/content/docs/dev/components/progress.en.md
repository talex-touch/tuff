---
title: Progress
description: Linear progress and status feedback
category: Feedback
status: beta
since: 1.0.0
tags: [progress, status, loading]
---

# Progress

> Linear progress shows stages and rhythm of work.  
> **Status**: Beta

## Demo
<TuffDemo title="Progress States" description="Base progress with status colors">
  <template #preview>
    <div class="tuff-demo-row">
      <TuffProgress :percentage="40" />
      <TuffProgress :percentage="72" status="warning" />
      <TuffProgress :percentage="100" status="success" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TuffProgress :percentage="40" />
  <TuffProgress :percentage="72" status="warning" />
  <TuffProgress :percentage="100" status="success" />
</template>`' />
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <TuffProgress :percentage="60" />
  <TuffProgress :percentage="60" :show-text="false" />
</template>
```

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'percentage', type: 'number', default: '0', description: 'Progress percentage' },
  { name: 'status', type: \"'success' | 'warning' | 'error'\", default: '-', description: 'Status color' },
  { name: 'indeterminate', type: 'boolean', default: 'false', description: 'Indeterminate mode' },
]" />
