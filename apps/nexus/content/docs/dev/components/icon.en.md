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
```vue
<template>
  <TuffIcon name="i-ri-home-line" />
  <TuffIcon name="chevron-down" />
</template>
```

## Demo
<TuffDemo title="Icon Density" description="Keep icon rhythm and spacing consistent.">
  <template #preview>
    <div class="tuff-demo-row">
      <TuffIcon name="i-ri-home-line" />
      <TuffIcon name="i-ri-search-line" />
      <TuffIcon name="i-ri-settings-3-line" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TuffIcon name="i-ri-home-line" />
  <TuffIcon name="i-ri-search-line" />
  <TuffIcon name="i-ri-settings-3-line" />
</template>`' />
  </template>
</TuffDemo>

## Types & Sources
- `class`: icon class name (recommended).
- `emoji`: lightweight emphasis.
- `file` / `url`: local or remote icons.
- `builtin`: built-in common icons.

## API (Lite)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `-` | Icon name or class |
| `size` | `number` | `16` | Icon size |
| `colorful` | `boolean` | `false` | Keep original colors |

## Design Notes
- Use 16/18/20 sizes when aligning with text.  
- Prefer line icons in dense lists to reduce visual noise.
