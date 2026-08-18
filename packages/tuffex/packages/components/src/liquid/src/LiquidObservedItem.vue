<script setup lang="ts">
import type { CornerRadii } from './geometry'
import type { DissolveOptions, GooeyEffect } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLiquidContext } from './context'
import { normalizeRadius } from './geometry'
import { type BlendConfig, EVOLVE_DEFAULTS, type EvolveOptions, type ItemDynamics, MOVE_DEFAULTS, type MoveOptions } from './observer'

// Internal: observe mode of liquid-gooey's GooeyItem. The consumer animates
// the slot content however they like (CSS, pointer events, GSAP) — the
// measurement engine mirrors the rendered rect onto the blob each frame, and
// optionally runs the evolve/move dynamics and the contact melt.

defineOptions({
  name: 'TxLiquidObservedItem',
})

const props = withDefaults(defineProps<{
  effects?: GooeyEffect[]
  evolve?: EvolveOptions
  move?: MoveOptions
  contactBlur?: DissolveOptions
  radius?: number | CornerRadii
  blobInset?: number
  bridgeGrow?: number
}>(), {
  effects: () => [],
  evolve: undefined,
  move: undefined,
  contactBlur: undefined,
  radius: undefined,
  blobInset: undefined,
  bridgeGrow: undefined,
})

const SVG_NS = 'http://www.w3.org/2000/svg'

const ctx = useLiquidContext()
const hostRef = ref<HTMLElement | null>(null)

let blobEl: SVGRectElement | null = null
let meltEl: SVGGElement | null = null
let liveBlend: BlendConfig | null = null
let disposeEngine: (() => void) | null = null

// Resolved melt options — defaults mirror upstream GooeyItem.
const blend = computed(() => {
  const opts = props.contactBlur
  if (!opts)
    return null
  return {
    blur: opts.blur ?? 8,
    warp: opts.warp ?? 26,
    pull: opts.pull ?? 4,
    range: opts.range,
    zone: opts.zone,
    mix: opts.mix ?? 0,
    gravity: opts.gravity ?? 60,
    taper: opts.taper ?? 1,
    warpFreq: opts.warpFreq ?? 1.7,
    flowSpeed: opts.flowSpeed ?? 22,
    warpStyle: opts.warpStyle ?? 'fractalNoise' as const,
    detail: opts.detail ?? 2,
    active: opts.active !== false,
    releaseMs: opts.releaseMs ?? 240,
    fadeMs: opts.fadeMs,
    strength: opts.strength ?? 1,
    // Left undefined when unset so the engine owns the default in one place.
    sink: opts.sink,
  }
})

const dynamics = computed<ItemDynamics | undefined>(() => {
  const evolve = props.effects.includes('evolve')
  const move = props.effects.includes('move')
  if (!evolve && !move)
    return undefined
  return {
    evolve,
    move,
    evolveOpts: { ...EVOLVE_DEFAULTS, ...props.evolve },
    moveOpts: { ...MOVE_DEFAULTS, ...props.move },
  }
})

// Structural registration keys. `active`/`releaseMs`/`fadeMs`/`strength`/
// `sink` are intentionally NOT part of the blend key: they change every drag
// and must not tear down the melt structure — the engine reads them live.
const radiusKey = computed(() => (props.radius == null ? '' : JSON.stringify(props.radius)))
const blendKey = computed(() => {
  const b = blend.value
  if (!b)
    return ''
  return `${b.blur}/${b.warp}/${b.pull}/${b.range ?? 'auto'}/${b.zone ?? 'auto'}/${b.mix}/${b.gravity}/${b.taper}/${b.warpFreq}/${b.flowSpeed}/${b.warpStyle}/${b.detail}`
})
const effectKey = computed(() => {
  const d = dynamics.value
  return (
    props.effects.join(',')
    + (d?.evolve ? JSON.stringify(d.evolveOpts) : '')
    + (d?.move ? JSON.stringify(d.moveOpts) : '')
  )
})

function teardown(): void {
  disposeEngine?.()
  disposeEngine = null
  liveBlend = null
  blobEl?.remove()
  blobEl = null
  meltEl?.remove()
  meltEl = null
}

function register(): void {
  teardown()
  const host = hostRef.value
  const target = (host?.firstElementChild as HTMLElement | null) ?? null
  const portal = ctx.portal.value
  if (!target || !portal)
    return

  blobEl = document.createElementNS(SVG_NS, 'rect')
  blobEl.setAttribute('x', '0')
  blobEl.setAttribute('y', '0')
  blobEl.setAttribute('width', '0')
  blobEl.setAttribute('height', '0')
  blobEl.style.willChange = 'transform'
  // Dynamics scale (stretch / squash) about the blob's own centre.
  blobEl.style.transformBox = 'fill-box'
  blobEl.style.transformOrigin = 'center'
  portal.appendChild(blobEl)

  let engineBlend: BlendConfig | undefined
  const resolved = blend.value
  if (resolved && ctx.meltPortal.value) {
    meltEl = document.createElementNS(SVG_NS, 'g')
    meltEl.setAttribute('opacity', '0')
    ctx.meltPortal.value.appendChild(meltEl)
    engineBlend = { host: meltEl, ...resolved }
  }
  liveBlend = engineBlend ?? null

  disposeEngine = ctx.engine.add({
    target,
    blob: blobEl,
    radius: props.radius == null ? undefined : normalizeRadius(props.radius)[0],
    blobInset: props.blobInset,
    bridgeGrow: props.bridgeGrow,
    blend: engineBlend,
    dynamics: dynamics.value,
  })
}

watch(
  [radiusKey, blendKey, effectKey, () => props.blobInset, () => props.bridgeGrow, ctx.portal, ctx.meltPortal],
  register,
  { flush: 'post' },
)

// `active` / `releaseMs` / `fadeMs` / `strength` / `sink` are pushed straight
// into the live config so a drag release (or a strength slider) updates the
// melt without rebuilding its SVG structure.
watch(
  () => {
    const b = blend.value
    return b ? ([b.active, b.releaseMs, b.fadeMs, b.strength, b.sink] as const) : null
  },
  (live) => {
    if (!live || !liveBlend)
      return
    liveBlend.active = live[0]
    liveBlend.releaseMs = live[1]
    liveBlend.fadeMs = live[2]
    liveBlend.strength = live[3]
    liveBlend.sink = live[4]
    ctx.engine.wake()
  },
)

onMounted(register)
onBeforeUnmount(teardown)
</script>

<template>
  <span ref="hostRef" class="tx-liquid-item--observed">
    <slot />
  </span>
</template>

<style scoped>
.tx-liquid-item--observed {
  display: contents;
}
</style>
