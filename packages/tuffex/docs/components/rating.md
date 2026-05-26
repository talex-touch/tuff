# Rating

A star-based input for collecting user ratings. Rating supports whole-star and half-star precision, read-only display, and custom icons.

<script setup lang="ts">
import { ref } from 'vue'

const score = ref(3)
const half = ref(3.5)
const custom = ref(4)
const heart = ref(4.5)
const ratingApiRows1 = [
  { name: 'modelValue / v-model', description: 'The current rating value.', type: 'number', default: '0' },
  { name: 'maxStars', description: 'Maximum number of stars.', type: 'number', default: '5' },
  { name: 'precision', description: 'Rating step size. Use 0.5 for half-star precision.', type: 'number', default: '1' },
  { name: 'disabled', description: 'Fully disabled, no interaction.', type: 'boolean', default: 'false' },
  { name: 'readonly', description: 'Display-only mode. Stars are not interactive.', type: 'boolean', default: 'false' },
  { name: 'showText', description: 'Whether to show the numeric value alongside stars.', type: 'boolean', default: 'false' },
  { name: 'icon', description: 'Shared icon for filled and empty states.', type: 'string | TxIconSource', default: '-' },
  { name: 'filledIcon', description: 'Icon used by the filled layer.', type: 'string | TxIconSource', default: 'star' },
  { name: 'emptyIcon', description: 'Icon used by the empty layer.', type: 'string | TxIconSource', default: 'star' },
  { name: 'halfIcon', description: 'Dedicated half icon. When omitted, Rating clips the filled layer from the left.', type: 'string | TxIconSource', default: '-' },
  { name: 'filledColor', description: 'Color for filled stars.', type: 'string', default: '#fbbf24' },
  { name: 'emptyColor', description: 'Color for empty stars.', type: 'string', default: '#d1d5db' },
  { name: 'hoverColor', description: 'Color for hovered filled stars.', type: 'string', default: 'filledColor' },
  { name: 'textColor', description: 'Color for the text label.', type: 'string', default: '#6b7280' },
  { name: 'size', description: 'Star icon size.', type: 'number | string', default: '20px' },
  { name: 'gap', description: 'Gap between stars.', type: 'number | string', default: '2px' },
  { name: 'animated', description: 'Whether to play the click pop animation.', type: 'boolean', default: 'true' },

]

const ratingApiRows2 = [
  { name: 'change', description: 'Fires when the rating value changes.', type: '(value: number) => void' },

]

const ratingApiRows3 = [
  { name: 'text', description: 'Custom text display next to the stars.', type: '{ value: number, max: number }' },

]
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

## Custom Style

Tune colors, size, spacing, and text color with props.

<DemoBlock title="Custom Style">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 12px;">
  <TxRating
    v-model="custom"
    :precision="0.5"
    :size="28"
    :gap="6"
    filled-color="#f97316"
    empty-color="rgba(148, 163, 184, 0.34)"
    hover-color="#fb923c"
    text-color="#f97316"
    show-text
  />
  <TxRating
    v-model="heart"
    :precision="0.5"
    :size="28"
    icon="i-carbon-favorite-filled"
    filled-color="#f43f5e"
    empty-color="rgba(244, 63, 94, 0.18)"
    hover-color="#fb7185"
    text-color="#f43f5e"
    show-text
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxRating
    v-model="score"
    :precision="0.5"
    :size="28"
    :gap="6"
    filled-color="#f97316"
    empty-color="rgba(148, 163, 184, 0.34)"
    hover-color="#fb923c"
    show-text
  />
  <TxRating
    v-model="heart"
    icon="i-carbon-favorite-filled"
    filled-color="#f43f5e"
    empty-color="rgba(244, 63, 94, 0.18)"
  />
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
- Half stars fill from the left side. By default Rating clips the filled layer; set `halfIcon` only when you need a dedicated half icon.
- Use `filledColor`, `emptyColor`, `hoverColor`, `size`, `gap`, and `icon` for quick customization, including Iconify hearts and emoji icons.
- Clicks play a visible bounce + glow + ripple animation by default; disable it with `animated=false`.
- The `show-text` prop renders the numeric score next to the stars. Customize with the `#text` slot.
- Rating exposes the star group as a radio group. Keep a visible label nearby.
- `readonly` is display-only: it keeps the rating visible but removes star button interaction.

## API

### Props

<ApiSpecTable :rows="ratingApiRows1" />

### Events

<ApiSpecTable title="Events" :rows="ratingApiRows2" />

### Slots

<ApiSpecTable title="Slots" :rows="ratingApiRows3" />
