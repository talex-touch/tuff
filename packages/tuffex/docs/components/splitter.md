# Splitter

A draggable split panel that divides two content areas with an adjustable divider. Splitter supports horizontal and vertical orientations, min/max constraints, and optional snap points.

<script setup lang="ts">
import { ref } from 'vue'
import SplitterBasicDemo from '../.vitepress/theme/components/demos/SplitterBasicDemo.vue'
import SplitterBasicDemoSource from '../.vitepress/theme/components/demos/SplitterBasicDemo.vue?raw'

const ratio = ref(0.4)
</script>

## Basic Usage

Place content in the `#a` (left/top) and `#b` (right/bottom) slots. The divider position is controlled via `v-model` as a ratio between 0 and 1.

<DemoBlock title="Splitter" :code="SplitterBasicDemoSource">
  <template #preview>
    <SplitterBasicDemo />
  </template>
</DemoBlock>

## Vertical Split

Set `direction="vertical"` for a top/bottom layout.

<DemoBlock title="Vertical Splitter">
<template #preview>
<div style="height: 240px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;">
  <TxSplitter v-model="ratio" direction="vertical">
    <template #a>
      <div style="padding: 16px; background: var(--vp-c-bg-soft);">Top Panel</div>
    </template>
    <template #b>
      <div style="padding: 16px;">Bottom Panel</div>
    </template>
  </TxSplitter>
</div>
</template>

<template #code>

```vue
<template>
  <TxSplitter v-model="ratio" direction="vertical">
    <template #a>Top Panel</template>
    <template #b>Bottom Panel</template>
  </TxSplitter>
</template>
```

</template>
</DemoBlock>

## Design Notes

- The `min` and `max` props prevent the divider from being dragged beyond usable bounds.
- Use `snap` to create magnetic stops — the divider will lock to the nearest multiple of the snap value while dragging.
- The divider bar size is adjustable via `barSize`. A larger bar is easier to grab on touch devices.
- Listen to `drag-start` and `drag-end` to coordinate with surrounding layout (e.g., disabling pointer events on iframes during drag).

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Split ratio between 0 and 1.', type: 'number', default: '0.5' },
  { name: 'direction', description: 'Orientation of the split.', type: '\"horizontal\" | \"vertical\"', default: '\"horizontal\"' },
  { name: 'min', description: 'Minimum ratio for the first panel.', type: 'number', default: '0.1' },
  { name: 'max', description: 'Maximum ratio for the first panel.', type: 'number', default: '0.9' },
  { name: 'disabled', description: 'Prevents dragging the divider.', type: 'boolean', default: 'false' },
  { name: 'barSize', description: 'Width/height of the divider bar in pixels.', type: 'number', default: '10' },
  { name: 'snap', description: 'Snap step for the ratio. 0 disables snapping.', type: 'number', default: '0' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires when the ratio changes.', type: '(ratio: number) => void' },
  { name: 'drag-start', description: 'Fires when the user begins dragging the divider.' },
  { name: 'drag-end', description: 'Fires when the user stops dragging.' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'a', description: 'Content for the first panel (left or top).' },
  { name: 'b', description: 'Content for the second panel (right or bottom).' },
]" />
