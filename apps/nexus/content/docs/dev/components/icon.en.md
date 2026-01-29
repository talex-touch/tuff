---
title: Icon
description: Unified icon system and visual density control
category: Basic
status: beta
since: 1.0.0
tags: [icon, glyph, visual]
---

# Icon

> A unified icon system with consistent density and alignment.  
> **Status**: Beta


## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffIcon name="i-ri-home-line" />
    <TuffIcon name="chevron-down" />
  </template>
---
::

## Demo
::TuffDemo{title="Icon Density" description="Keep icon rhythm and spacing consistent." code-lang="vue"}
---
code: |
  <template>
    <TuffIcon name="i-ri-home-line" />
    <TuffIcon name="i-ri-search-line" />
    <TuffIcon name="i-ri-settings-3-line" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-icon name="i-ri-home-line" />
  <tuff-icon name="i-ri-search-line" />
  <tuff-icon name="i-ri-settings-3-line" />
</div>
::

## Types & Sources
- `class`: icon class name (recommended).
- `emoji`: lightweight emphasis.
- `file` / `url`: local or remote icons.
- `builtin`: built-in common icons.

## API (Lite)
::TuffPropsTable
---
rows:
  - name: name
    type: 'string'
    default: '-'
    description: 'Icon name or class'
  - name: size
    type: 'number'
    default: '16'
    description: 'Icon size'
  - name: colorful
    type: 'boolean'
    default: 'false'
    description: 'Keep original colors'
---
::

## Design Notes
- Use 16/18/20 sizes when aligning with text.  
- Prefer line icons in dense lists to reduce visual noise.

## Composite Patterns
::TuffDemo{title="Icon Button" description="Icons paired with buttons for quick actions." code-lang="vue"}
---
code: |
  <template>
    <TxButton icon="i-ri-add-line">Create</TxButton>
    <TxButton variant="ghost" icon="i-ri-more-2-line">More</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button icon="i-ri-add-line">Create</tx-button>
  <tx-button variant="ghost" icon="i-ri-more-2-line">More</tx-button>
</div>
::
