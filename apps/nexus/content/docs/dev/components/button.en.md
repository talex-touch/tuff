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

## Basic Usage
```vue
<template>
  <TxButton>Primary</TxButton>
  <TuffFlatButton>Flat</TuffFlatButton>
</template>
```

## States & Variants
- `loading`: loading state  
- `disabled`: disabled state  
- `size`: `sm` / `md` / `lg` (scales visuals and tactile response)

## Composition
```vue
<template>
  <TxButton icon="i-ri-add-line">Create</TxButton>
  <TxButton variant="ghost">Ghost</TxButton>
</template>
```

## Demo
<TuffDemo title="Primary / Flat" description="Tactile primary and restrained flat styles.">
  <template #preview>
    <div class="tuff-demo-row">
      <TxButton>Primary</TxButton>
      <TuffFlatButton>Flat</TuffFlatButton>
      <TxButton variant="ghost">Ghost</TxButton>
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxButton>Primary</TxButton>
  <TuffFlatButton>Flat</TuffFlatButton>
  <TxButton variant="ghost">Ghost</TxButton>
</template>`" />
  </template>
</TuffDemo>

## Demo Conventions
- Wrap interactive demos in `client-only`.  
- Demos must be copyable and runnable (no screenshot-only blocks).

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'variant', type: \"'primary' | 'secondary' | 'ghost' | 'danger'\", default: 'primary', description: 'Visual style' },
  { name: 'size', type: \"'sm' | 'md' | 'lg'\", default: 'md', description: 'Size' },
  { name: 'loading', type: 'boolean', default: 'false', description: 'Loading state' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disabled state' },
]" />

## Design Notes
- Emphasize press feedback with smooth rebound.  
- Translucent surfaces need proper background contrast.  
- Keep icon/text spacing consistent to avoid visual drift.
