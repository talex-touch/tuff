---
title: StatusBadge
description: Status signals and system feedback
category: Feedback
status: beta
since: 1.0.0
tags: [badge, status, signal]
---

# StatusBadge

> Lightweight badges for system status and signals.  
> **Status**: Beta

## Demo
<TuffDemo title="Status Signals" description="Success, warning, error, info">
  <template #preview>
    <div class="tuff-demo-row">
      <TxStatusBadge text="Success" status="success" />
      <TxStatusBadge text="Warning" status="warning" />
      <TxStatusBadge text="Error" status="danger" />
      <TxStatusBadge text="Info" status="info" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TxStatusBadge text="Success" status="success" />
  <TxStatusBadge text="Warning" status="warning" />
  <TxStatusBadge text="Error" status="danger" />
  <TxStatusBadge text="Info" status="info" />
</template>`' />
  </template>
</TuffDemo>

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'text', type: 'string', default: '-', description: 'Label text' },
  { name: 'status', type: \"'success' | 'warning' | 'danger' | 'info' | 'muted'\", default: 'info', description: 'Status type' },
  { name: 'size', type: \"'sm' | 'md'\", default: 'md', description: 'Size' },
]" />
