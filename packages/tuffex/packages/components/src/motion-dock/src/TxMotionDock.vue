<script setup lang="ts">
// Adapted from Amicro Dock. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import type { VelocityTracker } from '../../../../utils/gesture'
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { MotionDockEmits, MotionDockId, MotionDockItem, MotionDockProps, MotionDockReorder } from './types'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createVelocityTracker, rubberband } from '../../../../utils/gesture'
import { useMotionActivity } from '../../../../utils/motion-activity'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { MOTION_DOCK_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxMotionDock' })
const props = withDefaults(defineProps<MotionDockProps>(), {
  reorderable: true, disabled: false, paused: false, size: 'md', showLabels: false, surface: 'refraction',
})
const emit = defineEmits<MotionDockEmits>()

interface Spring { stiffness: number, damping: number, mass?: number }
interface Axis { value: number, velocity: number, target: number }
interface ItemMotion { size: Axis, x: Axis, y: Axis, lift: Axis, released: boolean }

const SIZES: Record<string, number> = { xs: 20, sm: 24, md: 28, lg: 36 }
const SURFACES: readonly string[] = ['pure', 'mask', 'blur', 'glass', 'refraction', 'acrylic', 'mica', 'flat', 'plain']
// Magnification keeps the source's spring (ζ ≈ 1.7, so it never overshoots).
const SIZE_SPRING: Spring = { mass: .1, stiffness: 220, damping: 16 }
// Neighbours making room: critically damped, response ≈ 0.3 s.
const MOVE_SPRING: Spring = { stiffness: 440, damping: 42 }
// A released icon: ζ ≈ 0.8, response ≈ 0.35 s. Only a release carries the pointer's momentum, so only it overshoots.
const DROP_SPRING: Spring = { stiffness: 320, damping: 29 }
const LIFT = 1.06
const DRAG_SLOP = 4

const root = ref<HTMLElement | null>(null)
const shelf = ref<HTMLElement | null>(null)
const { active, present, reduced } = useMotionActivity(root, () => !props.paused && !props.disabled)
// Reflow and the drop answer the user's own drag, so pausing the magnification leaves them on.
const animated = computed(() => present.value && !reduced.value)
const instructionsId = useId()
const labels = computed(() => ({ ...MOTION_DOCK_DEFAULT_LABELS, ...props.labels }))
const itemSize = computed(() => props.itemSize !== undefined && Number.isFinite(props.itemSize)
  ? Math.max(16, props.itemSize) : SIZES[props.size] ?? 28)
const peakSize = computed(() => props.magnifiedSize !== undefined && Number.isFinite(props.magnifiedSize)
  ? Math.max(itemSize.value, props.magnifiedSize) : itemSize.value * 44 / 28)
// The source's 80 px radius belongs to its 28 px icons; a larger dock reaches as many neighbours.
const distance = computed(() => props.distance !== undefined && Number.isFinite(props.distance)
  ? Math.max(1, props.distance) : itemSize.value * 80 / 28)
const surfaceMode = computed<BaseSurfaceMode>(() => SURFACES.includes(props.surface) ? props.surface : 'refraction')
const rootStyle = computed<CSSProperties>(() => ({
  '--tx-motion-dock-base-size': `${itemSize.value}px`,
  '--tx-motion-dock-peak-size': `${peakSize.value}px`,
}))
const focusId = ref<MotionDockId>()
const localOrder = ref<MotionDockItem[] | null>(null)
const displayedItems = computed(() => localOrder.value ?? props.items)
const draggedId = ref<MotionDockId>()
const announcement = ref('')
const elements = new Map<MotionDockId, HTMLElement>()
const motions = new Map<MotionDockId, ItemMotion>()
let raf: number | undefined
let lastFrame: number | undefined
let suppressClick: MotionDockId | undefined
let drag: {
  id: MotionDockId
  pointerId: number
  startX: number
  startY: number
  /** Pointer to the icon's centre at grab time, so the icon never jumps to centre on the pointer. */
  grab: number
  moved: boolean
  capture: HTMLElement
  original: MotionDockItem[]
  tracker: VelocityTracker
} | undefined

function axis(value: number): Axis {
  return { value, velocity: 0, target: value }
}

function motionOf(id: MotionDockId): ItemMotion {
  let motion = motions.get(id)
  if (!motion) {
    motion = { size: axis(itemSize.value), x: axis(0), y: axis(0), lift: axis(1), released: false }
    motions.set(id, motion)
  }
  return motion
}

function paint(id: MotionDockId, motion: ItemMotion): void {
  const element = elements.get(id)
  if (!element)
    return
  element.style.setProperty('--tx-motion-dock-item-size', `${motion.size.value}px`)
  element.style.translate = motion.x.value || motion.y.value ? `${motion.x.value}px ${motion.y.value}px` : ''
  element.style.scale = motion.lift.value === 1 ? '' : String(motion.lift.value)
}

function setItemRef(id: MotionDockId, element: Element | ComponentPublicInstance | null): void {
  if (element && 'style' in element) {
    elements.set(id, element as HTMLElement)
    const motion = motions.get(id)
    if (motion)
      paint(id, motion)
  }
  else {
    elements.delete(id)
  }
}

/** Steps one axis; false once it has landed on its target. */
function advance(state: Axis, spring: Spring, dt: number, epsilon: number): boolean {
  if (state.value === state.target && state.velocity === 0)
    return false
  const [value, velocity] = stepSpring(state.value, state.velocity, state.target, spring, dt)
  if (Math.abs(value - state.target) <= epsilon && Math.abs(velocity) <= epsilon * 20) {
    state.value = state.target
    state.velocity = 0
    return false
  }
  state.value = value
  state.velocity = velocity
  return true
}

function land(state: Axis): void {
  state.value = state.target
  state.velocity = 0
}

function held(id: MotionDockId): boolean {
  return drag?.moved === true && drag.id === id
}

function stop(): void {
  if (raf !== undefined)
    cancelAnimationFrame(raf)
  raf = undefined
  lastFrame = undefined
}

function start(): void {
  if (raf === undefined && motions.size)
    raf = requestAnimationFrame(frame)
}

function frame(time: number): void {
  raf = undefined
  const dt = lastFrame === undefined ? 1 / 60 : Math.min(.1, Math.max(0, (time - lastFrame) / 1000))
  lastFrame = time
  let moving = false
  for (const [id, motion] of motions) {
    if (active.value)
      moving = advance(motion.size, SIZE_SPRING, dt, .02) || moving
    else
      motion.size = axis(itemSize.value)
    if (animated.value) {
      if (!held(id)) {
        const spring = motion.released ? DROP_SPRING : MOVE_SPRING
        moving = advance(motion.x, spring, dt, .05) || moving
        moving = advance(motion.y, spring, dt, .05) || moving
        if (motion.x.value === 0 && motion.y.value === 0)
          motion.released = false
      }
      moving = advance(motion.lift, held(id) ? MOVE_SPRING : DROP_SPRING, dt, .0005) || moving
    }
    else {
      if (!held(id)) {
        land(motion.x)
        land(motion.y)
      }
      land(motion.lift)
      motion.released = false
    }
    paint(id, motion)
  }
  if (moving)
    raf = requestAnimationFrame(frame)
  else
    lastFrame = undefined
}

function rest(): void {
  for (const [id, motion] of motions) {
    motion.size = axis(itemSize.value)
    paint(id, motion)
  }
}

/** Every icon straight to rest, for a dock that stops being drawn mid-motion. */
function snap(): void {
  for (const [id, motion] of motions) {
    motion.size = axis(itemSize.value)
    land(motion.x)
    land(motion.y)
    land(motion.lift)
    motion.released = false
    paint(id, motion)
  }
}

/** Sizes an icon by how far it is from the magnification's centre. */
function grow(item: MotionDockItem, offset: number): void {
  const reach = Math.min(1, offset / distance.value)
  // Cosine falloff: flat at the peak and at the edge, where the source's linear tent had corners.
  const proximity = item.disabled ? 0 : (1 + Math.cos(Math.PI * reach)) / 2
  motionOf(item.id).size.target = itemSize.value + (peakSize.value - itemSize.value) * proximity
}

function magnify(clientX: number): void {
  if (!active.value) {
    rest()
    return
  }
  // Read layout only on input, never from the spring frame driver.
  for (const item of displayedItems.value) {
    const bounds = elements.get(item.id)?.getBoundingClientRect()
    if (bounds)
      grow(item, Math.abs(clientX - bounds.left - bounds.width / 2))
  }
  start()
}

function leave(): void {
  for (const motion of motions.values())
    motion.size.target = itemSize.value
  start()
}

function focus(item: MotionDockItem): void {
  focusId.value = item.id
  // A click focuses its icon too, and there the pointer is already magnifying.
  if (!elements.get(item.id)?.matches(':focus-visible'))
    return
  if (!active.value) {
    rest()
    return
  }
  // Measured in resting slots, not in the icons as they are drawn: these are still sized for the
  // last focus, which would leave the new one lopsided, and may be sliding to a new slot.
  const gap = shelf.value ? Number.parseFloat(getComputedStyle(shelf.value).columnGap) || 0 : 0
  const order = displayedItems.value
  const at = order.findIndex(entry => entry.id === item.id)
  for (const [index, entry] of order.entries())
    grow(entry, Math.abs(index - at) * (itemSize.value + gap))
  start()
}

function select(item: MotionDockItem, index: number, event: MouseEvent): void {
  if (props.disabled || item.disabled || (suppressClick === item.id && event.detail > 0)) {
    event.preventDefault()
    suppressClick = undefined
    return
  }
  suppressClick = undefined
  emit('update:activeId', item.id)
  emit('select', item, index)
}

function announce(item: MotionDockItem, to: number, total: number): void {
  announcement.value = labels.value.reordered.replace('{label}', item.label)
    .replace('{position}', String(to + 1)).replace('{total}', String(total))
}

function commit(items: MotionDockItem[], detail: MotionDockReorder): void {
  if (detail.from === detail.to)
    return
  const item = items[detail.to]
  emit('update:items', items)
  emit('reorder', items, detail)
  if (item)
    announce(item, detail.to, items.length)
}

function endDrag(): void {
  const current = drag
  drag = undefined
  if (current?.capture.hasPointerCapture(current.pointerId))
    current.capture.releasePointerCapture(current.pointerId)
  draggedId.value = undefined
  localOrder.value = null
}

function cancelDrag(): void {
  const current = drag
  if (!current)
    return
  if (current.moved)
    motionOf(current.id).lift.target = 1
  endDrag()
  start()
}

function pointerDown(item: MotionDockItem, event: PointerEvent): void {
  if (!props.reorderable || props.disabled || item.disabled || event.button !== 0 || drag)
    return
  suppressClick = undefined
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  drag = {
    id: item.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    grab: event.clientX - bounds.left - bounds.width / 2,
    moved: false,
    capture: element,
    original: Array.from(props.items),
    tracker: createVelocityTracker(),
  }
  drag.tracker.reset(event.timeStamp, event.clientX, event.clientY)
  element.setPointerCapture(event.pointerId)
}

function pointerMove(event: PointerEvent): void {
  magnify(event.clientX)
  const current = drag
  if (!current || current.pointerId !== event.pointerId)
    return
  current.tracker.push(event.timeStamp, event.clientX, event.clientY)
  const dy = event.clientY - current.startY
  if (!current.moved) {
    if (Math.hypot(event.clientX - current.startX, dy) < DRAG_SLOP)
      return
    current.moved = true
    draggedId.value = current.id
    localOrder.value = Array.from(props.items)
  }
  event.preventDefault()
  const order = localOrder.value
  if (!order)
    return
  const motion = motionOf(current.id)
  const centre = event.clientX - current.grab
  // The held icon takes the slot nearest it. Slots are read where their icons land, not where
  // a reflow draws them this frame; the held icon is the widest, so a swap does not swap back.
  let from = -1
  let to = 0
  let nearest = Infinity
  for (const [index, entry] of order.entries()) {
    const bounds = elements.get(entry.id)?.getBoundingClientRect()
    if (!bounds)
      continue
    const slot = bounds.left + bounds.width / 2 - motionOf(entry.id).x.value
    if (entry.id === current.id) {
      from = index
      // 1:1 along the dock; across it the icon is tethered and follows less the further it is pulled.
      motion.x.value = centre - slot
    }
    if (Math.abs(centre - slot) < nearest) {
      nearest = Math.abs(centre - slot)
      to = index
    }
  }
  motion.y.value = rubberband(dy, itemSize.value)
  motion.x.velocity = 0
  motion.y.velocity = 0
  motion.lift.target = LIFT
  paint(current.id, motion)
  const item = order[from]
  if (item && from !== to) {
    const next = Array.from(order)
    next.splice(from, 1)
    next.splice(to, 0, item)
    localOrder.value = next
  }
  start()
}

function pointerUp(event: PointerEvent): void {
  const current = drag
  if (!current || current.pointerId !== event.pointerId)
    return
  if (current.moved) {
    suppressClick = current.id
    const motion = motionOf(current.id)
    const [vx, vy] = current.tracker.velocity(event.timeStamp)
    // The release continues at the pointer's speed; across the dock, at the tether's.
    const pull = itemSize.value / (itemSize.value + .55 * Math.abs(event.clientY - current.startY))
    motion.x.velocity = vx
    motion.y.velocity = vy * .55 * pull * pull
    motion.released = true
    motion.lift.target = 1
    const items = Array.from(localOrder.value ?? props.items)
    commit(items, { id: current.id, from: current.original.findIndex(item => item.id === current.id),
      to: items.findIndex(item => item.id === current.id), source: 'pointer' })
  }
  endDrag()
  start()
}

async function keyboard(item: MotionDockItem, event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape' && drag) {
    event.preventDefault()
    suppressClick = drag.id
    cancelDrag()
    return
  }
  if (props.disabled || item.disabled)
    return
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) {
    // Native buttons already activate with Space; links need the same toolbar behavior.
    if (event.key === ' ' && item.href) {
      event.preventDefault()
      elements.get(item.id)?.click()
    }
    return
  }
  event.preventDefault()
  if (event.altKey && props.reorderable && !drag) {
    const items = Array.from(props.items)
    const from = items.findIndex(entry => entry.id === item.id)
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, from + (event.key === 'ArrowLeft' ? -1 : 1)))
    if (from !== to && from >= 0) {
      items.splice(from, 1)
      items.splice(to, 0, item)
      commit(items, { id: item.id, from, to, source: 'keyboard' })
      await nextTick()
      const element = elements.get(item.id)
      element?.focus()
      // An item that kept focus gets no focus event: the magnification follows it to its new slot.
      if (element)
        focus(item)
    }
    return
  }
  const enabled = props.items.filter(entry => !entry.disabled)
  const index = enabled.findIndex(entry => entry.id === item.id)
  const target = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1]
    : enabled[(index + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) % enabled.length]
  if (target) {
    focusId.value = target.id
    elements.get(target.id)?.focus()
  }
}

/** FLIP: an icon whose slot moved starts from where it was drawn and springs into the new slot. */
function reflow(before: ReadonlyMap<MotionDockId, number>): void {
  const shifts: [MotionDockId, number][] = []
  for (const [id, element] of elements) {
    const left = before.get(id)
    if (left !== undefined)
      shifts.push([id, left - element.getBoundingClientRect().left])
  }
  for (const [id, shift] of shifts) {
    if (Math.abs(shift) < .5)
      continue
    const motion = motionOf(id)
    motion.x.value += shift
    paint(id, motion)
  }
  start()
}

// Every order change animates the same way: a drag, Alt + arrows, a caller that
// rejects a drop (the icon returns), or a caller replacing the array.
watch(() => displayedItems.value.map(item => item.id), (ids, previous) => {
  if (!animated.value || !previous || (ids.length === previous.length && ids.every((id, index) => id === previous[index])))
    return
  // A pre-flush watcher runs before the DOM is patched, so these are the old slots.
  const before = new Map<MotionDockId, number>()
  for (const [id, element] of elements)
    before.set(id, element.getBoundingClientRect().left)
  void nextTick(() => reflow(before))
}, { flush: 'pre' })
watch(() => props.items.map(item => [item.id, item.disabled] as const), (items) => {
  const ids = new Set(items.map(([id]) => id))
  for (const id of motions.keys()) {
    if (!ids.has(id))
      motions.delete(id)
  }
  if (drag && !ids.has(drag.id))
    cancelDrag()
  if (!props.items.some(item => item.id === focusId.value && !item.disabled))
    focusId.value = props.items.find(item => !item.disabled)?.id
}, { immediate: true })
watch(() => props.items, () => {
  // Never overwrite a caller's replacement array with a stale pointer snapshot.
  if (drag)
    cancelDrag()
})
watch([active, itemSize, peakSize], rest)
watch(animated, start)
watch([present, () => props.disabled, () => props.reorderable], ([visible, disabled, reorderable]) => {
  if (!visible || disabled || !reorderable)
    cancelDrag()
})
onDeactivated(() => { cancelDrag(); stop(); snap() })
onBeforeUnmount(() => { cancelDrag(); stop(); motions.clear(); elements.clear() })
</script>

<template>
  <div ref="root" class="tx-motion-dock" :class="{ 'is-dragging': draggedId !== undefined, 'is-labelled': showLabels }" :style="rootStyle">
    <div
      ref="shelf" class="tx-motion-dock__shelf" role="toolbar" aria-orientation="horizontal" :aria-label="labels.dock" :aria-describedby="instructionsId"
      @pointermove="pointerMove" @pointerleave="leave" @pointerup="pointerUp" @pointercancel="cancelDrag"
      @lostpointercapture="drag?.pointerId === $event.pointerId && cancelDrag()"
      @focusout="!root?.contains($event.relatedTarget as Node | null) && leave()"
    >
      <!-- No cross-fade on a theme switch: while the material transitions, Chrome draws the
        refraction without the shelf's rounded clip, a square flash of the old theme. -->
      <TxBaseSurface
        class="tx-motion-dock__surface" preset="card" fake aria-hidden="true" :transition-duration="0"
        :mode="surfaceMode" color="var(--tx-fill-color, #f0f2f5)" :opacity="surfaceMode === 'mask' ? .96 : .72"
      />
      <component
        :is="item.href ? 'a' : 'button'" v-for="(item, index) in displayedItems" :key="item.id"
        :ref="(element: Element | ComponentPublicInstance | null) => setItemRef(item.id, element)" class="tx-motion-dock__item"
        :class="{ 'is-active': activeId === item.id, 'is-dragging': draggedId === item.id, 'is-disabled': disabled || item.disabled, 'is-fixed': !reorderable }"
        :type="item.href ? undefined : 'button'" :href="disabled || item.disabled ? undefined : item.href"
        :disabled="!item.href && (disabled || item.disabled)" :aria-disabled="disabled || item.disabled || undefined"
        :role="item.href ? 'link' : undefined"
        :aria-label="item.label" :aria-pressed="!item.href && activeId !== undefined ? activeId === item.id : undefined"
        :aria-current="item.href && activeId === item.id ? 'page' : undefined"
        :tabindex="!disabled && !item.disabled && focusId === item.id ? 0 : -1"
        @focus="focus(item)" @click="select(item, index, $event)" @keydown="keyboard(item, $event)"
        @pointerdown="pointerDown(item, $event)" @dragstart.prevent
      >
        <slot name="item" :item="item" :index="index" :active="activeId === item.id" :dragging="draggedId === item.id">
          <span class="tx-motion-dock__icon" aria-hidden="true"><slot name="icon" :item="item" :index="index">{{ item.label.slice(0, 1) }}</slot></span>
        </slot>
        <span :class="showLabels ? 'tx-motion-dock__label' : 'tx-motion-dock__tip'" aria-hidden="true"><slot name="label" :item="item" :index="index">{{ item.label }}</slot></span>
        <span class="tx-motion-dock__dot" aria-hidden="true" />
      </component>
    </div>
    <span :id="instructionsId" class="tx-motion-dock__sr">{{ labels.instructions }}</span>
    <span class="tx-motion-dock__sr" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-motion-dock {
  --tx-motion-dock-pad: calc(var(--tx-motion-dock-base-size) * .22 + 1px);
  --tx-motion-dock-gap: calc(var(--tx-motion-dock-base-size) * .18);
  --tx-motion-dock-dot: 4px;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 100%;
  // The magnified icons grow up out of the shelf, into room kept above it rather than inside it.
  padding-top: calc(var(--tx-motion-dock-peak-size) - var(--tx-motion-dock-base-size));
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  vertical-align: bottom;

  &.is-labelled {
    padding-bottom: 22px;
  }
}

.tx-motion-dock__shelf {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: flex-end;
  gap: var(--tx-motion-dock-gap);
  box-sizing: border-box;
  height: calc(var(--tx-motion-dock-base-size) + var(--tx-motion-dock-pad) * 2);
  padding: var(--tx-motion-dock-pad);
  // Concentric with the resting icons: their radius plus the inset.
  @include tx-squircle(calc(var(--tx-motion-dock-base-size) * .225 + var(--tx-motion-dock-pad)));

  // Ring and shadow above the material (an inset ring under it would be covered) and under the icons.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5), var(--tx-elevation-4, 4px 8px 24px rgba(0, 0, 0, .08));
    pointer-events: none;
  }
}

.tx-motion-dock__surface {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.tx-motion-dock__item {
  --tx-motion-dock-size: var(--tx-motion-dock-item-size, var(--tx-motion-dock-base-size));
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--tx-motion-dock-size);
  height: var(--tx-motion-dock-size);
  margin: 0;
  padding: 0;
  border: 0;
  @include tx-squircle(calc(var(--tx-motion-dock-size) * .225));
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: none;
  cursor: grab;
  user-select: none;
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;

  &.is-fixed:not(.is-disabled) {
    cursor: pointer;
  }

  &.is-dragging {
    z-index: 1;
    cursor: grabbing;
  }

  &.is-disabled {
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

.tx-motion-dock__icon {
  position: relative;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  corner-shape: inherit;
  background: var(--tx-surface-raised, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5), var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, .04));
  color: var(--tx-text-color-primary, #303133);
  // A slotted 1em glyph keeps to 56% of the tile at every magnification.
  font-size: calc(var(--tx-motion-dock-size) * .56);
  font-weight: var(--tx-font-weight-medium, 500);
  line-height: 1;

  // The held icon's deeper shadow fades in on a layer of its own: transitioning the tile's
  // shadow would also cross-fade its ring on a theme switch.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    corner-shape: inherit;
    box-shadow: var(--tx-elevation-4, 4px 8px 24px rgba(0, 0, 0, .08));
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease-out;
  }

  .is-dragging > &::after {
    opacity: 1;
  }

  .tx-motion-dock__item:active:not(.is-disabled, .is-dragging) > & {
    filter: brightness(.92);
  }

  .is-disabled > & {
    opacity: .45;
  }
}

.tx-motion-dock__tip,
.tx-motion-dock__label {
  position: absolute;
  left: 50%;
  translate: -50% 0;
  white-space: nowrap;
  pointer-events: none;
}

.tx-motion-dock__tip {
  bottom: calc(100% + 6px);
  padding: 3px 8px;
  font-size: 12px;
  line-height: 18px;
  @include tx-squircle(7px);
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5), var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, .06));
  color: var(--tx-text-color-primary, #303133);
  opacity: 0;
  translate: -50% 3px;
  transition: opacity 120ms ease-out, translate 160ms ease-out;

  .tx-motion-dock__item:focus-visible > & {
    opacity: 1;
    translate: -50% 0;
  }

  // A tap leaves :hover behind on touch screens, so only a hovering pointer raises the bubble.
  @media (hover: hover) {
    .tx-motion-dock__item:hover > & {
      opacity: 1;
      translate: -50% 0;
    }
  }

  .tx-motion-dock.is-dragging & {
    opacity: 0;
  }
}

// No wider than the icon and half a gap each side, so neighbours never overlap; a magnified
// icon has room for more of its name.
.tx-motion-dock__label {
  top: calc(100% + var(--tx-motion-dock-pad) + 6px);
  max-width: calc(var(--tx-motion-dock-size) + var(--tx-motion-dock-gap));
  overflow: hidden;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
}

.tx-motion-dock__dot {
  position: absolute;
  top: calc(100% + (var(--tx-motion-dock-pad) - var(--tx-motion-dock-dot)) / 2);
  left: calc(50% - var(--tx-motion-dock-dot) / 2);
  width: var(--tx-motion-dock-dot);
  height: var(--tx-motion-dock-dot);
  border-radius: 50%;
  background: var(--tx-text-color-regular, #606266);
  opacity: 0;
  scale: .5;
  pointer-events: none;
  transition: opacity 160ms ease-out, scale 200ms ease-out;

  .is-active > & {
    opacity: 1;
    scale: 1;
  }
}

.tx-motion-dock__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tx-motion-dock__icon::after,
  .tx-motion-dock__tip,
  .tx-motion-dock__dot {
    transition: none;
  }
}
</style>
