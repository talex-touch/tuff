# Badge

A small inline status indicator — typically a count, label, or dot. Use it alongside icons, avatars, or navigation items to signal unread notifications, pending actions, or status changes.

## Basic Usage

Set `value` to display a count or label. The default slot replaces the pill text; positioning next to an icon or avatar is handled by the surrounding layout.

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(5)
</script>

<DemoBlock title="Badge Variants">
<template #preview>
<div style="display: flex; gap: 24px; align-items: center;">
  <TxBadge :value="count" variant="error" />
  <TxBadge value="New" variant="primary" />
  <TxBadge dot variant="success" />
</div>
</template>

<template #code>

```vue
<template>
  <TxBadge :value="5" variant="error" />
  <TxBadge value="New" variant="primary" />
  <TxBadge dot variant="success" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use `dot` mode for simple presence indicators (online status, new activity) where the exact count is not important.
- Numeric badges should display meaningful counts. For very large numbers, consider capping at `99+` in your application logic.
- Badge colors map to the variant system: `error` for urgent, `primary` for informational, `success` for positive, `warning` for caution.
- The default slot replaces the badge content; it does not position the badge around another target element.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'variant', description: 'Color variant.', type: '\"default\" | \"primary\" | \"success\" | \"warning\" | \"error\"', default: '\"default\"' },
  { name: 'value', description: 'The value to display.', type: 'string | number', default: '0' },
  { name: 'dot', description: 'When true, shows a small dot instead of a count.', type: 'boolean', default: 'false' },
  { name: 'color', description: 'Custom badge color. Overrides variant color.', type: 'string' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'Custom pill content. Replaces the value prop.' },
]" />
