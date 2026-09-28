<script lang="ts">
// Vue port of the `MetalBadge` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// Wrapper behavior only: the pill mask + the Figma layer stack are rebuilt
// here, on top of the verbatim `TxMetalFx` engine.
//
// "New" badge — Figma: Portfolio › tab 3 (1458:40880), applied verbatim.
//
//   45×25, pill r 55.556. Layers bottom→top:
//     1. white fill
//     2. metal texture (a static PNG in Figma — here the live shader, via a
//        full-pill mask so it covers the fill)
//     3. gradient rgba(255,255,255,.6) → 0, top→bottom
//     3b. clean white core under the label — transitions.dev get-pro-button
//         mechanism inverted: radial ellipse 46%, solid to `core`, ramp over
//         `coreBlur`, so the text sits on white and metal creeps in at the rim
//     4. text: Inter Semi Bold 12.222/1.4 #323232, box 26.667×13.333
//     5. inset shadows: 0 0 8.333 #fff ×2, 0 0 0 0.833 rgba(255,255,255,.5),
//        0 0.833 0 rgba(255,255,255,.78)
//
// The gradient AND the inset shadows have to sit above the metal canvas
// (z 0) and below the text (content z 5) — on the root they'd be painted
// under the opaque metal and vanish. Both live on one overlay inside the
// content layer, one level down: MetalFx normalises the *direct* child's
// background/box-shadow to transparent/none, so the overlay is nested under
// a plain wrapper to keep them.

const RADIUS = 55.556
const W = 45
const H = 25
const TEXT_W = 26.667
const TEXT_H = 13.333
const PAD_X = (W - TEXT_W) / 2

const LAYER = { position: 'absolute', inset: 0, pointerEvents: 'none' } as const

/**
 * `glow` scales the two soft inner glows; the hairline rims stay as designed.
 * Kept as a named helper (upstream's own) because the four inset layers are
 * magic metrics — an inline template literal would not explain them.
 */
const shadowFor = (k: number, glow: number): string =>
  `inset 0px 0px ${8.333 * k}px 0px rgba(255,255,255,${glow}), `
  + `inset 0px 0px ${8.333 * k}px 0px rgba(255,255,255,${glow}), `
  + `inset 0px 0px 0px ${0.833 * k}px rgba(255,255,255,0.5), `
  + `inset 0px ${0.833 * k}px 0px 0px rgba(255,255,255,0.78)`
</script>

<script setup lang="ts">
import { computed, useSlots, type CSSProperties } from 'vue'
import type { MaskFn } from './engine/renderer/core'
import TxMetalFx from './TxMetalFx.vue'
import { METAL_BADGE_DEFAULTS, type MetalBadgeProps } from './types'

defineOptions({ name: 'TxMetalBadge' })

const props = withDefaults(defineProps<MetalBadgeProps>(), {
  children: 'New',
  strength: 1,
  scale: 1,
  metalOpacity: METAL_BADGE_DEFAULTS.metalOpacity,
  shaderScale: METAL_BADGE_DEFAULTS.shaderScale,
  core: () => METAL_BADGE_DEFAULTS.core,
  gradient: METAL_BADGE_DEFAULTS.gradient,
  glow: METAL_BADGE_DEFAULTS.glow,
  textColor: '#323232',
})

const radiusPx = computed(() => RADIUS * props.scale)

// Full-fill mask: the pill itself.
const mask: MaskFn = (ctx, w, h, dpr) => {
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, RADIUS * dpr)
  ctx.fill()
}

const boxStyle = computed<CSSProperties>(() => ({
  position: 'relative',
  width: W * props.scale,
  height: H * props.scale,
  borderRadius: radiusPx.value,
}))
// layer 3b — clean white core under the label (rim-only metal)
const coreStyle = computed<CSSProperties>(() => ({
  ...LAYER,
  borderRadius: radiusPx.value,
  // Stops are relative to the ellipse radius, so 100% = its edge.
  background: `radial-gradient(ellipse ${props.core.size}% ${props.core.size}% at 50% 50%, rgba(255,255,255,1) ${props.core.r}%, rgba(255,255,255,0) ${Math.min(100, props.core.r + props.core.blur)}%)`,
  opacity: props.core.a,
}))
// layers 3 + 5 — white gradient and inset rims, over the metal
const washStyle = computed<CSSProperties>(() => ({
  ...LAYER,
  borderRadius: radiusPx.value,
  background: `linear-gradient(to bottom, rgba(255,255,255,${props.gradient}), rgba(255,255,255,0))`,
  boxShadow: shadowFor(props.scale, props.glow),
}))
// Inline layout only — no utility classes, so the badge renders the
// same with or without a CSS framework on the host page.
const labelStyle = computed<CSSProperties>(() => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  width: W * props.scale,
  height: H * props.scale,
  paddingLeft: PAD_X * props.scale,
  paddingRight: PAD_X * props.scale,
  font: `600 ${12.222 * props.scale}px/1.4 Inter, sans-serif`,
  color: props.textColor,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
}))

// The default slot is the Vue-native spelling (`<TxMetalBadge>Beta</TxMetalBadge>`);
// `children` stays supported because it is the upstream React prop and its
// documented default (`New`) lives there.
const slots = useSlots()
const slotText = computed<string>(() => (slots.default?.() ?? [])
  .map(node => (typeof node.children === 'string' ? node.children : ''))
  .join(''))
const label = computed<string>(() => slotText.value.trim() || props.children || '')
</script>

<template>
  <TxMetalFx
    preset="chromatic"
    :theme="props.theme"
    :strength="props.strength * props.metalOpacity"
    :shader-scale="props.shaderScale"
    :mask="mask"
    glow-mode="ring"
    :reflection-targets="props.reflectionTargets"
    :border-radius="radiusPx"
    :style="{ background: '#ffffff', borderRadius: radiusPx }"
  >
    <div :style="boxStyle">
      <div aria-hidden="true" :style="coreStyle" />
      <div aria-hidden="true" :style="washStyle" />
      <span :style="labelStyle" :aria-label="label">{{ slotText || props.children }}</span>
    </div>
  </TxMetalFx>
</template>
