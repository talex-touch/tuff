<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { PrismGlowProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PRISM_GLOW_CONES } from './cones'

defineOptions({ name: 'TxPrismGlow' })

const props = withDefaults(defineProps<PrismGlowProps>(), {
  active: true,
  palette: 'spectrum',
  placement: 'bottom',
  intensity: 1,
  duration: 6,
  collapseOnGrow: true,
  growTarget: null,
})

const DEFAULT_DURATION = 6
/**
 * Sub-pixel rounding and a font swap's reflow move a box by a few pixels; content arriving adds
 * at least a line. Only growth past this counts, so a late web font never retracts the light.
 */
const GROW_THRESHOLD_PX = 8

// Both properties are written on every render: a `:style` entry left `undefined`
// does not keep the old value, Vue deletes the custom property.
const rootStyle = computed<CSSProperties>(() => {
  const intensity = Number(props.intensity)
  const duration = Number(props.duration)
  return {
    '--tx-prism-glow-intensity': String(Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1),
    '--tx-prism-glow-duration': `${Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION}s`,
  }
})

// Each cone's parameters ride on its own element as custom properties, so the sheet holds one
// rule for every cone instead of one per cone. `slot` is its place in the reduced-motion frame.
// `--tx-pg-*` is the private prefix; the documented knobs keep `--tx-prism-glow-*`.
const coneStyles: CSSProperties[] = PRISM_GLOW_CONES.map((cone, slot) => ({
  '--tx-pg-hue': cone.hue,
  '--tx-pg-shift': cone.shift,
  '--tx-pg-period': cone.period,
  '--tx-pg-phase': cone.phase,
  '--tx-pg-breath': cone.breath,
  '--tx-pg-size': cone.size,
  '--tx-pg-slot': slot,
}))

// Collapse on grow. Content landing under a loading surface usually makes its host taller, and
// a glow still fading out over the new content looks broken, so growth retracts it at once and
// keeps it off until `active` cycles. The baseline is the height when the light came on; a
// ResizeObserver's first callback reports the current size, so it only ever sets the baseline.
//
// Growth counts while the light is on and while it is fading out: `items = data; loading = false`
// in one update is the common case, and there the fade and the growth start together.
//
// The light layer is `inset: 0`, so a growing root stretches the cones with it. Every leave
// therefore pins the leaving layer to the root's padding-box height from before the growth: a
// fade pins the last observed height, which predates a growth landing in the same update, and a
// collapse pins the height from before the callback that saw its growth. The observer runs after
// layout and before paint, and Vue flushes in the same step, so the stretched frame never paints.
// The pin is written on the leaving element itself (`before-leave`): a node the v-if is removing
// gets no new bindings.
const rootRef = ref<HTMLElement>()
const collapsed = ref(false)
const collapsing = ref(false)
let observer: ResizeObserver | undefined
let lastHeight: number | null = null
let baseline: number | null = null
/** The layer's own height, the root's padding box, as of the last layout the observer reported. */
let rootHeight: number | null = null
/**
 * A collapse leaves in the flush after the callback that saw the growth, when `rootHeight`
 * already holds the grown box; this keeps the height from before it for that one pin.
 */
let collapseHeight: number | null = null
let leavingEl: HTMLElement | null = null

/** A fade already under way is sped up to finish in about the collapse's own time. */
const COLLAPSE_MS = 140

function hurryLeave(el: HTMLElement): void {
  if (typeof el.getAnimations !== 'function')
    return
  for (const animation of el.getAnimations()) {
    const timing = animation.effect?.getComputedTiming()
    const total = Number(timing?.duration)
    const elapsed = Number(timing?.localTime ?? 0)
    if (Number.isFinite(total) && total > elapsed)
      animation.playbackRate = Math.max(1, (total - elapsed) / COLLAPSE_MS)
  }
}

/** Judges one height of the watched box; true when that collapsed a lit glow. */
function handleHeight(height: number): boolean {
  lastHeight = height
  if (!props.collapseOnGrow)
    return false
  const lit = props.active && !collapsed.value
  const fading = leavingEl !== null && !collapsing.value
  if (!lit && !fading)
    return false
  if (baseline === null) {
    baseline = height
    return false
  }
  if (height > baseline + GROW_THRESHOLD_PX) {
    collapsing.value = true
    if (lit)
      collapsed.value = true
    else if (leavingEl)
      hurryLeave(leavingEl)
    return lit
  }
  baseline = Math.min(baseline, height)
  return false
}

/**
 * The observer reports the content box and the layer spans the padding box: pinning the content
 * height would lift the cones off the edge by the root's vertical padding.
 */
function paddingBoxHeight(entry: ResizeObserverEntry): number {
  const style = getComputedStyle(entry.target)
  const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
  return entry.contentRect.height + padding
}

function observe(): void {
  observer?.disconnect()
  lastHeight = null
  baseline = null
  rootHeight = null
  collapseHeight = null
  const root = rootRef.value
  const target = props.growTarget ?? root
  if (!root || !target || typeof ResizeObserver === 'undefined')
    return
  observer = new ResizeObserver((entries) => {
    const heightBefore = rootHeight
    let targetHeight: number | undefined
    for (const entry of entries) {
      if (entry.target === target)
        targetHeight = entry.contentRect.height
      // Tracked through a collapse too: a relit glow that fades later pins the current box.
      if (entry.target === root)
        rootHeight = paddingBoxHeight(entry)
    }
    if (targetHeight !== undefined && handleHeight(targetHeight))
      collapseHeight = heightBefore
  })
  if (target !== root)
    observer.observe(target)
  // Border box, so a padding change alone still refreshes the pin height.
  observer.observe(root, { box: 'border-box' })
}

function pinLeaving(el: Element): void {
  leavingEl = el as HTMLElement
  const height = collapseHeight ?? rootHeight
  collapseHeight = null
  if (height === null)
    return
  const style = leavingEl.style
  style.top = '0px'
  style.bottom = 'auto'
  style.height = `${height}px`
}

function handleLeaveEnd(): void {
  collapsing.value = false
  leavingEl = null
  if (!props.active)
    baseline = null
}

watch(
  () => props.active,
  (active) => {
    // Off clears the latch but keeps the baseline, so growth during the fade still counts;
    // on measures from wherever the box is now.
    if (!active)
      collapsed.value = false
    else
      baseline = lastHeight
  },
)
watch(() => props.collapseOnGrow, () => {
  baseline = lastHeight
})
watch(() => props.growTarget, observe)
onMounted(observe)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="rootRef"
    class="tx-prism-glow"
    :class="[`tx-prism-glow--${palette}`, `tx-prism-glow--${placement}`, { 'is-collapsing': collapsing }]"
    :style="rootStyle"
  >
    <!-- The v-if sits inside the Transition so switching `active` off plays the fade-out
         before the layer unmounts; a collapse swaps that fade for the short retract. -->
    <Transition
      name="tx-prism-glow"
      @before-leave="pinLeaving"
      @after-leave="handleLeaveEnd"
      @leave-cancelled="handleLeaveEnd"
    >
      <div v-if="active && !collapsed" class="tx-prism-glow__field" aria-hidden="true">
        <span v-for="(style, index) in coneStyles" :key="index" class="tx-prism-glow__cone" :style="style">
          <span class="tx-prism-glow__beam" /><span class="tx-prism-glow__rays" />
        </span>
      </div>
    </Transition>
    <slot />
  </div>
</template>

<style lang="scss">
// Zero specificity on purpose: the overlay usage re-positions the root from a host
// class (`position: absolute; inset: 0`), and that has to win whichever of the two
// stylesheets loads last.
:where(.tx-prism-glow) {
  position: relative;
}

// Light surfaces are the default. On a near-white page additive light is invisible and
// a near-white core reads as a grey smudge, so light mode keeps the core coloured and
// blends normally. High chroma at low alpha keeps three overlapping cones clean instead
// of greying them (`multiply` was tried: it mixes blue and yellow into olive).
.tx-prism-glow {
  --tx-prism-glow-l: 0.76;
  --tx-prism-glow-c: 0.19;
  --tx-prism-glow-l-core: 0.78;
  --tx-prism-glow-c-core: 0.18;
  --tx-prism-glow-a-core: 0.5;
  --tx-prism-glow-a-halo: 0.22;
  --tx-prism-glow-a-fringe: 0.3;
  --tx-prism-glow-a-ray: 0.05;
  --tx-prism-glow-blend: normal;
  --tx-prism-glow-reach: 1;

  // The light layer sits at z-index -1. Isolation keeps that relative to this root: it
  // paints over the root's own background and under the slot, never behind the host page.
  isolation: isolate;
}

// Dark surfaces: overlapping cones add up towards white, which is what reads as two
// beams merging, and the core sits near white under its tint.
:is([data-theme='dark'], .dark) .tx-prism-glow {
  --tx-prism-glow-l: 0.74;
  --tx-prism-glow-c: 0.19;
  --tx-prism-glow-l-core: 0.95;
  --tx-prism-glow-c-core: 0.05;
  --tx-prism-glow-a-core: 0.78;
  --tx-prism-glow-a-halo: 0.3;
  --tx-prism-glow-a-fringe: 0.44;
  --tx-prism-glow-a-ray: 0.07;
  --tx-prism-glow-blend: plus-lighter;
}

.tx-prism-glow__field {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  // Cone width and travel are in cqw. `inset: 0` sizes the field, never its content,
  // so size containment changes nothing about its box.
  container-type: size;
  opacity: var(--tx-prism-glow-intensity, 1);
}

// The field flips, not the cones: they rise from the top edge and still travel left to right.
.tx-prism-glow--top .tx-prism-glow__field {
  transform: scaleY(-1);
}

// Only the field's opacity fades; the cones keep flowing underneath until the
// Transition unmounts them.
.tx-prism-glow-enter-active {
  transition: opacity 0.3s ease-out;
}

.tx-prism-glow-leave-active {
  transition: opacity 0.45s ease-in;
}

.tx-prism-glow-enter-from,
.tx-prism-glow-leave-to {
  opacity: 0;
}

// Collapse: the beams sink into the edge they rise from while the field fades, in one short
// step. Reach feeds the beam's static transform, so the retract is a compositor transform
// transition, and the beam's origin is already the rising edge in either placement.
.tx-prism-glow.is-collapsing .tx-prism-glow-leave-active {
  transition: opacity 0.14s ease-in;
}

.tx-prism-glow.is-collapsing .tx-prism-glow__beam,
.tx-prism-glow.is-collapsing .tx-prism-glow__rays {
  transition: transform 0.14s ease-in;
}

.tx-prism-glow.is-collapsing .tx-prism-glow-leave-to {
  --tx-prism-glow-reach: 0;
}

// Compositor-only motion: `translate` carries the travel, `scale` the rise and the
// breathing, `opacity` the fades, split between cone and beam so no two animations
// write one property. No keyframe reads a var(), so the compositor runs them all while
// the main thread is busy, and a search in flight is exactly that moment.
.tx-prism-glow__cone {
  // One colour per cone. Every layer below derives from it through relative colour, so
  // a palette only has to set this: the spectrum gives the hue angle, the theme the rest.
  --tx-pg-tint: oklch(var(--tx-prism-glow-l) var(--tx-prism-glow-c) var(--tx-pg-hue));

  position: absolute;
  bottom: 0;
  left: 0;
  width: 40cqw;
  height: 100%;
  transform-origin: 50% 100%;
  mix-blend-mode: var(--tx-prism-glow-blend);
  animation:
    tx-prism-glow-travel calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-period)) linear
      calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-phase)) infinite,
    tx-prism-glow-life calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-period)) linear
      calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-phase)) infinite;
}

// Accent: the primary's hue turned by each cone's shift; lightness and chroma stay the theme's.
.tx-prism-glow--accent .tx-prism-glow__cone {
  --tx-pg-tint: oklch(from var(--tx-color-primary, #409eff) var(--tx-prism-glow-l) var(--tx-prism-glow-c) calc(h + var(--tx-pg-shift)));
}

// Layers, top to bottom: the core, two dispersion fringes hue-shifted either side of
// it, the halo, and the hairline along the edge.
.tx-prism-glow__beam {
  --tx-pg-core: oklch(from var(--tx-pg-tint) var(--tx-prism-glow-l-core) var(--tx-prism-glow-c-core) h / var(--tx-prism-glow-a-core));

  position: absolute;
  inset: 0;
  transform-origin: 50% 100%;
  // Base size, times the reach that high contrast lowers. The breathing animates
  // `scale`, which composes with this `transform` rather than replacing it.
  transform: scale(var(--tx-pg-size), calc(var(--tx-pg-size) * var(--tx-prism-glow-reach, 1)));
  background:
    radial-gradient(ellipse 26% 13% at 50% 100%, var(--tx-pg-core), transparent),
    radial-gradient(ellipse 30% 62% at 41% 100%, oklch(from var(--tx-pg-tint) l c calc(h - 34) / var(--tx-prism-glow-a-fringe)), transparent 72%),
    radial-gradient(ellipse 30% 62% at 59% 100%, oklch(from var(--tx-pg-tint) l c calc(h + 34) / var(--tx-prism-glow-a-fringe)), transparent 72%),
    radial-gradient(ellipse 50% 100% at 50% 100%, oklch(from var(--tx-pg-tint) l c h / var(--tx-prism-glow-a-halo)), transparent 78%),
    linear-gradient(90deg, transparent 20%, var(--tx-pg-core) 50%, transparent 80%) bottom / 100% 1.5px no-repeat;
  animation: tx-prism-glow-breathe calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-breath)) ease-in-out
    calc(var(--tx-prism-glow-duration, 6s) * var(--tx-pg-phase)) infinite alternate;
}

.tx-prism-glow__rays {
  position: absolute;
  inset: 0;
  // Rides the same reach as the beam, so high contrast and the collapse both take the rays down with it.
  transform-origin: 50% 100%;
  transform: scaleY(var(--tx-prism-glow-reach, 1));
  background: repeating-conic-gradient(from -60deg at 50% 100%, transparent 0deg, oklch(from var(--tx-pg-tint) l c h / var(--tx-prism-glow-a-ray)) 5deg, transparent 11deg);
  // A mask reads alpha only; the opaque tint serves as the stop and keeps colour
  // literals out of the sheet.
  -webkit-mask-image: radial-gradient(ellipse 44% 100% at 50% 100%, var(--tx-pg-tint) 10%, transparent 75%);
  mask-image: radial-gradient(ellipse 44% 100% at 50% 100%, var(--tx-pg-tint) 10%, transparent 75%);
}

// High contrast, on the same triggers as `variables.scss`: the cones shrink to a band
// along the edge and the rays go, so no colour spreads behind text.
html.contrast .tx-prism-glow,
html[data-tx-contrast='high'] .tx-prism-glow {
  --tx-prism-glow-reach: 0.45;
}

html.contrast .tx-prism-glow__rays,
html[data-tx-contrast='high'] .tx-prism-glow__rays {
  display: none;
}

@media (prefers-contrast: more) {
  html:not([data-tx-contrast='normal']) .tx-prism-glow {
    --tx-prism-glow-reach: 0.45;
  }

  html:not([data-tx-contrast='normal']) .tx-prism-glow__rays {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-prism-glow__cone,
  .tx-prism-glow__beam {
    animation: none;
  }

  // A finished frame of the flow, not the resting style: the resting cones would sit
  // stacked at the left edge. Every cone is risen, fully lit, and spread evenly from
  // the left edge to the right one (slots 0–5 × 12cqw, plus the 40cqw width, is 100cqw).
  .tx-prism-glow__cone {
    opacity: 1;
    scale: 1;
    translate: calc(var(--tx-pg-slot) * 12cqw) 0;
  }

  .tx-prism-glow-enter-active,
  .tx-prism-glow-leave-active {
    transition: none;
  }

  .tx-prism-glow.is-collapsing .tx-prism-glow-leave-active,
  .tx-prism-glow.is-collapsing .tx-prism-glow__beam,
  .tx-prism-glow.is-collapsing .tx-prism-glow__rays {
    transition: none;
  }

  // Vue holds enter-from and leave-active for two frames before it measures the
  // transition: the field has to be on from the first and gone from the last.
  .tx-prism-glow-enter-from {
    opacity: var(--tx-prism-glow-intensity, 1);
  }

  .tx-prism-glow-leave-active {
    opacity: 0;
  }
}

@keyframes tx-prism-glow-travel {
  from {
    translate: -40cqw 0;
  }

  to {
    translate: 100cqw 0;
  }
}

// Rise out of the edge on the left, hold, sink and fade on the right.
@keyframes tx-prism-glow-life {
  0% {
    opacity: 0;
    scale: 1 0.35;
  }

  16%,
  84% {
    opacity: 1;
    scale: 1 1;
  }

  100% {
    opacity: 0;
    scale: 1 0.5;
  }
}

@keyframes tx-prism-glow-breathe {
  from {
    scale: 0.78 0.62;
  }

  to {
    scale: 1.12 1.08;
  }
}
</style>
