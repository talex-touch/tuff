# FlipOverlay

A cinematic expand-from-source overlay with 3D flip animation. FlipOverlay morphs a small element into a full-screen card using GSAP-powered perspective transforms — perfect for detail views, image previews, and card-to-page transitions.

<script setup lang="ts">
import { ref } from 'vue'

const show = ref(false)
const triggerRef = ref<HTMLElement>()
</script>

## Basic Usage

Bind `v-model` to control visibility and pass a `source` element so the overlay knows where to animate from.

<DemoBlock title="FlipOverlay">
<template #preview>
<div>
  <TxButton ref="triggerRef" @click="show = true">Open Overlay</TxButton>
  <TxFlipOverlay v-model="show" :source="triggerRef?.$el">
    <template #default="{ close }">
      <div style="padding: 32px;">
        <h3 style="margin: 0 0 8px;">Detail View</h3>
        <p style="color: var(--vp-c-text-2); margin: 0 0 16px;">This content flipped in from the button above.</p>
        <TxButton size="sm" @click="close">Close</TxButton>
      </div>
    </template>
  </TxFlipOverlay>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const show = ref(false)
const triggerRef = ref()
</script>

<template>
  <TxButton ref="triggerRef" @click="show = true">
    Open Overlay
  </TxButton>

  <TxFlipOverlay v-model="show" :source="triggerRef?.$el">
    <template #default="{ close }">
      <div style="padding: 32px;">
        <h3>Detail View</h3>
        <p>This content flipped in from the button.</p>
        <TxButton @click="close">Close</TxButton>
      </div>
    </template>
  </TxFlipOverlay>
</template>
```

</template>
</DemoBlock>

## Design Notes

- The animation origin is determined by the `source` prop — pass an `HTMLElement` or `DOMRect` so the overlay morphs from the correct position.
- The 3D flip uses configurable `perspective`, `rotateX`, and `rotateY` values. Defaults produce a subtle, natural-feeling tilt.
- Set `maskClosable` to `false` if closing should only happen via the slot's `close()` function.
- The `randomTilt` prop adds slight variance to each animation, making repeated opens feel organic rather than mechanical.
- Use the lifecycle events (`open`, `opened`, `close`, `closed`) to coordinate surrounding UI changes like hiding the source element.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Controls overlay visibility.', type: 'boolean', default: 'false' },
  { name: 'source', description: 'Origin element or rect for the flip animation.', type: 'HTMLElement | DOMRect | null', default: 'null' },
  { name: 'sourceRadius', description: 'Border radius inherited from the source element.', type: 'string | null', default: 'null' },
  { name: 'duration', description: 'Animation duration in milliseconds.', type: 'number', default: '480' },
  { name: 'perspective', description: 'CSS perspective for the 3D transform.', type: 'number', default: '1200' },
  { name: 'rotateX', description: 'Degrees of X-axis rotation.', type: 'number', default: '6' },
  { name: 'rotateY', description: 'Degrees of Y-axis rotation.', type: 'number', default: '8' },
  { name: 'randomTilt', description: 'Add slight random variance to each flip.', type: 'boolean', default: 'true' },
  { name: 'tiltRange', description: 'Variance range for random tilt (degrees).', type: 'number', default: '2' },
  { name: 'easeOut', description: 'GSAP easing for the open animation.', type: 'string', default: '\"back.out(1.25)\"' },
  { name: 'easeIn', description: 'GSAP easing for the close animation.', type: 'string', default: '\"back.in(1)\"' },
  { name: 'maskClosable', description: 'Whether clicking the backdrop closes the overlay.', type: 'boolean', default: 'true' },
  { name: 'maskClass', description: 'Custom CSS class for the backdrop.', type: 'string', default: '\"\"' },
  { name: 'cardClass', description: 'Custom CSS class for the content card.', type: 'string', default: '\"\"' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'open', description: 'Fires when the opening animation starts.' },
  { name: 'opened', description: 'Fires when the opening animation completes.' },
  { name: 'close', description: 'Fires when the closing animation starts.' },
  { name: 'closed', description: 'Fires when the closing animation completes.' },
  { name: 'update:expanded', description: 'Syncs the expanded state.', type: '(value: boolean) => void' },
  { name: 'update:animating', description: 'Syncs the animating state.', type: '(value: boolean) => void' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'Overlay content. Receives slot props for controlling the overlay.', type: '{ close: () => void, expanded: boolean, animating: boolean }' },
]" />
