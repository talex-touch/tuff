---
title: Dialog
description: Confirmation flows and critical decisions
category: Feedback
status: beta
since: 1.0.0
tags: [dialog, modal, confirm]
---

# Dialog

> For critical confirmations, with strict focus control and hierarchy.  
> **Status**: Beta

## Basic Usage
```vue
<template>
  <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
  <TxModal v-model="dialogOpen" title="Delete project">
    <p>This action cannot be undone. Continue?</p>
  </TxModal>
</template>
```

## Demo
<TuffDemo
  title="Critical Confirm"
  description="Keep focus and a decisive hierarchy."
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TxButton @click=\\\"dialogOpen = true\\\"&gt;Open Dialog&lt;/TxButton&gt;", "  &lt;TxModal v-model=\\\"dialogOpen\\\" title=\\\"Delete project\\\"&gt;", "    &lt;p&gt;This action cannot be undone. Continue?&lt;/p&gt;", "    &lt;template #footer&gt;", "      &lt;TxButton variant=\\\"ghost\\\"&gt;Cancel&lt;/TxButton&gt;", "      &lt;TxButton&gt;Confirm&lt;/TxButton&gt;", "    &lt;/template&gt;", "  &lt;/TxModal&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <TuffDialogDemo
      trigger-label="Open Dialog"
      title="Delete project"
      content="This action cannot be undone. Continue?"
      cancel-label="Cancel"
      confirm-label="Confirm"
    />
  </template>
</TuffDemo>

## Interaction Notes
- Lock background scroll on open.  
- Primary action must be explicit.  
- ESC and overlay close should be configurable.

## API (Lite)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `boolean` | `false` | Dialog visibility |
| `title` | `string` | `''` | Title |
| `width` | `string` | `'480px'` | Width |

## Design Notes
- Prioritize hierarchy and readability over decoration.  
- Keep motion short and decisive.
