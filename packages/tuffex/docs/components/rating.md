# Rating

A star-based input for collecting user ratings. Rating supports whole-star and half-star precision, read-only display, and custom icons.

<script setup lang="ts">
import { ref } from 'vue'

const score = ref(3)
const half = ref(3.5)
</script>

## Basic Usage

Bind a numeric value with `v-model`. Click a star to set the rating.

<DemoBlock title="Basic Rating">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 12px;">
  <TxRating v-model="score" />
  <span style="font-size: 13px; color: var(--vp-c-text-2);">Score: {{ score }} / 5</span>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const score = ref(3)
</script>

<template>
  <TxRating v-model="score" />
</template>
```

</template>
</DemoBlock>

## Read-Only

Set `readonly` to display a rating without interaction — useful for showing average scores.

<DemoBlock title="Read-Only">
<template #preview>
<TxRating :model-value="4.5" readonly show-text />
</template>

<template #code>

```vue
<template>
  <TxRating :model-value="4.5" readonly show-text />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use `precision` to control granularity: `1` for whole stars, `0.5` for half stars.
- The `show-text` prop renders the numeric score next to the stars. Customize with the `#text` slot.
- For accessibility, ensure the rating has a visible label nearby.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'The current rating value.', type: 'number', default: '0' },
  { name: 'maxStars', description: 'Maximum number of stars.', type: 'number', default: '5' },
  { name: 'precision', description: 'Rating step size. Use 0.5 for half-star precision.', type: 'number', default: '1' },
  { name: 'disabled', description: 'Fully disabled, no interaction.', type: 'boolean', default: 'false' },
  { name: 'readonly', description: 'Display-only mode. Stars are not interactive.', type: 'boolean', default: 'false' },
  { name: 'showText', description: 'Whether to show the numeric value alongside stars.', type: 'boolean', default: 'false' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires when the rating value changes.', type: '(value: number) => void' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'text', description: 'Custom text display next to the stars.', type: '{ value: number, max: number }' },
]" />
