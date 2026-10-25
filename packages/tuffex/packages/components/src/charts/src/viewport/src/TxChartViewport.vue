<script setup lang="ts">
// The view layer for continuous x axes. Unzoomed, a mouse drag brushes a range
// and the release zooms to it; zoomed, a drag pans (Shift still brushes), past
// the data it rubberbands, and a flick coasts to a stop. ⌘/Ctrl + wheel and a
// trackpad pinch zoom around the pointer, two fingers pinch on touch, and a
// double-click resets. A plain wheel is the page's. The keys mirror all of it.

import type { BrushRect, ViewWindow } from './viewport'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stepSpring } from '../../../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../../../utils/frame-loop'
import {
  createVelocityTracker,
  glideAxis,
  isZoomWheel,
  projectMomentum,
  responseSpring,
  wheelPixels,
  wheelZoomFactor,
} from '../../../../../../utils/gesture'
import { useReducedMotion } from '../../../../../../utils/use-reduced-motion'
import { useChartContext } from '../../core/context'
import { createXScale, defaultTickFormat } from '../../core/scales'
import {
  BRUSH_MIN_DRAG_PX,
  brushRange,
  brushRect,
  containWindow,
  coversExtent,
  minimumSpan,
  overshoot,
  resistWindow,
  viewSpace,
  zoomWindow,
} from './viewport'

defineOptions({ name: 'TxChartViewport' })

const props = withDefaults(defineProps<{
  /** Brushing, dragging, the zoom wheel, pinching and the keys move the view. */
  zoom?: boolean
  /** A brush reports its range even where it does not zoom. */
  select?: boolean
  /** Formats an x value for the announcement of a keyboard zoom or pan. */
  format?: (value: number) => string
}>(), {
  zoom: true,
  select: false,
})

const emit = defineEmits<{
  /** A brush was released over a range, in data units. */
  range: [from: number, to: number]
}>()

/** The x window shown, in data units; `null` is the full range. */
const model = defineModel<[number, number] | null>('window', { default: null })
/** The live brush rectangle, for dimming what lies outside it. */
const selection = defineModel<BrushRect | null>('selection', { default: null })

const ctx = useChartContext('TxChartViewport')
const reduced = useReducedMotion()

/** How the view springs to a new window. */
const ZOOM_SPRING = responseSpring(0.35, 1)
/** A keyboard zoom step. */
const KEY_ZOOM = 2
/** A keyboard pan step, as a share of the window. */
const KEY_PAN = 0.1
/** A wheel event smaller than this is a trackpad's continuous stream, which tracks 1:1. */
const CONTINUOUS_WHEEL_PX = 50

const space = computed(() => viewSpace(ctx.xType.value))

/** Data x values with a place on the axis, sorted, in view space. */
const stops = computed<number[]>(() => {
  const log = ctx.xType.value === 'log'
  const values: number[] = []
  for (const stop of ctx.xStops.value) {
    const value = Number(stop)
    if (Number.isFinite(value) && (!log || value > 0))
      values.push(space.value.to(value))
  }
  return values
})

/** The full range the view moves within, in view space; `null` when there is nothing to zoom. */
const extent = computed<ViewWindow | null>(() => {
  if (ctx.xType.value === 'band')
    return null
  const domain = ctx.xDomainFull.value
  if (domain.length < 2)
    return null
  let lo = Number(domain[0])
  const hi = Number(domain[domain.length - 1])
  if (ctx.xType.value === 'log') {
    if (!(hi > 0))
      return null
    // A log axis starts at the first positive value.
    if (!(lo > 0))
      lo = stops.value.length > 0 ? space.value.from(stops.value[0]!) : hi / 10
  }
  const from = space.value.to(lo)
  const to = space.value.to(hi)
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? [from, to] : null
})

const minSpan = computed(() => {
  const full = extent.value
  return full ? minimumSpan(stops.value, full) : 0
})

// ── The drawn window and its motion ──────────────────────────────────────────

/** The window drawn this frame, in view space; `null` draws the full range. */
let shown: ViewWindow | null = null
/** Where the view is headed, in view space; `null` is the full range. */
let target: ViewWindow | null = null
let velocity: [number, number] = [0, 0]
let mode: 'idle' | 'spring' | 'glide' = 'idle'
const loop = createFrameLoop(tick)

/** Mirrors `target !== null`, for the cursor. */
const zoomed = ref(false)

function publish(next: ViewWindow | null): void {
  shown = next
  ctx.xView.value = next ? [space.value.from(next[0]), space.value.from(next[1])] : null
}

function setTarget(next: ViewWindow | null): void {
  const full = extent.value
  target = next && full && coversExtent(next, full) ? null : next
  zoomed.value = target !== null
}

function drawn(): ViewWindow | null {
  return shown ?? extent.value
}

function plotWidth(): number {
  return Math.max(1, ctx.plot.value.width)
}

function unitsPerPx(window: ViewWindow): number {
  return (window[1] - window[0]) / plotWidth()
}

/** The view-space value under a container x, in a given window. */
function valueAt(px: number, window: ViewWindow): number {
  return window[0] + (px - ctx.plot.value.x) * unitsPerPx(window)
}

function stopMotion(): void {
  loop.stop()
  mode = 'idle'
  velocity = [0, 0]
}

function settle(): void {
  stopMotion()
  ctx.immediate.value = false
  if (target === null)
    publish(null)
  else
    publish(target)
}

function run(): void {
  ctx.immediate.value = true
  loop.start()
}

/** Moves the view to `next` (`null`: the full range), springing unless motion is reduced. */
function animateTo(next: ViewWindow | null): void {
  const full = extent.value
  setTarget(next)
  if (!full || reduced.value || ctx.plot.value.width <= 0) {
    settle()
    return
  }
  if (!shown)
    publish(full)
  mode = 'spring'
  run()
}

let releaseTimer: ReturnType<typeof setTimeout> | null = null

/** Series stop morphing while a stream of events moves the view, and resume once it has been still. */
function holdImmediate(): void {
  ctx.immediate.value = true
  if (releaseTimer)
    clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    releaseTimer = null
    if (mode === 'idle' && !gestureActive())
      ctx.immediate.value = false
  }, 150)
}

/** Moves the view to `next` on this frame: a gesture is driving it. */
function jumpTo(next: ViewWindow | null): void {
  stopMotion()
  setTarget(next)
  publish(target)
  holdImmediate()
}

function atRest(window: ViewWindow, goal: ViewWindow): boolean {
  const perPx = unitsPerPx(goal)
  return Math.abs(window[0] - goal[0]) < perPx * 0.25
    && Math.abs(window[1] - goal[1]) < perPx * 0.25
    && Math.abs(velocity[0]) < perPx * 4
    && Math.abs(velocity[1]) < perPx * 4
}

function tick(dt: number): boolean {
  const full = extent.value
  const from = shown
  if (!full || !from) {
    settle()
    return false
  }
  if (mode === 'glide') {
    const [start, speed] = glideAxis(from[0], velocity[0], dt)
    const next: ViewWindow = [start, start + (from[1] - from[0])]
    velocity = [speed, speed]
    publish(next)
    // Coasting into the end of the data, a spring takes over the velocity and
    // brings the window back inside; nearly stopped, one lands it exactly.
    if (overshoot(next, full) !== 0 || Math.abs(speed) < unitsPerPx(next) * 4)
      mode = 'spring'
  }
  else if (mode === 'spring') {
    const goal = target ?? full
    const [a, va] = stepSpring(from[0], velocity[0], goal[0], ZOOM_SPRING, dt)
    const [b, vb] = stepSpring(from[1], velocity[1], goal[1], ZOOM_SPRING, dt)
    velocity = [va, vb]
    if (atRest([a, b], goal)) {
      settle()
      return false
    }
    publish([a, b])
  }
  else {
    settle()
    return false
  }
  return true
}

// ── The model ────────────────────────────────────────────────────────────────

let lastCommitted: [number, number] | null = null

function sameWindow(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean {
  if (!a || !b)
    return !a && !b
  return a[0] === b[0] && a[1] === b[1]
}

/** Reports where the view is going (not every frame of getting there). */
function commit(): void {
  const next: [number, number] | null = target
    ? [space.value.from(target[0]), space.value.from(target[1])]
    : null
  if (sameWindow(next, model.value))
    return
  lastCommitted = next
  model.value = next
}

function fromModel(value: [number, number] | null | undefined): ViewWindow | null {
  const full = extent.value
  if (!value || !full)
    return null
  const lo = Math.min(value[0], value[1])
  const hi = Math.max(value[0], value[1])
  if (ctx.xType.value === 'log' && !(hi > 0))
    return null
  const window: ViewWindow = [
    space.value.to(ctx.xType.value === 'log' ? Math.max(lo, space.value.from(full[0])) : lo),
    space.value.to(hi),
  ]
  return containWindow(window, full, minSpan.value)
}

watch(model, (value) => {
  if (sameWindow(value, lastCommitted))
    return
  lastCommitted = value ?? null
  if (gestureActive())
    return
  animateTo(fromModel(value))
})

watch(extent, (next, previous) => {
  if (!next) {
    stopMotion()
    setTarget(null)
    publish(null)
    ctx.immediate.value = false
    return
  }
  // A window given before the data arrived lands as soon as there is an axis.
  if (!previous && model.value) {
    setTarget(fromModel(model.value))
    publish(target)
    return
  }
  if (!target || gestureActive())
    return
  const slack = (previous ? previous[1] - previous[0] : 0) * 1e-6
  if (previous && next[1] > previous[1] && Math.abs(target[1] - previous[1]) <= slack) {
    // A window resting on the end of the data follows it as the data grows.
    const shift = next[1] - previous[1]
    const followed: ViewWindow = [target[0] + shift, target[1] + shift]
    if (mode === 'idle')
      jumpTo(followed)
    else
      setTarget(followed)
    commit()
    return
  }
  const contained = containWindow(target, next, minSpan.value)
  if (!sameWindow(contained, target)) {
    animateTo(contained)
    commit()
  }
}, { immediate: true })

// ── Pointer gestures ─────────────────────────────────────────────────────────

interface Brush { id: number, startX: number, currentX: number, active: boolean }
interface Pan { id: number, startX: number, origin: ViewWindow, active: boolean }
interface Pinch { distance: number, middle: number, origin: ViewWindow }

let brush: Brush | null = null
let pan: Pan | null = null
let pinch: Pinch | null = null
const touches = new Map<number, number>()
const tracker = createVelocityTracker()
/** Mirrors `pan?.active`, for the cursor. */
const panning = ref(false)

function gestureActive(): boolean {
  return Boolean(brush?.active || pan?.active || pinch)
}

function localX(event: PointerEvent | WheelEvent | MouseEvent): number {
  const container = ctx.container.value
  return container ? event.clientX - container.getBoundingClientRect().left : event.offsetX
}

function inPlot(event: PointerEvent | WheelEvent): boolean {
  const container = ctx.container.value
  if (!container)
    return false
  const rect = container.getBoundingClientRect()
  const plot = ctx.plot.value
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return x >= plot.x && x <= plot.x + plot.width && y >= plot.y && y <= plot.y + plot.height
}

function invert(px: number): number {
  const scale = ctx.xScale.value
  if (!scale || !('invert' in scale))
    return Number.NaN
  return Number(scale.invert(px))
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, localX(event))
    if (touches.size === 2 && props.zoom)
      startPinch()
    return
  }
  if (event.button !== 0 || event.isPrimary === false)
    return
  const x = localX(event)
  if (props.zoom && zoomed.value && !event.shiftKey) {
    // Grabbing a moving view continues from where it is drawn.
    const origin = drawn()
    if (!origin)
      return
    if (mode !== 'idle') {
      stopMotion()
      setTarget(origin)
    }
    pan = { id: event.pointerId, startX: x, origin, active: false }
    tracker.reset(event.timeStamp, x)
  }
  else if (props.zoom || props.select) {
    brush = { id: event.pointerId, startX: x, currentX: x, active: false }
  }
  else {
    return
  }
  // Optional call: jsdom's Element has no pointer-capture API.
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    if (!touches.has(event.pointerId))
      return
    touches.set(event.pointerId, localX(event))
    if (pinch)
      movePinch()
    return
  }
  const x = localX(event)
  if (brush && event.pointerId === brush.id) {
    brush.currentX = x
    if (!brush.active && Math.abs(x - brush.startX) >= BRUSH_MIN_DRAG_PX) {
      brush.active = true
      ctx.gesture.value = 'brush'
    }
    if (brush.active) {
      const plot = ctx.plot.value
      const rect = brushRect(brush.startX, x, plot.x, plot.width)
      selection.value = rect.width > 0 ? rect : null
    }
    return
  }
  if (pan && event.pointerId === pan.id) {
    tracker.push(event.timeStamp, x)
    const dx = x - pan.startX
    if (!pan.active && Math.abs(dx) < BRUSH_MIN_DRAG_PX)
      return
    if (!pan.active) {
      pan.active = true
      panning.value = true
      ctx.gesture.value = 'pan'
      ctx.immediate.value = true
    }
    const full = extent.value
    if (!full)
      return
    const shift = -dx * unitsPerPx(pan.origin)
    const raw: ViewWindow = [pan.origin[0] + shift, pan.origin[1] + shift]
    publish(resistWindow(raw, full, unitsPerPx(pan.origin), plotWidth()))
  }
}

function endBrush(event: PointerEvent | null): void {
  const current = brush
  brush = null
  selection.value = null
  if (ctx.gesture.value === 'brush')
    ctx.gesture.value = null
  if (!current || !event)
    return
  const range = brushRange(current.startX, localX(event), invert)
  if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1]))
    return
  emit('range', range[0], range[1])
  const full = extent.value
  if (!props.zoom || !full)
    return
  const lo = ctx.xType.value === 'log' ? Math.max(range[0], Number.MIN_VALUE) : range[0]
  animateTo(containWindow([space.value.to(lo), space.value.to(range[1])], full, minSpan.value))
  commit()
}

function endPan(event: PointerEvent | null): void {
  const current = pan
  pan = null
  panning.value = false
  if (ctx.gesture.value === 'pan')
    ctx.gesture.value = null
  const full = extent.value
  if (!current?.active || !full || !shown) {
    if (!gestureActive() && mode === 'idle')
      ctx.immediate.value = false
    return
  }
  const perPx = unitsPerPx(current.origin)
  // Dragging right moves the window left: the view runs against the pointer.
  // Reduced motion has no coast: the view stops where the pointer let go.
  const speed = event && !reduced.value ? -tracker.velocity(event.timeStamp)[0] * perPx : 0
  const span = shown[1] - shown[0]
  const travel = projectMomentum(speed)
  const rest = containWindow([shown[0] + travel, shown[0] + travel + span], full, minSpan.value)
  setTarget(rest)
  commit()
  if (reduced.value) {
    settle()
    return
  }
  velocity = [speed, speed]
  mode = overshoot(shown, full) !== 0 ? 'spring' : 'glide'
  run()
}

function startPinch(): void {
  const [a, b] = [...touches.values()]
  const origin = drawn()
  if (a === undefined || b === undefined || !origin)
    return
  // A second finger turns a reading into a pinch.
  stopMotion()
  pinch = { distance: Math.max(1, Math.abs(a - b)), middle: (a + b) / 2, origin }
  ctx.gesture.value = 'pinch'
  ctx.immediate.value = true
}

function movePinch(): void {
  const [a, b] = [...touches.values()]
  const full = extent.value
  if (!pinch || a === undefined || b === undefined || !full)
    return
  const scale = Math.max(1, Math.abs(a - b)) / pinch.distance
  const anchor = valueAt(pinch.middle, pinch.origin)
  const fullSpan = full[1] - full[0]
  const span = Math.min(fullSpan, Math.max(minSpan.value, (pinch.origin[1] - pinch.origin[0]) / scale))
  // The value under the fingers' midpoint stays under it as they move.
  const start = anchor - (((a + b) / 2) - ctx.plot.value.x) * (span / plotWidth())
  publish(resistWindow([start, start + span], full, span / plotWidth(), plotWidth()))
}

function endPinch(): void {
  pinch = null
  if (ctx.gesture.value === 'pinch')
    ctx.gesture.value = null
  const full = extent.value
  if (!full || !shown) {
    ctx.immediate.value = false
    return
  }
  animateTo(containWindow(shown, full, minSpan.value))
  commit()
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    touches.delete(event.pointerId)
    if (pinch && touches.size < 2)
      endPinch()
    return
  }
  if (brush && event.pointerId === brush.id)
    endBrush(event)
  else if (pan && event.pointerId === pan.id)
    endPan(event)
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    touches.delete(event.pointerId)
    if (pinch && touches.size < 2)
      endPinch()
    return
  }
  if (brush && event.pointerId === brush.id)
    endBrush(null)
  else if (pan && event.pointerId === pan.id)
    endPan(null)
}

function onDoubleClick(): void {
  if (!props.zoom || !zoomed.value)
    return
  animateTo(null)
  commit()
}

// ── Wheel ────────────────────────────────────────────────────────────────────

function onWheel(event: WheelEvent): void {
  const full = extent.value
  if (!props.zoom || !full || gestureActive() || !inPlot(event))
    return
  const delta = wheelPixels(event)
  if (isZoomWheel(event)) {
    event.preventDefault()
    // A coasting view is stopped where it is drawn: the zoom is about what the pointer sees.
    if (mode === 'glide') {
      const current = drawn()
      stopMotion()
      setTarget(current)
    }
    // Notches accumulate on where the view is headed, not where it is drawn.
    const base = target ?? drawn() ?? full
    const anchor = valueAt(localX(event), drawn() ?? full)
    const next = containWindow(zoomWindow(base, wheelZoomFactor(delta.y), anchor), full, minSpan.value)
    if (event.deltaMode === 0 && Math.abs(delta.y) < CONTINUOUS_WHEEL_PX)
      jumpTo(next)
    else
      animateTo(next)
    commit()
    return
  }
  // A sideways trackpad swipe pans a zoomed view; anything else scrolls the page.
  if (!zoomed.value || Math.abs(delta.x) <= Math.abs(delta.y))
    return
  event.preventDefault()
  const base = drawn() ?? full
  const shift = delta.x * unitsPerPx(base)
  jumpTo(containWindow([base[0] + shift, base[1] + shift], full, minSpan.value))
  commit()
}

let wheelHost: HTMLElement | null = null

function bindWheel(element: HTMLElement | null): void {
  wheelHost?.removeEventListener('wheel', onWheel)
  wheelHost = element
  // Not passive: a zoom wheel must stop the browser zooming the page.
  wheelHost?.addEventListener('wheel', onWheel, { passive: false })
}

onMounted(() => bindWheel(ctx.container.value))
watch(() => ctx.container.value, element => bindWheel(element))
watch(() => props.zoom, (zoom) => {
  ctx.zoomable.value = zoom
  // Turning zoom off shows everything again.
  if (!zoom && (target || shown)) {
    stopMotion()
    setTarget(null)
    publish(null)
    ctx.immediate.value = false
    commit()
  }
}, { immediate: true })

// ── Keys ─────────────────────────────────────────────────────────────────────

function describeWindow(window: ViewWindow): string {
  const from = space.value.from(window[0])
  const to = space.value.from(window[1])
  if (props.format)
    return `${props.format(from)} – ${props.format(to)}`
  const scale = createXScale(ctx.xType.value, [from, to], [0, 1])
  const format = defaultTickFormat(scale, 5)
  const read = (value: number) => format(ctx.xType.value === 'time' ? new Date(value) : value)
  return `${read(from)} – ${read(to)}`
}

function keyAnchor(window: ViewWindow): number {
  if (ctx.pointer.inside)
    return valueAt(ctx.pointer.x, window)
  return (window[0] + window[1]) / 2
}

function keyMove(next: ViewWindow | null): void {
  animateTo(next)
  commit()
  const full = extent.value
  if (full)
    ctx.announcement.value = describeWindow(target ?? full)
}

const unregisterKeys = ctx.registerKeyLayer({
  key(event) {
    if (event.key === 'Escape' && brush) {
      endBrush(null)
      return true
    }
    const full = extent.value
    if (!props.zoom || !full || event.altKey || event.ctrlKey || event.metaKey || gestureActive())
      return false
    const base = target ?? full
    switch (event.key) {
      case '+':
      case '=':
        keyMove(containWindow(zoomWindow(base, KEY_ZOOM, keyAnchor(base)), full, minSpan.value))
        return true
      case '-':
      case '_':
        keyMove(containWindow(zoomWindow(base, 1 / KEY_ZOOM, keyAnchor(base)), full, minSpan.value))
        return true
      case '0':
        if (!zoomed.value)
          return false
        keyMove(null)
        return true
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!event.shiftKey || !zoomed.value)
          return false
        const step = (base[1] - base[0]) * KEY_PAN * (event.key === 'ArrowLeft' ? -1 : 1)
        keyMove(containWindow([base[0] + step, base[1] + step], full, minSpan.value))
        return true
      }
      default:
        return false
    }
  },
})

onBeforeUnmount(() => {
  unregisterKeys()
  bindWheel(null)
  stopMotion()
  if (releaseTimer)
    clearTimeout(releaseTimer)
  brush = null
  pan = null
  pinch = null
  selection.value = null
  ctx.xView.value = null
  ctx.immediate.value = false
  ctx.gesture.value = null
  ctx.zoomable.value = false
})

const cursorClass = computed(() => {
  if (!props.zoom)
    return undefined
  if (panning.value)
    return 'is-grabbing'
  return zoomed.value ? 'is-grabbable' : undefined
})
</script>

<template>
  <g class="tx-chart-viewport">
    <rect
      class="tx-chart-viewport__capture"
      :class="cursorClass"
      :x="ctx.plot.value.x"
      :y="ctx.plot.value.y"
      :width="ctx.plot.value.width"
      :height="ctx.plot.value.height"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @dblclick="onDoubleClick"
    />
    <rect
      v-if="selection"
      class="tx-chart-viewport__selection"
      :x="selection.x"
      :y="ctx.plot.value.y"
      :width="selection.width"
      :height="ctx.plot.value.height"
    />
  </g>
</template>

<style lang="scss" scoped>
.tx-chart-viewport {
  &__capture {
    fill: transparent;
    cursor: crosshair;

    // Zoomed in, the plot is something to pick up and move.
    &.is-grabbable {
      cursor: grab;
    }

    &.is-grabbing {
      cursor: grabbing;
    }
  }

  &__selection {
    // kumo brushStyle: `rgba(120,140,180,0.3)` fill, `rgba(120,140,180,0.8)`
    // border, `borderWidth: 1`.
    fill: rgba(120, 140, 180, 0.3);
    stroke: rgba(120, 140, 180, 0.8);
    stroke-width: 1;
    pointer-events: none;
  }
}
</style>
