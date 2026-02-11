# VirtualList

Renders large datasets efficiently by only mounting the DOM nodes currently visible in the viewport. Instead of creating thousands of elements, VirtualList calculates which items are in view and renders only those — plus a small overscan buffer for smooth scrolling.

Use VirtualList when your list exceeds a few hundred items and you need consistent, jank-free scroll performance.

<script setup lang="ts">
import { ref, computed } from 'vue'

const items = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  label: `Item ${i + 1}`,
  description: `Description for item ${i + 1}`
}))

const shortItems = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)
</script>

## Basic Usage

Provide an `items` array, specify the fixed `item-height` in pixels, and define the `#item` slot to render each row.

<DemoBlock title="Basic">
<template #preview>
<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;">
  <TxVirtualList :items="shortItems" :item-height="36" height="240px">
    <template #item="{ item, index }">
      <div style="padding: 6px 12px; display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--vp-c-text-3); font-size: 12px; min-width: 28px;">{{ index + 1 }}</span>
        <span>{{ item }}</span>
      </div>
    </template>
  </TxVirtualList>
</div>
</template>

<template #code>

```vue
<script setup>
const items = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)
</script>

<template>
  <TxVirtualList :items="items" :item-height="36" height="240px">
    <template #item="{ item, index }">
      <div style="padding: 6px 12px;">
        {{ index + 1 }}. {{ item }}
      </div>
    </template>
  </TxVirtualList>
</template>
```

</template>
</DemoBlock>

## Large Dataset

VirtualList handles thousands of items without breaking a sweat. The DOM node count stays constant regardless of the data size.

<DemoBlock title="1,000 Items">
<template #preview>
<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;">
  <TxVirtualList :items="items" :item-height="48" height="320px" :overscan="6">
    <template #item="{ item, index }">
      <div style="padding: 8px 16px; display: flex; flex-direction: column; justify-content: center;">
        <span style="font-weight: 500;">{{ item.label }}</span>
        <span style="font-size: 12px; color: var(--vp-c-text-3);">{{ item.description }}</span>
      </div>
    </template>
  </TxVirtualList>
</div>
</template>

<template #code>

```vue
<script setup>
const items = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  label: `Item ${i + 1}`,
  description: `Description for item ${i + 1}`
}))
</script>

<template>
  <TxVirtualList :items="items" :item-height="48" height="320px" :overscan="6">
    <template #item="{ item }">
      <div style="padding: 8px 16px;">
        <span>{{ item.label }}</span>
        <span>{{ item.description }}</span>
      </div>
    </template>
  </TxVirtualList>
</template>
```

</template>
</DemoBlock>

## Design Notes

- **Fixed item height is required.** VirtualList uses a fixed-height calculation model. Every row must be the same height, specified via `item-height`.
- **Overscan** controls how many extra rows are rendered above and below the viewport. A higher value (6–8) prevents blank flashes during fast scrolling; a lower value (2–3) reduces DOM pressure.
- Use `item-key` to provide a stable identity for each row. This improves reconciliation performance when the list data updates.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'items', description: 'The data array to render.', type: 'T[]', default: '[]' },
  { name: 'itemHeight', description: 'The fixed height (in pixels) of each row. Required for layout calculation.', type: 'number', default: '—' },
  { name: 'height', description: 'The container height. Accepts a number (px) or CSS string.', type: 'number | string', default: '320' },
  { name: 'overscan', description: 'Number of extra rows rendered above and below the visible area.', type: 'number', default: '4' },
  { name: 'itemKey', description: 'A property name or function to generate a unique key for each item.', type: 'string | ((item: T, index: number) => string | number)', default: 'index' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'scroll', description: 'Fires on scroll with the current scroll state.', type: '({ scrollTop, startIndex, endIndex }) => void' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'item', description: 'Custom renderer for each row. Receives the item data and its index.', type: '{ item: T, index: number }' },
]" />

### Exposed Methods

<ApiSpecTable title="Methods" :rows="[
  { name: 'scrollToIndex(index)', description: 'Scroll the list to bring the item at the given index into view.' },
  { name: 'scrollToTop()', description: 'Scroll to the beginning of the list.' },
  { name: 'scrollToBottom()', description: 'Scroll to the end of the list.' },
]" />
