---
title: Avatar
description: Identity and sizing system
category: Basic
status: beta
since: 1.0.0
tags: [avatar, identity, profile]
---

# Avatar

> The smallest identity unit needs a stable size system and clear hierarchy.  
> **Status**: Beta


## Demo
::TuffDemo{title="Size System" description="Small for lists, large for profiles." code-lang="vue"}
---
code: |
  <template>
    <TxAvatar name="TA" />
    <TxAvatar name="UX" />
    <TxAvatar name="PM" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-avatar name="TA" />
  <tx-avatar name="UX" />
  <tx-avatar name="PM" />
</div>
::

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxAvatar name="Talex" />
    <TxAvatar size="lg" name="Tuff" />
  </template>
---
::

## API (Lite)
::TuffPropsTable
---
rows:
  - name: name
    type: 'string'
    default: '-'
    description: 'Display name'
  - name: src
    type: 'string'
    default: '-'
    description: 'Avatar image URL'
  - name: size
    type: "'sm' | 'md' | 'lg'"
    default: 'md'
    description: 'Size'
---
::

## Design Notes
- Uppercase initials by default.  
- Keep spacing between avatar and name consistent.

## Composite Patterns
::TuffDemo{title="Identity Row" description="Avatar paired with status and action." code-lang="vue"}
---
code: |
  <template>
    <TxAvatar name="TA" />
    <TxStatusBadge text="Online" status="success" />
    <TxButton size="sm">Message</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-avatar name="TA" />
  <tx-status-badge text="Online" status="success" />
  <tx-button size="sm">Message</tx-button>
</div>
::
