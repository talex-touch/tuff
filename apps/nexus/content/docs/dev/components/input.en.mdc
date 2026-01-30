---
title: Input
description: Lightweight inputs and search states
category: Form
status: beta
since: 1.0.0
tags: [input, field, search]
---

# Input

> Lighter inputs, restrained borders, and focused readability.  
> **Status**: Beta


## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffInput v-model="value" placeholder="Type here..." />
    <TxSearchInput v-model="keyword" placeholder="Search..." />
  </template>
---
::

## Demo
::TuffDemo{title="Focus State" description="Lighter focus that stays readable." code-lang="vue"}
---
code: |
  <template>
    <TuffInput model-value="" placeholder="Type here..." />
    <TxSearchInput model-value="" placeholder="Search..." />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-input model-value="" placeholder="Type here..." />
  <tx-search-input model-value="" placeholder="Search..." />
</div>
::

## States
::TuffPropsTable
---
rows:
  - name: disabled
    description: 'Disabled state'
  - name: error
    description: 'Error state'
  - name: loading
    description: 'Loading state'
---
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: modelValue
    type: 'string'
    default: "''"
    description: 'Input value'
  - name: placeholder
    type: 'string'
    default: "''"
    description: 'Placeholder'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: 'Disabled state'
---
::

## Design Notes
- Use subtle border/shadow shifts to express focus.  
- Search states should feel lighter for toolbars and lists.

## Composite Patterns
::TuffDemo{title="Search Row" description="Input paired with action button." code-lang="vue"}
---
code: |
  <template>
    <TuffInput placeholder="Search..." />
    <TxButton size="sm">Go</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-input placeholder="Search..." />
  <tx-button size="sm">Go</tx-button>
</div>
::
