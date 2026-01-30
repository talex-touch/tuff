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
::TuffDemo{title="Skeleton" description="Text and avatar placeholders" code-lang="vue"}
---
code: |
  <template>
    <TxSkeleton :loading="true" :lines="3" />
    <TxSkeleton variant="circle" :width="40" :height="40" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-skeleton :loading="true" :lines="3" />
  <tx-skeleton variant="circle" :width="40" :height="40" />
</div>
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: loading
    type: 'boolean'
    default: 'true'
    description: 'Show skeleton'
  - name: lines
    type: 'number'
    default: '3'
    description: 'Text lines'
  - name: variant
    type: "'line' | 'circle'"
    default: 'line'
    description: 'Shape'
---
::

## Composite Patterns
::TuffDemo{title="Card Placeholder" description="Skeletons inside cards for feeds." code-lang="vue"}
---
code: |
  <template>
    <TxCard>
      <TxSkeleton :loading="true" :lines="2" />
    </TxCard>
  </template>
---
#preview
<div class="tuff-demo-row" style="width: 100%;">
  <tx-card style="width: 100%;">
    <tx-skeleton :loading="true" :lines="2" />
  </tx-card>
</div>
::
