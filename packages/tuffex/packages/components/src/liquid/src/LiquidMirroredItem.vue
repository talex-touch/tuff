<script setup lang="ts">
import type { BlobBox, CornerRadii } from './geometry'
import type { Transition } from './spring'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLiquidContext } from './context'
import { measureRadius, normalizeRadius, offsetTo, roundedRectPath } from './geometry'
import { easingFunction, resolveTransition } from './spring'
import { useReducedMotion } from './use-reduced-motion'

// Internal: mirrored mode of liquid-gooey's GooeyItem. The item declares
// x/y/scale and the library animates the wrapper and its blob from ONE JS
// clock — no CSS transition on the wrapper. A compositor transition keeps
// playing through a main-thread stall while the blob (always written from JS)
// freezes; under Safari's SVG-filter load that read as icons sailing away from
// their own liquid. With both written in the same rAF tick from the same
// easing curve they can only ever move together.

defineOptions({
  name: 'TxLiquidMirroredItem',
})

const props = withDefaults(defineProps<{
  x?: number
  y?: number
  scale?: number
  transition?: Transition
  delay?: number
  radius?: number | CornerRadii
}>(), {
  x: 0,
  y: 0,
  scale: 1,
  transition: 'smooth',
  delay: 0,
  radius: undefined,
})

const SVG_NS = 'http://www.w3.org/2000/svg'

const ctx = useLiquidContext()
const wrapRef = ref<HTMLDivElement | null>(null)
const reduced = useReducedMotion()

const resolved = computed(() => resolveTransition(props.transition, reduced.value))

let box: BlobBox | null = null
let blobEl: SVGGraphicsElement | null = null
let cur: { x: number, y: number, s: number } | null = null
let rafId = 0
let resizeObserver: ResizeObserver | null = null

function transformOf(x: number, y: number, s: number): string {
  return `translate(${x}px, ${y}px)${s !== 1 ? ` scale(${s})` : ''}`
}

function writeTransform(px: number, py: number, ps: number): void {
  const t = transformOf(px, py, ps)
  if (wrapRef.value)
    wrapRef.value.style.transform = t
  if (blobEl)
    blobEl.style.transform = t
}

function removeBlob(): void {
  blobEl?.remove()
  blobEl = null
}

/** (Re)render the blob for the current box: a <rect> for uniform radii, a
 *  <path> otherwise. The blob remounts whenever the element type flips; it is
 *  caught up to the currently rendered transform immediately. */
function syncBlob(): void {
  const portal = ctx.portal.value
  if (!portal || !box) {
    removeBlob()
    return
  }
  const [tl, tr, br, bl] = box.r
  const uniform = tl === tr && tr === br && br === bl
  const tag = uniform ? 'rect' : 'path'
  if (!blobEl || blobEl.tagName !== tag || blobEl.parentNode !== portal) {
    removeBlob()
    blobEl = document.createElementNS(SVG_NS, tag)
    blobEl.style.transformBox = 'fill-box'
    blobEl.style.transformOrigin = 'center'
    blobEl.style.willChange = 'transform'
    const c = cur ?? { x: props.x, y: props.y, s: props.scale }
    blobEl.style.transform = transformOf(c.x, c.y, c.s)
    portal.appendChild(blobEl)
  }
  if (uniform) {
    // Clamp to min(w,h)/2: SVG clamps rx and ry independently, so a large
    // radius on a wide short box (the `border-radius: 999px` pill idiom)
    // would degenerate into an ellipse instead of a pill.
    const rx = Math.max(0, Math.min(tl, Math.min(box.w, box.h) / 2))
    blobEl.setAttribute('x', String(box.x))
    blobEl.setAttribute('y', String(box.y))
    blobEl.setAttribute('width', String(box.w))
    blobEl.setAttribute('height', String(box.h))
    blobEl.setAttribute('rx', String(rx))
  }
  else {
    blobEl.setAttribute('d', roundedRectPath(box.x, box.y, box.w, box.h, box.r))
  }
}

function sameBox(a: BlobBox | null, b: BlobBox): boolean {
  return (
    !!a
    && a.x === b.x
    && a.y === b.y
    && a.w === b.w
    && a.h === b.h
    && a.r.every((v, i) => v === b.r[i])
  )
}

function measure(): void {
  const el = wrapRef.value
  const group = ctx.getGroup()
  if (!el || !group)
    return
  // Transform-free base box via the offsetParent chain — the blob mirrors
  // motion separately, so its base must ignore the wrapper's live transform.
  const base = offsetTo(el, group)
  const w = el.offsetWidth
  const h = el.offsetHeight
  const target = (el.firstElementChild as HTMLElement | null) ?? el
  const r: CornerRadii
    = props.radius != null ? normalizeRadius(props.radius) : measureRadius(target, w, h)
  const next: BlobBox = { x: base.x, y: base.y, w, h, r }
  if (!sameBox(box, next)) {
    box = next
    syncBlob()
  }
}

// Retarget like a CSS transition: from the currently rendered value, full
// duration. `delay` holds at the start value first (stagger).
function runTransition(): void {
  cancelAnimationFrame(rafId)
  const { duration, easing } = resolved.value
  const { x, y, scale } = props
  const from = cur
  if (!from || duration <= 0 || (from.x === x && from.y === y && from.s === scale)) {
    cur = { x, y, s: scale }
    writeTransform(x, y, scale)
    return
  }
  const f = { ...from }
  const ease = easingFunction(easing)
  const start = performance.now() + props.delay
  const tick = (now: number): void => {
    const p = Math.min(1, Math.max(0, (now - start) / duration))
    const e = ease(p)
    const cx = f.x + (x - f.x) * e
    const cy = f.y + (y - f.y) * e
    const cs = f.s + (scale - f.s) * e
    cur = { x: cx, y: cy, s: cs }
    writeTransform(cx, cy, cs)
    if (p < 1)
      rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

watch([() => props.x, () => props.y, () => props.scale], runTransition)
watch(() => JSON.stringify(props.radius ?? null), measure)
watch(ctx.portal, syncBlob)

onMounted(() => {
  cur = { x: props.x, y: props.y, s: props.scale }
  writeTransform(props.x, props.y, props.scale)
  measure()
  const el = wrapRef.value
  const group = ctx.getGroup()
  if (typeof ResizeObserver !== 'undefined' && el && group) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(el)
    resizeObserver.observe(group)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  removeBlob()
})
</script>

<template>
  <div ref="wrapRef" class="tx-liquid-item">
    <slot />
  </div>
</template>

<style scoped>
.tx-liquid-item {
  display: inline-block;
  /* `transform` is owned imperatively (one shared JS clock with the blob) —
     the template must never render it, or a re-render mid-flight would snap
     to the target. */
  will-change: transform;
}
</style>
