---
title: Tooltip
description: Lightweight hints and hierarchy
category: Feedback
status: beta
since: 1.0.0
tags: [tooltip, hint, overlay]
---

# Tooltip

> Small and lightweight hints that do not interrupt the flow.  
> **Status**: Beta

## Demo
<TuffDemo title="Hover Hint" description="Short hints with low intrusion.">
  <template #preview>
    <div class="tuff-demo-row">
      <TxTooltip content="Hint">
        <TxButton variant="ghost">Hover me</TxButton>
      </TxTooltip>
      <TxTooltip content="Info">
        <TxButton variant="ghost">Info</TxButton>
      </TxTooltip>
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxTooltip content="Hint">
    <TxButton variant="ghost">Hover me</TxButton>
  </TxTooltip>
</template>`" />
  </template>
</TuffDemo>

## Basic Usage
```vue
<template>
  <TxTooltip content="Copied">
    <TxButton variant="ghost">Copy</TxButton>
  </TxTooltip>
</template>
```

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'content', type: 'string', default: '-', description: 'Tooltip text' },
  { name: 'placement', type: 'string', default: 'top', description: 'Placement' },
  { name: 'open-delay', type: 'number', default: '120', description: 'Open delay (ms)' },
  { name: 'close-delay', type: 'number', default: '80', description: 'Close delay (ms)' },
]" />

## Design Notes
- Keep text short, avoid multiline.  
- Maintain light spacing from the trigger element.
