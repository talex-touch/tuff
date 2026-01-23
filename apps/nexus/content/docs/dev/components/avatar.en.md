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
<TuffDemo title="Size System" description="Small for lists, large for profiles.">
  <template #preview>
    <div class="tuff-demo-row">
      <TxAvatar name="TA" />
      <TxAvatar name="UX" />
      <TxAvatar name="PM" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TxAvatar name="TA" />
  <TxAvatar name="UX" />
  <TxAvatar name="PM" />
</template>`' />
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <TxAvatar name="Talex" />
  <TxAvatar size="lg" name="Tuff" />
</template>
```

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'name', type: 'string', default: '-', description: 'Display name' },
  { name: 'src', type: 'string', default: '-', description: 'Avatar image URL' },
  { name: 'size', type: \"'sm' | 'md' | 'lg'\", default: 'md', description: 'Size' },
]" />

## Design Notes
- Uppercase initials by default.  
- Keep spacing between avatar and name consistent.
