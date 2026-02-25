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
  <TxFlipOverlay
    v-model="show"
    :source="triggerRef?.$el"
    header-title="Detail View"
    header-desc="Built-in header with default round close button"
  >
    <template #default="{ close }">
      <div style="padding: 32px;">
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

  <TxFlipOverlay
    v-model="show"
    :source="triggerRef?.$el"
    header-title="Detail View"
    header-desc="Built-in header with default round close button"
  >
    <template #default="{ close }">
      <div style="padding: 32px;">
        <p>This content flipped in from the button.</p>
        <TxButton @click="close">Close</TxButton>
      </div>
    </template>
  </TxFlipOverlay>
</template>
```

</template>
</DemoBlock>

## Header Composition

Use the built-in header by default, or customize header areas with dedicated slots.

<DemoBlock title="Header Actions">
<template #preview>
<div>
  <TxButton ref="triggerRef" @click="show = true">Open Config Overlay</TxButton>
  <TxFlipOverlay
    v-model="show"
    :source="triggerRef?.$el"
    header-title="Sync Details"
    header-desc="Header actions stay left of the close button"
  >
    <template #header-actions="{ close }">
      <TxButton size="sm" variant="secondary">Refresh</TxButton>
      <TxButton size="sm" variant="ghost" @click="close">Cancel</TxButton>
    </template>
    <template #default>
      <div style="padding: 24px;">
        Overlay body content.
      </div>
    </template>
  </TxFlipOverlay>
</div>
</template>

<template #code>

```vue
<TxFlipOverlay
  v-model="show"
  :source="triggerRef?.$el"
  header-title="Sync Details"
  header-desc="Header actions stay left of the close button"
>
  <template #header-actions="{ close }">
    <TxButton size="sm" variant="secondary">Refresh</TxButton>
    <TxButton size="sm" variant="ghost" @click="close">Cancel</TxButton>
  </template>

  <template #default>
    <div style="padding: 24px;">Overlay body content.</div>
  </template>
</TxFlipOverlay>
```

</template>
</DemoBlock>

## Design Notes

- The animation origin is determined by the `source` prop — pass an `HTMLElement` or `DOMRect` so the overlay morphs from the correct position.
- The 3D flip uses configurable `perspective`, `rotateX`, and `rotateY` values. Defaults produce a subtle, natural-feeling tilt.
- Header priority rules:
  1. `#header` fully overrides all built-in header logic.
  2. Without `#header`, set `header=false` to disable the built-in header.
  3. With `header=true`, built-in header uses `#header-display`, `#header-actions`, and `#header-close`.
- Set `closable=false` to hide the header close area entirely.
- The card uses a built-in `surface` background layer (`TxBaseSurface`) by default; configure it with `surface` / `surfaceColor` / `surfaceOpacity`.
- `globalMask` controls the full-screen backdrop mask and is enabled by default.
- `border` controls card border style (`solid` / `dashed` / `none`, `dash` is accepted as an alias of `dashed`).
- Set `maskClosable=false` if mask click should not close the overlay.
- When multiple overlays are open, backdrop rendering is handled by a single shared global mask layer placed below all overlay cards; only the topmost overlay keeps the interactive click layer, while underlays are non-interactive.
- Stack displacement is automatic only when adjacent overlays have similar size (`|delta| <= max(8px, previousSize * 5%)` on both width and height).
- In stacked state, matched underlays use progressive transform (`translateY -18px/-36px/-54px`, scale `0.95/0.90/0.85`), and deeper layers gradually fade (`1.00 → 0.92 → 0.78 → 0.62 → 0.38 → 0.16 → 0`).
- Set `preventAccidentalClose=true` to enable a safety mode: mask click will be blocked, page exit attempts (refresh/close) are intercepted, and blocked attempts trigger a red warning glow around the card.
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
  { name: 'preventAccidentalClose', description: 'Enable accidental-close protection: block mask close, intercept page exit, and flash a red warning glow when blocked.', type: 'boolean', default: 'false' },
  { name: 'globalMask', description: 'Whether to render the full-screen visual mask layer.', type: 'boolean', default: 'true' },
  { name: 'surface', description: 'Built-in card surface mode.', type: '\"pure\" | \"mask\" | \"blur\" | \"glass\" | \"refraction\"', default: '\"refraction\"' },
  { name: 'surfaceColor', description: 'Custom surface base color.', type: 'string', default: '\"\" (uses theme overlay color)' },
  { name: 'surfaceOpacity', description: 'Surface opacity for mask-style rendering.', type: 'number', default: '0.96' },
  { name: 'header', description: 'Enable built-in header when no #header slot is provided.', type: 'boolean', default: 'true' },
  { name: 'headerTitle', description: 'Built-in header title text.', type: 'string', default: '\"\"' },
  { name: 'headerDesc', description: 'Built-in header description text.', type: 'string', default: '\"\"' },
  { name: 'closable', description: 'Show built-in round close button in header.', type: 'boolean', default: 'true' },
  { name: 'closeAriaLabel', description: 'ARIA label for built-in close button.', type: 'string', default: '\"Close\"' },
  { name: 'maskClass', description: 'Custom CSS class for the backdrop.', type: 'string', default: '\"\"' },
  { name: 'cardClass', description: 'Custom CSS class for the content card.', type: 'string', default: '\"\"' },
  { name: 'border', description: 'Card border style (`dash` is accepted as `dashed`).', type: '\"solid\" | \"dashed\" | \"dash\" | \"none\"', default: '\"solid\"' },
  { name: 'scrollable', description: 'Whether overlay body should scroll internally.', type: 'boolean', default: 'true' },
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
  { name: 'default', description: 'Overlay body content.', type: '{ close: () => void, expanded: boolean, animating: boolean, closable: boolean, headerTitle?: string, headerDesc?: string }' },
  { name: 'header', description: 'Fully custom header. Overrides built-in header system.', type: '{ close: () => void, expanded: boolean, animating: boolean, closable: boolean, headerTitle?: string, headerDesc?: string }' },
  { name: 'header-display', description: 'Custom title/description area in built-in header.', type: '{ close: () => void, expanded: boolean, animating: boolean, closable: boolean, headerTitle?: string, headerDesc?: string }' },
  { name: 'header-actions', description: 'Custom actions placed to the left of close button.', type: '{ close: () => void, expanded: boolean, animating: boolean, closable: boolean, headerTitle?: string, headerDesc?: string }' },
  { name: 'header-close', description: 'Custom close area. Ignored when closable=false.', type: '{ close: () => void, expanded: boolean, animating: boolean, closable: boolean, headerTitle?: string, headerDesc?: string }' },
]" />
