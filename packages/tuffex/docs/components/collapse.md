# Collapse

An accordion-style component that expands and collapses content sections. Each `TxCollapseItem` can be toggled independently, or set to `accordion` mode where only one item can be open at a time.

<script setup lang="ts">
import { ref } from 'vue'

const active = ref(['1'])
const accordion = ref('1')
</script>

## Basic Usage

Wrap multiple `TxCollapseItem` components inside `TxCollapse`. Bind `v-model` to track which items are expanded.

<DemoBlock title="Basic Collapse">
<template #preview>
<div style="max-width: 480px;">
  <TxCollapse v-model="active">
    <TxCollapseItem title="What is TuffEx?" name="1">
      TuffEx is a Vue 3 component library focused on smooth interactions and tactile feedback.
    </TxCollapseItem>
    <TxCollapseItem title="How do I install it?" name="2">
      Run pnpm add @talex-touch/tuffex to install the package, then import components on demand.
    </TxCollapseItem>
    <TxCollapseItem title="Is it production ready?" name="3">
      TuffEx is actively used in the Tuff desktop application and is continuously improved.
    </TxCollapseItem>
  </TxCollapse>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const active = ref(['1'])
</script>

<template>
  <TxCollapse v-model="active">
    <TxCollapseItem title="What is TuffEx?" name="1">
      A Vue 3 component library for smooth interactions.
    </TxCollapseItem>
    <TxCollapseItem title="How do I install it?" name="2">
      Run pnpm add @talex-touch/tuffex.
    </TxCollapseItem>
  </TxCollapse>
</template>
```

</template>
</DemoBlock>

## Accordion Mode

Set `accordion` to allow only one item to be open at a time.

<DemoBlock title="Accordion">
<template #preview>
<div style="max-width: 480px;">
  <TxCollapse v-model="accordion" accordion>
    <TxCollapseItem title="Section A" name="1">
      Content for section A. Opening another section closes this one.
    </TxCollapseItem>
    <TxCollapseItem title="Section B" name="2">
      Content for section B.
    </TxCollapseItem>
    <TxCollapseItem title="Section C (Disabled)" name="3" disabled>
      This section cannot be toggled.
    </TxCollapseItem>
  </TxCollapse>
</div>
</template>

<template #code>

```vue
<template>
  <TxCollapse v-model="active" accordion>
    <TxCollapseItem title="Section A" name="1">...</TxCollapseItem>
    <TxCollapseItem title="Section B" name="2">...</TxCollapseItem>
    <TxCollapseItem title="Disabled" name="3" disabled>...</TxCollapseItem>
  </TxCollapse>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use Collapse for FAQ sections, settings panels, or any content that benefits from progressive disclosure.
- The expand/collapse animation is handled internally with smooth height transitions.
- In accordion mode, `v-model` binds to a single string. In multi mode, it binds to a string array.

## API

### TxCollapse Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Active panel name(s).', type: 'string | string[]' },
  { name: 'accordion', description: 'When true, only one panel can be open at a time.', type: 'boolean', default: 'false' },
]" />

### TxCollapse Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires when the active panel changes.', type: '(value: string | string[]) => void' },
]" />

### TxCollapseItem Props

<ApiSpecTable :rows="[
  { name: 'title', description: 'The header text.', type: 'string' },
  { name: 'name', description: 'Unique identifier for this panel.', type: 'string' },
  { name: 'disabled', description: 'Prevents the panel from being toggled.', type: 'boolean', default: 'false' },
]" />

### TxCollapseItem Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The collapsible content.' },
  { name: 'title', description: 'Custom header content. Replaces the title prop.' },
]" />
