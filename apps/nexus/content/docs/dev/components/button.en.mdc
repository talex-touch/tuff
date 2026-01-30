---
title: Button
description: Tactile button system with flat variants
category: Basic
status: beta
since: 1.0.0
tags: [action, tactile, primary]
---

# Button

> A tactile button system focused on press feedback and controlled damping.  
> **Status**: Beta

<div class="tuff-doc-canvas">
  <TuffComponentCanvas name="Button">
    <TxButton variant="primary" size="lg">
      Action Label
    </TxButton>
  </TuffComponentCanvas>
</div>

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton>Primary</TxButton>
    <TuffFlatButton>Flat</TuffFlatButton>
  </template>
---
::

## States & Variants
::TuffPropsTable
---
rows:
  - name: loading
    type: 'boolean'
    default: 'false'
    description: 'Loading state'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: 'Disabled state'
  - name: size
    values: ['sm', 'md', 'lg']
    description: 'Scales visuals and tactile response'
---
::

## Composition
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton icon="i-ri-add-line">Create</TxButton>
    <TxButton variant="ghost">Ghost</TxButton>
  </template>
---
::

## Demo
::TuffDemo{title="Primary / Flat" description="Tactile primary and restrained flat styles." code-lang="vue"}
---
code: |
  <template>
    <TxButton>Primary</TxButton>
    <TuffFlatButton>Flat</TuffFlatButton>
    <TxButton variant="ghost">Ghost</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button>Primary</tx-button>
  <tuff-flat-button>Flat</tuff-flat-button>
  <tx-button variant="ghost">Ghost</tx-button>
</div>
::

## Demo Conventions
- Wrap interactive demos in `client-only`.  
- Demos must be copyable and runnable (no screenshot-only blocks).

## API (Lite)
::TuffPropsTable
---
rows:
  - name: variant
    type: "'primary' | 'secondary' | 'ghost' | 'danger'"
    default: 'primary'
    description: 'Visual style'
  - name: size
    type: "'sm' | 'md' | 'lg'"
    default: 'md'
    description: 'Size'
  - name: loading
    type: 'boolean'
    default: 'false'
    description: 'Loading state'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: 'Disabled state'
---
::

## Types
::TuffCodeBlock{lang="ts"}
---
code: |
  import type { TxButtonProps } from '@talex-touch/tuffex'

  export interface ButtonProps extends TxButtonProps {}
---
::

## Design Notes
- Emphasize press feedback with smooth rebound.  
- Translucent surfaces need proper background contrast.  
- Keep icon/text spacing consistent to avoid visual drift.

## Composite Patterns
::TuffDemo{title="Composite Actions" description="Primary + ghost pairing for command bars." code-lang="vue"}
---
code: |
  <template>
    <TxButton icon="i-ri-add-line">Create Project</TxButton>
    <TxButton variant="ghost">Ghost Variant</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button icon="i-ri-add-line">Create Project</tx-button>
  <tx-button variant="ghost">Ghost Variant</tx-button>
</div>
::

## Source

<TuffDocSourceLink label="View source" />

<style scoped>
.tuff-doc-canvas {
  margin: 18px 0 32px;
}

::global(.docs-background) {
  display: none;
}
</style>
