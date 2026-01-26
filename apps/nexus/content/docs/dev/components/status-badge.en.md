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

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Status Signals" description="Success, warning, error, info" code-lang="vue"}
---
code: |
  <template>
    <TxStatusBadge text="Success" status="success" />
    <TxStatusBadge text="Warning" status="warning" />
    <TxStatusBadge text="Error" status="danger" />
    <TxStatusBadge text="Info" status="info" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-status-badge text="Success" status="success" />
  <tx-status-badge text="Warning" status="warning" />
  <tx-status-badge text="Error" status="danger" />
  <tx-status-badge text="Info" status="info" />
</div>
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: text
    type: 'string'
    default: '-'
    description: 'Label text'
  - name: status
    type: "'success' | 'warning' | 'danger' | 'info' | 'muted'"
    default: 'info'
    description: 'Status type'
  - name: size
    type: "'sm' | 'md'"
    default: 'md'
    description: 'Size'
---
::

## Composite Patterns
::TuffDemo{title="Status Row" description="Status badge paired with avatar." code-lang="vue"}
---
code: |
  <template>
    <TxAvatar name="TA" />
    <TxStatusBadge text="Online" status="success" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-avatar name="TA" />
  <tx-status-badge text="Online" status="success" />
</div>
::
