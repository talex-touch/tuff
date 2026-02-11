# Badge

A small status indicator displayed alongside an element — typically a count or a dot. Badges are commonly placed on icons, avatars, or navigation items to signal unread notifications, pending actions, or status changes.

## Basic Usage

Wrap any element with `TxBadge` and set `value` to display a count.

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(5)
</script>

<DemoBlock title="Badge Variants">
<template #preview>
<div style="display: flex; gap: 24px; align-items: center;">
  <TxBadge :value="count" variant="error">
    <TxButton>Messages</TxButton>
  </TxBadge>
  <TxBadge :value="99" variant="primary">
    <TxButton variant="ghost">Notifications</TxButton>
  </TxBadge>
  <TxBadge dot variant="success">
    <TxAvatar size="small">U</TxAvatar>
  </TxBadge>
</div>
</template>

<template #code>

```vue
<template>
  <TxBadge :value="5" variant="error">
    <TxButton>Messages</TxButton>
  </TxBadge>

  <TxBadge dot variant="success">
    <TxAvatar size="small">U</TxAvatar>
  </TxBadge>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use `dot` mode for simple presence indicators (online status, new activity) where the exact count is not important.
- Numeric badges should display meaningful counts. For very large numbers, consider capping at `99+` in your application logic.
- Badge colors map to the variant system: `error` for urgent, `primary` for informational, `success` for positive, `warning` for caution.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'variant', description: 'Color variant.', type: '\"default\" | \"primary\" | \"success\" | \"warning\" | \"error\"', default: '\"default\"' },
  { name: 'value', description: 'The numeric value to display.', type: 'number', default: '0' },
  { name: 'dot', description: 'When true, shows a small dot instead of a count.', type: 'boolean', default: 'false' },
  { name: 'color', description: 'Custom badge color. Overrides variant color.', type: 'string' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The target element that the badge is attached to.' },
]" />
