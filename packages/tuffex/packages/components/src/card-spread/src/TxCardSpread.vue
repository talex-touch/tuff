<script setup lang="ts">
// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { CSSProperties } from 'vue'
import type { VelocityTracker } from '../../../../utils/gesture'
import type { CardSpreadEmits, CardSpreadProps, CardSpreadSlotProps } from './types'
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createVelocityTracker, projectMomentum, tether } from '../../../../utils/gesture'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { SPREAD_DEFAULTS, spreadGeometry } from './geometry'

defineOptions({ name: 'TxCardSpread' })
const props = withDefaults(defineProps<CardSpreadProps>(), {
  variant: 'card-arc-5', expanded: undefined, duration: 500, hoverIntensity: 1,
  colorful: false, blurAmount: 4, opacityAmount: 0.4, showBrackets: true,
  animated: true, disabled: false, draggable: true, size: 'md', ariaLabel: 'Card spread',
  expandLabel: 'Expand cards', collapseLabel: 'Collapse cards',
})
const emit = defineEmits<CardSpreadEmits>()
defineSlots<{ item?: (props: CardSpreadSlotProps) => unknown, empty?: () => unknown }>()
interface Spring { stiffness: number, damping: number, mass?: number }
const DRAG_SLOP = 4
// A release faster than this, in px/s, carried momentum: only then may the card overshoot its slot.
const FLICK = 100
const LIFT = 1.04
// Pulled out of the deck by a third of its height along its own upright, or flicked that far, a card is chosen.
const CHOOSE = 1 / 3
const root = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const pointerInside = ref(false)
const focusInside = ref(false)
const pinned = ref(false)
const hoveredIndex = ref<number | null>(null)
const focusedIndex = ref<number | null>(null)
const focusIndex = computed(() => hoveredIndex.value ?? focusedIndex.value)
const localIndex = ref(0)
const { active } = useMotionActivity(root, () => props.animated)
const expanded = computed(() => props.expanded ?? (pinned.value || pointerInside.value || focusInside.value))
const selected = computed(() => Math.max(0, Math.min(props.items.length - 1, props.modelValue ?? localIndex.value)))
const ratio = computed(() => ({ xs: 0.6, sm: 0.8, md: 1, lg: 1.2 })[props.size])
const defaults = computed(() => SPREAD_DEFAULTS[props.variant])
const cardSpring = computed<Required<Spring>>(() => props.variant === 'card-cascade-stagger'
  ? { stiffness: 200, damping: 22, mass: 0.9 }
  : { stiffness: 180, damping: 20, mass: 0.8 })
const transition = computed(() => {
  const spring = resolveTransition(cardSpring.value, !active.value)
  return `transform ${active.value ? props.duration : 0}ms ${spring.easing}, opacity ${active.value ? props.duration : 0}ms ${spring.easing}, filter ${active.value ? props.duration : 0}ms ${spring.easing}`
})
const palette = ['var(--tx-color-danger-light-9)', 'var(--tx-color-primary-light-9)', 'var(--tx-color-success-light-9)', 'var(--tx-color-warning-light-9)', 'var(--tx-color-info-light-9)']
const geometry = computed(() => props.items.map((_, index) => spreadGeometry(
  props.variant, index, props.items.length, expanded.value,
  props.angle ?? defaults.value.angle, props.gap ?? defaults.value.gap,
  props.yOffset ?? defaults.value.yOffset, props.hoverIntensity,
)))
const stageStyle = computed<CSSProperties>(() => {
  const extentX = geometry.value.reduce((extent, point) => Math.max(extent, Math.abs(point.x)), 0)
  const extentY = geometry.value.reduce((extent, point) => Math.max(extent, Math.abs(point.y)), 0)
  return { minWidth: `${(200 + extentX * 2) * ratio.value}px`, height: `${(270 + extentY * 2) * ratio.value}px` }
})
function cardStyle(index: number): CSSProperties {
  const point = geometry.value[index]
  const item = props.items[index]
  if (!point) return {}
  return {
    width: `${128 * ratio.value}px`, height: `${176 * ratio.value}px`,
    transform: `translate(-50%, -50%) translate(${point.x * ratio.value}px, ${point.y * ratio.value}px) rotate(${point.rotate}deg) scale(${point.scale})`,
    transformOrigin: point.origin, zIndex: raisedIndex.value === index ? props.items.length + 1 : point.z,
    transition: transition.value,
    backgroundColor: item?.color ?? (props.colorful ? palette[index % palette.length] : undefined),
  }
}
function blurStyle(index: number): CSSProperties {
  const inactive = focusIndex.value !== null && focusIndex.value !== index
  return { filter: inactive ? `blur(${props.blurAmount}px)` : 'none', opacity: inactive ? props.opacityAmount : 1, transition: transition.value, '--tx-focus-transition': `transform ${active.value ? props.duration : 0}ms ${resolveTransition({ stiffness: 350, damping: 20 }, !active.value).easing}, opacity ${active.value ? props.duration : 0}ms ease` }
}
/** A card out of its slot, held or springing home; drawn with `translate` and `scale` over its resting transform. */
const raisedIndex = ref<number | null>(null)
/** Whether the loose card may leave the viewport over the page: a deck wider than it scrolls, and has to keep clipping. */
const unclipped = ref(false)
const dragging = ref(false)
let loose: {
  index: number
  element: HTMLElement
  x: number
  y: number
  vx: number
  vy: number
  lift: number
  liftVelocity: number
  spring: Spring
  /** The grabbed point from the card's transform origin, which the lift scales about, as drawn at home and unlifted. */
  pivot: [number, number]
} | undefined
let raf: number | undefined
let lastFrame: number | undefined
let suppressClick = false
let drag: {
  kind: 'pull' | 'scrub'
  pointerId: number
  index: number
  /** The item pressed: by the time the pointer has moved, it may be over a neighbour. */
  target: HTMLElement
  x: number
  y: number
  moved: boolean
  /** Where the card was drawn when grabbed, and how far it moves 1:1 before the viewport's edge resists. */
  from: [number, number]
  min: [number, number]
  max: [number, number]
  size: [number, number]
  tracker: VelocityTracker
} | undefined
/** The card spring, rescaled to `duration` like its CSS curve; a release keeps its frequency, ζ ≈ 0.8 after a flick. */
function releaseSpring(flick: boolean): Spring {
  const omega = Math.sqrt(cardSpring.value.stiffness / cardSpring.value.mass) * resolveTransition(cardSpring.value).duration / props.duration
  return { stiffness: omega * omega, damping: 2 * (flick ? 0.8 : 1) * omega }
}
function paint(state: NonNullable<typeof loose>) {
  // Shifted by what the lift moves the grabbed point, so that point stays under the pointer.
  const x = state.x - (state.lift - 1) * state.pivot[0]
  const y = state.y - (state.lift - 1) * state.pivot[1]
  state.element.style.translate = x || y ? `${x}px ${y}px` : ''
  state.element.style.scale = state.lift === 1 ? '' : String(state.lift)
}
/** The point on the screen the lift scales about: the card's transform origin, laid out before any transform. */
function originOf(element: HTMLElement): [number, number] | undefined {
  const parent = element.offsetParent
  if (!(parent instanceof HTMLElement)) return undefined
  const bounds = parent.getBoundingClientRect()
  const [x = 0, y = 0] = getComputedStyle(element).transformOrigin.split(' ').map(Number.parseFloat)
  return [bounds.left + parent.clientLeft + element.offsetLeft + x, bounds.top + parent.clientTop + element.offsetTop + y]
}
function stop() {
  if (raf !== undefined) cancelAnimationFrame(raf)
  raf = undefined
  lastFrame = undefined
}
/** The loose card straight back into its slot. */
function land() {
  stop()
  const state = loose
  loose = undefined
  raisedIndex.value = null
  if (!state) return
  state.x = 0; state.y = 0; state.lift = 1
  paint(state)
}
function frame(time: number) {
  raf = undefined
  const state = loose
  if (!state) return
  const dt = lastFrame === undefined ? 1 / 60 : Math.min(0.1, Math.max(0, (time - lastFrame) / 1000))
  lastFrame = time
  const held = drag?.moved === true && drag.index === state.index
  if (!held) {
    const [x, vx] = stepSpring(state.x, state.vx, 0, state.spring, dt)
    const [y, vy] = stepSpring(state.y, state.vy, 0, state.spring, dt)
    Object.assign(state, { x, vx, y, vy })
  }
  const height = held ? LIFT : 1
  const [lift, liftVelocity] = stepSpring(state.lift, state.liftVelocity, height, releaseSpring(false), dt)
  const lifted = Math.abs(lift - height) < 1e-3 && Math.abs(liftVelocity) < 1e-2
  state.lift = lifted ? height : lift
  state.liftVelocity = lifted ? 0 : liftVelocity
  if (!held && Math.hypot(state.x, state.y) < 0.1 && Math.hypot(state.vx, state.vy) < 1 && state.lift === 1) { land(); return }
  paint(state)
  if (!held || state.lift !== LIFT) raf = requestAnimationFrame(frame)
  else lastFrame = undefined
}
function start() {
  if (!loose) return
  const held = drag?.moved === true && drag.index === loose.index
  if (!active.value || !(props.duration > 0)) {
    // Without motion the held card still follows the pointer; everything else is at rest at once.
    if (!held) { land(); return }
    loose.lift = LIFT
    paint(loose)
    return
  }
  if (raf === undefined) raf = requestAnimationFrame(frame)
}
function endDrag() {
  const state = drag
  drag = undefined
  dragging.value = false
  window.removeEventListener('keydown', onDragKeydown, true)
  const owner = state?.kind === 'scrub' ? list.value : loose?.element
  if (state && owner?.hasPointerCapture(state.pointerId)) owner.releasePointerCapture(state.pointerId)
}
/** Escape, a cancelled pointer or lost capture: nothing is chosen, and a pulled card springs home. */
function cancelDrag() {
  const state = drag
  if (!state) return
  endDrag()
  if (!state.moved) return
  suppressClick = true
  if (state.kind === 'scrub') { hoveredIndex.value = null; return }
  if (loose) { loose.spring = releaseSpring(false); start() }
}
function onDragKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !drag?.moved) return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}
function pointerDown(kind: 'pull' | 'scrub', index: number, event: PointerEvent) {
  if (!props.draggable || props.disabled || drag?.moved || event.button !== 0 || !event.isPrimary) return
  suppressClick = false
  drag = { kind, pointerId: event.pointerId, index, target: event.currentTarget as HTMLElement, x: event.clientX, y: event.clientY, moved: false, from: [0, 0], min: [0, 0], max: [0, 0], size: [0, 0], tracker: createVelocityTracker() }
}
/** The focus item under the pointer, for a scrub that holds pointer capture. */
function itemAt(x: number, y: number) {
  const item = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tx-card-spread__focus-item')
  return item && list.value?.contains(item) ? Number(item.dataset.index) : null
}
/** Picks the card up: grabbed while springing home it continues from where it is drawn. */
function pickUp(state: NonNullable<typeof drag>, element: HTMLElement) {
  if (loose && loose.index !== state.index) land()
  if (!loose) {
    unclipped.value = (stage.value?.offsetWidth ?? 0) <= (viewport.value?.clientWidth ?? 0)
    loose = { index: state.index, element, x: 0, y: 0, vx: 0, vy: 0, lift: 1, liftVelocity: 0, spring: releaseSpring(false), pivot: [0, 0] }
  }
  // Caught still lifted and out of its slot, the card keeps its drawn place under the new grab.
  const drawnX = loose.x - (loose.lift - 1) * loose.pivot[0]
  const drawnY = loose.y - (loose.lift - 1) * loose.pivot[1]
  const origin = originOf(element)
  const pivot: [number, number] = origin ? [(state.x - origin[0] - drawnX) / loose.lift, (state.y - origin[1] - drawnY) / loose.lift] : [0, 0]
  loose.x = drawnX + (loose.lift - 1) * pivot[0]
  loose.y = drawnY + (loose.lift - 1) * pivot[1]
  loose.pivot = pivot
  loose.vx = 0
  loose.vy = 0
  raisedIndex.value = state.index
  state.from = [loose.x, loose.y]
  if (unclipped.value) { state.min = [-Infinity, -Infinity]; state.max = [Infinity, Infinity]; return }
  // Free inside the viewport, which clips a deck that scrolls; read once, at grab time.
  const bounds = element.getBoundingClientRect()
  const clip = viewport.value?.getBoundingClientRect()
  if (clip) {
    const left = bounds.left - loose.x
    const top = bounds.top - loose.y
    state.min = [Math.min(0, clip.left - left), Math.min(0, clip.top - top)]
    state.max = [Math.max(0, clip.right - left - bounds.width), Math.max(0, clip.bottom - top - bounds.height)]
    state.size = [clip.width, clip.height]
  }
}
function pointerMove(event: PointerEvent) {
  const state = drag
  if (!state || state.pointerId !== event.pointerId) return
  const begins = !state.moved
  if (begins) {
    const dx = Math.abs(event.clientX - state.x)
    const dy = Math.abs(event.clientY - state.y)
    if (Math.hypot(dx, dy) < DRAG_SLOP) return
    // A scrubbing touch that sets off vertically is the page's scroll: the browser pans and cancels it anyway.
    if (state.kind === 'scrub' && event.pointerType !== 'mouse' && dy > dx) { drag = undefined; return }
    const element = state.kind === 'scrub' ? list.value : state.target
    if (!element) { drag = undefined; return }
    state.moved = true
    dragging.value = true
    if (state.kind === 'pull') pickUp(state, element)
    element.setPointerCapture(event.pointerId)
    window.addEventListener('keydown', onDragKeydown, true)
  }
  event.preventDefault()
  if (state.kind === 'scrub') { hoveredIndex.value = itemAt(event.clientX, event.clientY); return }
  if (!loose) return
  loose.x = tether(state.from[0] + event.clientX - state.x, state.min[0], state.max[0], state.size[0])
  loose.y = tether(state.from[1] + event.clientY - state.y, state.min[1], state.max[1], state.size[1])
  paint(loose)
  if (begins) { state.tracker.reset(event.timeStamp, loose.x, loose.y); start() }
  else state.tracker.push(event.timeStamp, loose.x, loose.y)
}
function pointerUp(event: PointerEvent) {
  const state = drag
  if (!state || state.pointerId !== event.pointerId) return
  endDrag()
  if (!state.moved) return
  suppressClick = true
  if (state.kind === 'scrub') {
    const index = itemAt(event.clientX, event.clientY)
    if (index !== null) select(index)
    return
  }
  if (!loose) return
  const [vx, vy] = state.tracker.velocity(event.timeStamp)
  // Chosen by where the flick would carry the card: out along its own upright, not sideways across the deck.
  const angle = (geometry.value[state.index]?.rotate ?? 0) * Math.PI / 180
  const x = loose.x + projectMomentum(vx)
  const y = loose.y + projectMomentum(vy)
  const along = x * Math.sin(angle) - y * Math.cos(angle)
  const across = x * Math.cos(angle) + y * Math.sin(angle)
  if (along > CHOOSE * 176 * ratio.value && along > Math.abs(across)) select(state.index)
  loose.vx = vx
  loose.vy = vy
  loose.spring = releaseSpring(Math.hypot(vx, vy) >= FLICK)
  start()
}
function choose(index: number, event: MouseEvent) {
  // A drag ends in its own choice; the click it leaves behind is not one. Keyboard clicks have no detail.
  if (suppressClick && event.detail > 0) { event.preventDefault(); suppressClick = false; return }
  if (props.disabled) { event.preventDefault(); return }
  select(index)
}
function select(index: number) {
  if (props.disabled || !props.items[index]) return
  localIndex.value = index
  emit('update:modelValue', index)
  emit('select', props.items[index], index)
}
function toggle() {
  if (props.disabled) return
  pinned.value = !(props.expanded ?? pinned.value)
  emit('update:expanded', pinned.value)
}
function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (step) { event.preventDefault(); select(Math.max(0, Math.min(props.items.length - 1, selected.value + step))) }
  else if (event.key === 'Home') { event.preventDefault(); select(0) }
  else if (event.key === 'End') { event.preventDefault(); select(props.items.length - 1) }
  else if (event.key === 'Escape') { pinned.value = false; emit('update:expanded', false) }
}
function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) { focusInside.value = false; focusedIndex.value = null }
}
watch([() => props.items.length, () => props.variant, () => props.disabled, () => props.draggable], () => { if (drag) endDrag(); land() })
watch(active, (value) => { if (!value) start() })
onDeactivated(() => { if (drag) endDrag(); land() })
onBeforeUnmount(() => { if (drag) endDrag(); stop() })
defineExpose({ select, toggle })
</script>

<template>
  <div ref="root" class="tx-card-spread" :class="{ 'is-expanded': expanded, 'is-disabled': disabled, 'is-draggable': draggable && !disabled, 'is-dragging': dragging }" :data-variant="variant" role="group" :aria-label="ariaLabel" @keydown="onKeydown" @pointerenter="pointerInside = true" @pointerleave="pointerInside = false; hoveredIndex = null" @focusin="focusInside = true" @focusout="onFocusOut">
    <slot v-if="!items.length" name="empty" />
    <div v-else-if="variant === 'focus-blur'" ref="list" class="tx-card-spread__focus-list" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag?.pointerId === $event.pointerId && cancelDrag()" @lostpointercapture="$event.target === list && drag?.pointerId === $event.pointerId && cancelDrag()">
      <component :is="item.href ? 'a' : 'button'" v-for="(item, index) in items" :key="item.id ?? index" :href="disabled ? undefined : item.href" :type="item.href ? undefined : 'button'" :disabled="!item.href && disabled" :aria-disabled="disabled || undefined" class="tx-card-spread__focus-item" :class="{ 'has-brackets': showBrackets && focusIndex === index }" :style="blurStyle(index)" :data-index="index" :draggable="draggable && item.href ? false : undefined" @pointerdown="pointerDown('scrub', index, $event)" @pointerenter="hoveredIndex = index" @pointerleave="hoveredIndex = null" @focus="focusedIndex = index" @click="choose(index, $event)">
        <slot name="item" :item="item" :index="index" :selected="selected === index" :expanded="expanded">
{{ item.title }}
</slot>
      </component>
    </div>
    <template v-else-if="items.length">
      <div ref="viewport" class="tx-card-spread__viewport" :class="{ 'is-unclipped': raisedIndex !== null && unclipped }">
        <div ref="stage" class="tx-card-spread__stage" :style="stageStyle" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag?.pointerId === $event.pointerId && cancelDrag()" @lostpointercapture="$event.target === loose?.element && drag?.pointerId === $event.pointerId && cancelDrag()">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-card-spread__card" :class="{ 'is-selected': selected === index, 'is-stamp': variant === 'card-stamp-arc' }" :style="cardStyle(index)" :disabled="disabled" :aria-pressed="selected === index" :aria-label="item.title || `${ariaLabel} ${index + 1}`" @pointerdown="pointerDown('pull', index, $event)" @click="choose(index, $event)">
            <slot name="item" :item="item" :index="index" :selected="selected === index" :expanded="expanded">
              <img v-if="item.src" class="tx-card-spread__image" :src="item.src" :alt="item.alt ?? item.title ?? ''" draggable="false">
              <span class="tx-card-spread__content"><span>{{ item.title }}</span><small v-if="item.description">{{ item.description }}</small></span>
            </slot>
          </button>
        </div>
      </div>
      <button type="button" class="tx-card-spread__toggle" :disabled="disabled" :aria-expanded="expanded" @click="toggle">
{{ (props.expanded ?? pinned) ? collapseLabel : expandLabel }}
</button>
    </template>
  </div>
</template>

<style scoped>
.tx-card-spread { width: 100%; color: var(--tx-text-color-primary); font-size: 13px; }
.tx-card-spread__viewport { overflow: auto; }
.tx-card-spread__stage { position: relative; width: 100%; }
/* A deck that fits lets a card out of its slot come out over the page; one that scrolls keeps clipping it. */
.tx-card-spread__viewport.is-unclipped { overflow: visible; }
.tx-card-spread__card { position: absolute; top: 50%; left: 50%; padding: 0; border: 0; border-radius: 16px; background: var(--tx-bg-color-overlay, var(--tx-bg-color)); color: inherit; box-shadow: inset 0 0 0 1px var(--tx-border-color), 2px 4px 12px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); overflow: hidden; cursor: pointer; text-align: left; font: inherit; }
/* A card is pulled out in any direction, so it is the one place a touch drag does not scroll the page. */
.tx-card-spread.is-draggable .tx-card-spread__card { cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; }
.tx-card-spread.is-dragging .tx-card-spread__card { cursor: grabbing; }
.tx-card-spread.is-draggable .tx-card-spread__focus-list { touch-action: pan-y; -webkit-user-select: none; user-select: none; }
.tx-card-spread__card.is-selected { box-shadow: inset 0 0 0 2px var(--tx-color-primary), 2px 4px 12px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); }
.tx-card-spread__card.is-stamp { outline: 2px dashed var(--tx-border-color-darker); outline-offset: -7px; }
.tx-card-spread__card:focus-visible, .tx-card-spread__toggle:focus-visible, .tx-card-spread__focus-item:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-card-spread__image { display: block; width: 100%; height: 68%; object-fit: cover; }
.tx-card-spread__content { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.tx-card-spread__content small { font-size: 12px; color: var(--tx-text-color-regular); }
.tx-card-spread__toggle { display: block; margin: 8px auto; padding: 6px 12px; border: 0; border-radius: 8px; background: var(--tx-fill-color-light); color: var(--tx-text-color-regular); font: inherit; cursor: pointer; }
.tx-card-spread__toggle:hover { background: var(--tx-fill-color); }
.tx-card-spread__focus-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; padding: 28px 16px; }
.tx-card-spread__focus-item { position: relative; padding: 4px 8px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: var(--tx-font-weight-medium, 500); cursor: pointer; text-decoration: none; }
.tx-card-spread__focus-item.has-brackets { color: var(--tx-color-primary); }
.tx-card-spread__focus-item::after { content: ''; position: absolute; inset: -4px -8px; border: 2px dashed var(--tx-border-color-darker); border-radius: 8px; pointer-events: none; opacity: 0; transform: scale(1.3); transition: var(--tx-focus-transition); }
.tx-card-spread__focus-item.has-brackets::after { opacity: 1; transform: scale(1.1); }
.tx-card-spread button:disabled, .tx-card-spread [aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }
@media (prefers-reduced-motion: reduce) { .tx-card-spread__card, .tx-card-spread__focus-item, .tx-card-spread__focus-item::after { transition: none !important; } }
</style>
