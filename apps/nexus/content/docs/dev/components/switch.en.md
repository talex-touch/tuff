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

## Basic Usage
```vue
<template>
  <TuffSwitch v-model="enabled" />
  <TuffSwitch v-model="enabled" size="small" />
</template>
```

## Demo
<TuffDemo
  title="Toggle State"
  description="Movement and color change together."
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TuffSwitch :model-value=\\"false\\" /&gt;", "  &lt;TuffSwitch :model-value=\\"true\\" /&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TuffSwitch :model-value="false" />
      <TuffSwitch :model-value="true" />
    </div>
  </template>
</TuffDemo>

## States
- `disabled`: disabled state  
- `loading`: loading state  
- `size`: `small` / `medium` / `large`

## API (Lite)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `boolean` | `false` | Switch value |
| `size` | `'small' | 'medium' | 'large'` | `'medium'` | Size |
| `disabled` | `boolean` | `false` | Disabled state |

## Design Notes
- Movement and color should sync.  
- Use smaller size for dense lists, larger for settings.
