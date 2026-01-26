---
title: Switch
description: Tactile toggles with state feedback
category: Form
status: beta
since: 1.0.0
tags: [switch, toggle, state]
---

# Switch

> Tactile toggles with clear state color and movement.  
> **Status**: Beta

**Since**: {{ $doc.since }}

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffSwitch v-model="enabled" />
    <TuffSwitch v-model="enabled" size="small" />
  </template>
---
::

## Demo
::TuffDemo{title="Toggle State" description="Movement and color change together." code-lang="vue"}
---
code: |
  <template>
    <TuffSwitch :model-value="false" />
    <TuffSwitch :model-value="true" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-switch :model-value="false" />
  <tuff-switch :model-value="true" />
</div>
::

## States
::TuffPropsTable
---
rows:
  - name: disabled
    description: 'Disabled state'
  - name: loading
    description: 'Loading state'
  - name: size
    values: ['small', 'medium', 'large']
    description: 'Size variants'
---
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: modelValue
    type: 'boolean'
    default: 'false'
    description: 'Switch value'
  - name: size
    type: "'small' | 'medium' | 'large'"
    default: "'medium'"
    description: 'Size'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: 'Disabled state'
---
::

## Design Notes
- Movement and color should sync.  
- Use smaller size for dense lists, larger for settings.

## Composite Patterns
::TuffDemo{title="Settings Row" description="Switch paired with labels." code-lang="vue"}
---
code: |
  <template>
    <TxTag>Notifications</TxTag>
    <TuffSwitch :model-value="true" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tag>Notifications</tx-tag>
  <tuff-switch :model-value="true" />
</div>
::
