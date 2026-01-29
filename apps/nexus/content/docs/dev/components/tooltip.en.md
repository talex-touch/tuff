---
title: Tooltip
description: Lightweight hints and hierarchy
category: Feedback
status: beta
since: 1.0.0
tags: [tooltip, hint, overlay]
---

# Tooltip

> Small and lightweight hints that do not interrupt the flow.  
> **Status**: Beta


## Demo
::TuffDemo{title="Hover Hint" description="Short hints with low intrusion." code-lang="vue"}
---
code: |
  <template>
    <TxTooltip content="Hint">
      <TxButton variant="ghost">Hover me</TxButton>
    </TxTooltip>
    <TxTooltip content="Info">
      <TxButton variant="ghost">Info</TxButton>
    </TxTooltip>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tooltip content="Hint">
    <tx-button variant="ghost">Hover me</tx-button>
  </tx-tooltip>
  <tx-tooltip content="Info">
    <tx-button variant="ghost">Info</tx-button>
  </tx-tooltip>
</div>
::

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxTooltip content="Copied">
      <TxButton variant="ghost">Copy</TxButton>
    </TxTooltip>
  </template>
---
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: content
    type: 'string'
    default: '-'
    description: 'Tooltip text'
  - name: placement
    type: 'string'
    default: 'top'
    description: 'Placement'
  - name: open-delay
    type: 'number'
    default: '120'
    description: 'Open delay (ms)'
  - name: close-delay
    type: 'number'
    default: '80'
    description: 'Close delay (ms)'
---
::

## Design Notes
- Keep text short, avoid multiline.  
- Maintain light spacing from the trigger element.

## Composite Patterns
::TuffDemo{title="Tooltip Button" description="Icon button with a hint." code-lang="vue"}
---
code: |
  <template>
    <TxTooltip content="Share">
      <TxButton icon="i-ri-share-line" circle />
    </TxTooltip>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tooltip content="Share">
    <tx-button icon="i-ri-share-line" circle />
  </tx-tooltip>
</div>
::
