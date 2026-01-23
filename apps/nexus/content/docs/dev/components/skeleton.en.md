---
title: Skeleton
description: Loading placeholders and structure hints
category: Feedback
status: beta
since: 1.0.0
tags: [skeleton, loading, placeholder]
---

# Skeleton

> Structural placeholders to reduce layout shift.  
> **Status**: Beta

## Demo
<TuffDemo title="Skeleton" description="Text and avatar placeholders">
  <template #preview>
    <div class="tuff-demo-row">
      <TxSkeleton :loading="true" :lines="3" />
      <TxSkeleton variant="circle" :width="40" :height="40" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TxSkeleton :loading="true" :lines="3" />
  <TxSkeleton variant="circle" :width="40" :height="40" />
</template>`' />
  </template>
</TuffDemo>

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'loading', type: 'boolean', default: 'true', description: 'Show skeleton' },
  { name: 'lines', type: 'number', default: '3', description: 'Text lines' },
  { name: 'variant', type: \"'line' | 'circle'\", default: 'line', description: 'Shape' },
]" />
