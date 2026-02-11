# Modal

A centered dialog that overlays the page to focus the user's attention on a specific task or piece of information. Modal blocks interaction with the underlying content until it is dismissed.

Use modals for confirmations, forms, or content that requires a deliberate response before proceeding.

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
</script>

## Basic Usage

Bind a boolean with `v-model` to control visibility. Add a `title` and place content in the default slot.

<DemoBlock title="Basic Modal">
<template #preview>
<div>
  <TxButton @click="visible = true">Open Modal</TxButton>
  <TxModal v-model="visible" title="Confirm Action">
    <p style="margin: 0; color: var(--vp-c-text-2);">Are you sure you want to proceed with this action? This cannot be undone.</p>
    <template #footer>
      <TxButton variant="ghost" @click="visible = false">Cancel</TxButton>
      <TxButton @click="visible = false">Confirm</TxButton>
    </template>
  </TxModal>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const visible = ref(false)
</script>

<template>
  <TxButton @click="visible = true">Open Modal</TxButton>

  <TxModal v-model="visible" title="Confirm Action">
    <p>Are you sure you want to proceed?</p>

    <template #footer>
      <TxButton variant="ghost" @click="visible = false">Cancel</TxButton>
      <TxButton @click="visible = false">Confirm</TxButton>
    </template>
  </TxModal>
</template>
```

</template>
</DemoBlock>

## Design Notes

- The modal backdrop uses a subtle blur effect to visually separate the dialog from the underlying content.
- Entrance and exit animations use scale + opacity for a smooth, non-jarring transition.
- The `#footer` slot is designed for action buttons. Place the primary action on the right.
- Modal width defaults to `480px`. Override with the `width` prop for wider content.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Controls the visibility of the modal.', type: 'boolean' },
  { name: 'title', description: 'The title displayed in the modal header.', type: 'string', default: '\"\"' },
  { name: 'width', description: 'The width of the modal dialog.', type: 'string', default: '\"480px\"' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'close', description: 'Fires when the modal is closed (by backdrop click, escape key, or programmatically).' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The main content of the modal.' },
  { name: 'header', description: 'Custom header content. Replaces the title prop.' },
  { name: 'footer', description: 'Footer area, typically used for action buttons.' },
]" />
