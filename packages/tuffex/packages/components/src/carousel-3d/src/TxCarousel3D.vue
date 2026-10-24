<script setup lang="ts">
// Adapted from Amicro CardCarousel, CardCoverFlow, CardTimeMachine.
// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { CSSProperties } from 'vue'
import type { VelocityTracker } from '../../../../utils/gesture'
import type { Carousel3DEmits, Carousel3DProps, Carousel3DSlotProps } from './types'
import { computed, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { drawnScale } from '../../../../utils/drawn-scale'
import { createVelocityTracker, projectMomentum, rubberband } from '../../../../utils/gesture'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { presets, resolveTransition } from '../../liquid/src/spring'
import { TxTextMorph } from '../../text-morph'

defineOptions({ name: 'TxCarousel3D' })
const props = withDefaults(defineProps<Carousel3DProps>(), {
  variant: 'card-carousel', expanded: undefined, loop: false, animated: true,
  disabled: false, draggable: true, controls: true, dots: true, timeline: true, timelineHover: true,
  duration: 800, size: 'md', ariaLabel: 'Card carousel', previousLabel: 'Previous',
  nextLabel: 'Next', itemLabel: 'Item', timelineLabel: 'Timeline',
})
const emit = defineEmits<Carousel3DEmits>()
defineSlots<{
  item?: (props: Carousel3DSlotProps) => unknown
  caption?: (props: Carousel3DSlotProps) => unknown
  empty?: () => unknown
}>()
type Mode = 'carousel' | 'cover-flow' | 'time-machine'
interface Spring { stiffness: number, damping: number, mass?: number }
// The source's springs. Each plays over `duration`, as the CSS curve compiled from it did.
const SPRINGS: Record<Mode, Required<Spring>> = {
  'carousel': presets.smooth,
  'cover-flow': { stiffness: 200, damping: 25, mass: 1 },
  'time-machine': { stiffness: 250, damping: 25, mass: 0.8 },
}
const DRAG_SLOP = 4
// A release faster than this, in px/s, carried momentum: only then may the deck overshoot its card.
const FLICK = 100
// A snappier stop than a scroll view's 0.998: a flick moves a few cards, not to the end of the deck.
const DECELERATION = 0.99
const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const hovered = ref(false)
const focused = ref(false)
const hoverPosition = ref<number | null>(null)
const localIndex = ref(props.variant.includes('time-machine') ? 0 : Math.min(2, props.items.length - 1))
const { active } = useMotionActivity(root, () => props.animated)
const filterId = `tx-carousel-${useId().replace(/[^\w-]/g, '')}`
const mode = computed<Mode>(() => props.variant.includes('time-machine') ? 'time-machine' : props.variant.includes('cover-flow') ? 'cover-flow' : 'carousel')
const mono = computed(() => props.variant.endsWith('-mono'))
const ratio = computed(() => ({ xs: 0.6, sm: 0.8, md: 1, lg: 1.2 })[props.size])
const current = computed(() => Math.max(0, Math.min(props.items.length - 1, props.modelValue ?? localIndex.value)))
const expanded = computed(() => props.expanded ?? (hovered.value || focused.value))
const motion = computed(() => resolveTransition(SPRINGS[mode.value], !active.value))
/** The variant's spring, rescaled to settle in `duration` like the CSS curve it replaces. */
const spring = computed<Required<Spring>>(() => {
  const config = SPRINGS[mode.value]
  const natural = resolveTransition(config).duration
  const scale = natural > 0 && props.duration > 0 ? natural / props.duration : 1
  return { stiffness: config.stiffness * scale * scale, damping: config.damping * scale, mass: config.mass }
})
/** Pixels of pointer travel per card in the stage's own px, along the axis the variant moves on. */
const pitch = computed(() => (mode.value === 'time-machine' ? 300 : mode.value === 'cover-flow' ? 32 : 160) * ratio.value)
/** Where the deck is drawn, in cards: `current` at rest, fractional in flight or under the pointer. */
const position = ref(current.value)
/** How far the carousel has fanned out towards `expanded`, 0..1. */
const spread = ref(expanded.value ? 1 : 0)
const dragging = ref(false)
let velocity = 0
let spreadVelocity = 0
let release: { target: number, spring: Spring } | undefined
let raf: number | undefined
let lastFrame: number | undefined
let suppressClick = false
let drag: { pointerId: number, x: number, y: number, from: number, size: number, scale: number, moved: boolean, tracker: VelocityTracker } | undefined
const transition = computed(() => `transform ${active.value ? props.duration : 0}ms ${motion.value.easing}, opacity ${active.value ? props.duration : 0}ms ${motion.value.easing}`)
const nodes = computed(() => {
  const result: { position: number, index: number, main: boolean }[] = []
  props.items.forEach((_, index) => {
    result.push({ position: index, index, main: true })
    if (index < props.items.length - 1) {
      result.push({ position: index + 0.33, index, main: false })
      result.push({ position: index + 0.66, index: index + 1, main: false })
    }
  })
  return result
})
watch(() => props.items.length, length => { localIndex.value = Math.max(0, Math.min(length - 1, localIndex.value)) })
function select(index: number) {
  if (props.disabled || !props.items.length || !Number.isFinite(index)) return
  const count = props.items.length
  const next = props.loop ? ((Math.round(index) % count) + count) % count : Math.max(0, Math.min(count - 1, Math.round(index)))
  if (next === current.value) return
  localIndex.value = next
  emit('update:modelValue', next)
  const item = props.items[next]
  if (item) emit('change', item, next)
}
/** One spring step; lands on the target once it is there and still. */
function settle(value: number, speed: number, target: number, config: Spring, dt: number): [number, number] {
  if (value === target && speed === 0) return [target, 0]
  const [next, nextSpeed] = stepSpring(value, speed, target, config, dt)
  return Math.abs(next - target) < 1e-3 && Math.abs(nextSpeed) < 1e-2 ? [target, 0] : [next, nextSpeed]
}
function frame(time: number) {
  raf = undefined
  const dt = lastFrame === undefined ? 1 / 60 : Math.min(0.1, Math.max(0, (time - lastFrame) / 1000))
  lastFrame = time
  let moving = false
  if (!drag?.moved) {
    const [value, speed] = settle(position.value, velocity, current.value, release?.spring ?? spring.value, dt)
    position.value = value
    velocity = speed
    if (speed === 0 && value === current.value) release = undefined
    else moving = true
  }
  // Only the carousel fans out; the other variants read `expanded` nowhere.
  const fanned = expanded.value ? 1 : 0
  const [amount, amountSpeed] = mode.value === 'carousel' ? settle(spread.value, spreadVelocity, fanned, spring.value, dt) : [fanned, 0]
  spread.value = amount
  spreadVelocity = amountSpeed
  if (amountSpeed !== 0 || amount !== fanned) moving = true
  if (moving) raf = requestAnimationFrame(frame)
  else lastFrame = undefined
}
function stop() {
  if (raf !== undefined) cancelAnimationFrame(raf)
  raf = undefined
  lastFrame = undefined
}
/** Straight to rest, except a deck held under the pointer: that keeps following it. */
function land() {
  stop()
  if (!drag?.moved) { position.value = current.value; velocity = 0; release = undefined }
  spread.value = expanded.value ? 1 : 0
  spreadVelocity = 0
}
function start() {
  if (!active.value || !(props.duration > 0)) land()
  else if (raf === undefined) raf = requestAnimationFrame(frame)
}
/** A release keeps the variant's tempo: the same frequency, critically damped or, after a flick, ζ ≈ 0.8. */
function releaseSpring(flick: boolean) {
  const omega = Math.sqrt(spring.value.stiffness / spring.value.mass)
  return { stiffness: omega * omega, damping: 2 * (flick ? 0.8 : 1) * omega }
}
/** Pointer travel along the variant's axis: left moves the deck on, and so does down in the time machine. */
function travel(dx: number, dy: number) { return mode.value === 'time-machine' ? dy : -dx }
/** Past the first or last card the deck resists, the more the further it is pulled. Looping does not wrap a drag. */
function follow(raw: number, size: number) {
  const edge = Math.max(0, Math.min(props.items.length - 1, raw))
  return edge + rubberband((raw - edge) * pitch.value, size) / pitch.value
}
function endDrag() {
  const state = drag
  drag = undefined
  dragging.value = false
  window.removeEventListener('keydown', onDragKeydown, true)
  if (state && stage.value?.hasPointerCapture(state.pointerId)) stage.value.releasePointerCapture(state.pointerId)
}
/** Escape, a cancelled pointer or lost capture: the deck springs back to the current card. */
function cancelDrag() {
  const state = drag
  if (!state) return
  endDrag()
  if (!state.moved) return
  suppressClick = true
  release = { target: current.value, spring: releaseSpring(false) }
  start()
}
function onDragKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !drag?.moved) return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}
function pointerDown(event: PointerEvent) {
  if (!props.draggable || props.disabled || drag?.moved || event.button !== 0 || !event.isPrimary) return
  suppressClick = false
  const vertical = mode.value === 'time-machine'
  const el = stage.value
  const bounds = el?.getBoundingClientRect()
  const drawn = (vertical ? bounds?.height : bounds?.width) ?? 0
  // Under CSS zoom or a scaling transform the pointer moves in viewport px, the deck in the stage's own.
  const scale = el ? drawnScale(el, bounds)[vertical ? 'y' : 'x'] : 1
  drag = {
    pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: position.value,
    size: drawn / scale, scale, moved: false, tracker: createVelocityTracker(),
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
    // A touch that sets off along the page's scroll axis is the page's: the browser pans and cancels it anyway.
    if (event.pointerType !== 'mouse' && (mode.value === 'time-machine' ? dx > dy : dy > dx)) { drag = undefined; return }
    // Grabbed in flight, the deck continues from where it is drawn, not from its target.
    state.moved = true
    state.from = position.value
    velocity = 0
    release = undefined
    dragging.value = true
    stage.value?.setPointerCapture(event.pointerId)
    window.addEventListener('keydown', onDragKeydown, true)
  }
  event.preventDefault()
  position.value = follow(state.from + travel(event.clientX - state.x, event.clientY - state.y) / state.scale / pitch.value, state.size)
  // Track the deck rather than the pointer, so a release past an end carries only the speed it is drawn at.
  if (begins) state.tracker.reset(event.timeStamp, position.value * pitch.value)
  else state.tracker.push(event.timeStamp, position.value * pitch.value)
}
function pointerUp(event: PointerEvent) {
  const state = drag
  if (!state || state.pointerId !== event.pointerId) return
  endDrag()
  if (!state.moved) return
  suppressClick = true
  const [speed] = state.tracker.velocity(event.timeStamp)
  // The resting card is chosen where the flick would carry the deck, not where it was let go.
  const target = Math.max(0, Math.min(props.items.length - 1, Math.round(position.value + projectMomentum(speed, DECELERATION) / pitch.value)))
  velocity = speed / pitch.value
  release = { target, spring: releaseSpring(Math.abs(speed) >= FLICK) }
  select(target)
  start()
}
function choose(index: number, event: MouseEvent) {
  // A drag ends in its own selection; the click it leaves behind is not one. Keyboard clicks have no detail.
  if (suppressClick && event.detail > 0) { suppressClick = false; return }
  select(index)
}
function previous() { select(current.value - 1) }
function next() { select(current.value + 1) }
function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); next() }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); previous() }
  else if (event.key === 'Home') { event.preventDefault(); select(0) }
  else if (event.key === 'End') { event.preventDefault(); select(props.items.length - 1) }
}
function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) { focused.value = false; hoverPosition.value = null }
}
// The source's resting poses, blended continuously so the deck can be drawn between cards.
function slideStyle(index: number): CSSProperties {
  const offset = index - position.value
  const distance = Math.abs(offset)
  const near = Math.min(1, distance)
  const r = ratio.value
  let transform: string
  let opacity = 1
  let width: number
  let height: number
  if (mode.value === 'cover-flow') {
    width = 80; height = 80 * 4 / 3
    const depth = distance <= 1 ? 50 - distance * 100 : -distance * 50
    const scale = distance <= 1 ? 1.1 - distance * 0.18 : 1 - distance * 0.08
    transform = `translate(-50%, -50%) translate3d(${offset * 32 * r}px, 0, ${depth * r}px) rotateY(${-Math.sign(offset) * 38 * near}deg) scale(${Math.max(0, scale)})`
    opacity = distance <= 2 ? 1 - distance * 0.25 : Math.max(0, (3 - distance) * 0.5)
  }
  else if (mode.value === 'time-machine') {
    width = 220; height = 135
    // A card before the current one falls towards the viewer and fades.
    const gone = Math.min(1, Math.max(0, -offset))
    transform = offset < 0
      ? `translate(-50%, -50%) translate3d(0, ${300 * gone * r}px, ${200 * gone * r}px) rotateX(${-20 * gone}deg) scale(${1 + 0.3 * gone})`
      : `translate(-50%, -50%) translate3d(0, ${-offset * 12 * r}px, ${-offset * 60 * r}px) rotateX(${offset * 2}deg) scale(1)`
    opacity = offset < 0 ? 1 - gone : Math.max(0, 1 - distance * 0.2)
  }
  else {
    width = 110; height = 110
    const fan = spread.value
    const resting = 0.8 - 0.15 * fan
    transform = `translate(-50%, -50%) translate(${offset * 160 * r}px, ${offset * 24 * fan * r}px) rotate(${offset * (5 + 15 * fan)}deg) scale(${1.05 + (resting - 1.05) * near})`
  }
  return {
    width: `${width * r}px`, height: `${height * r}px`, transform, opacity,
    zIndex: mode.value === 'time-machine' ? props.items.length - index : 1000 - Math.round(distance * 100),
    pointerEvents: opacity <= 0 ? 'none' : undefined,
    filter: mode.value === 'time-machine' ? `url(#${filterId})` : undefined,
  }
}
function nodeStyle(position: number, main: boolean): CSSProperties {
  const near = hoverPosition.value !== null && Math.abs(position - hoverPosition.value) <= 0.5
  const selected = Math.round(position) === current.value
  const scale = hoverPosition.value === null ? 1 : main ? selected ? 1.4 : near ? 1.25 : 1 : near ? 1.15 : 1
  return { transform: `scaleX(${scale})`, opacity: main ? 1 : near ? 0.5 : 0.3, transition: transition.value }
}
function preview(position: number) {
  hoverPosition.value = position
  if (props.timelineHover) select(position)
}
watch(current, (index) => {
  // A caller moving the deck mid-drag wins; the drag is dropped.
  if (drag?.moved) cancelDrag()
  if (release && release.target !== index) release = undefined
  start()
})
watch(expanded, start)
watch(active, (value) => { if (!value) land() })
watch([() => props.items.length, mode, () => props.disabled, () => props.draggable], () => { if (drag) cancelDrag() })
onDeactivated(() => { if (drag) endDrag(); land() })
onBeforeUnmount(() => { if (drag) endDrag(); stop() })
defineExpose({ previous, next, select })
</script>

<template>
  <div ref="root" class="tx-carousel-3d" :class="[`is-${mode}`, { 'is-mono': mono, 'is-draggable': draggable && !disabled, 'is-dragging': dragging }]" :data-variant="variant" role="region" aria-roledescription="carousel" :aria-label="ariaLabel" @pointerenter="hovered = true" @pointerleave="hovered = false; hoverPosition = null" @focusin="focused = true" @focusout="onFocusOut" @keydown="onKeydown">
    <slot v-if="!items.length" name="empty" />
    <template v-else>
      <svg v-if="mode === 'time-machine'" class="tx-carousel-3d__defs" aria-hidden="true"><defs><filter :id="filterId"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6" result="goo" /><feBlend in="SourceGraphic" in2="goo" /></filter></defs></svg>
      <div class="tx-carousel-3d__spatial" :style="{ minHeight: `${240 * ratio}px` }">
        <div ref="stage" class="tx-carousel-3d__stage" :style="{ height: `${220 * ratio}px`, perspective: `${(mode === 'time-machine' ? 800 : 1000) * ratio}px` }" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag?.pointerId === $event.pointerId && cancelDrag()" @lostpointercapture="$event.target === stage && drag?.pointerId === $event.pointerId && cancelDrag()">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-carousel-3d__slide" :class="{ 'is-active': current === index }" :style="slideStyle(index)" :disabled="disabled" :aria-label="item.title || `${itemLabel} ${index + 1}`" :aria-current="current === index ? 'true' : undefined" :tabindex="current === index ? 0 : -1" @click="choose(index, $event)">
            <slot name="item" :item="item" :index="index" :active="current === index">
              <img v-if="item.src && !mono" :src="item.src" :alt="item.alt ?? item.title ?? ''" draggable="false">
              <span v-else class="tx-carousel-3d__content"><span>{{ item.title || `${itemLabel} ${index + 1}` }}</span><small v-if="item.description">{{ item.description }}</small></span>
            </slot>
          </button>
        </div>
        <div v-if="mode === 'time-machine' && timeline" class="tx-carousel-3d__timeline" :aria-label="timelineLabel" @pointerleave="hoverPosition = null">
          <button v-for="node in nodes" :key="node.position" type="button" class="tx-carousel-3d__tick" :class="{ 'is-main': node.main, 'is-selected': node.index === current }" :disabled="disabled" :aria-label="`${timelineLabel}: ${items[node.index]?.date || items[node.index]?.title || `${itemLabel} ${node.index + 1}`}`" :aria-current="node.main && node.index === current ? 'true' : undefined" @pointerenter="preview(node.position)" @focus="preview(node.position)" @click="select(node.position)">
            <span v-if="node.main" class="tx-carousel-3d__date" :style="{ opacity: hoverPosition === node.position ? 1 : 0, transform: hoverPosition === node.position ? 'translateY(0) scale(1)' : 'translateY(-2px) scale(0.8)', transition }">{{ items[node.index]?.date || items[node.index]?.title }}</span>
            <span class="tx-carousel-3d__line" :style="nodeStyle(node.position, node.main)" />
          </button>
          <input class="tx-carousel-3d__scrubber" type="range" min="0" :max="items.length - 1" step="1" :value="current" :disabled="disabled" :aria-label="timelineLabel" @input="select(Number(($event.target as HTMLInputElement).value))">
        </div>
      </div>
      <div class="tx-carousel-3d__caption" aria-live="polite" aria-atomic="true">
<slot name="caption" :item="items[current]!" :index="current" :active="true">
<TxTextMorph :text="items[current]?.title ?? ''" :duration-ms="300" :disabled="!active" />
</slot>
</div>
      <div v-if="controls || dots" class="tx-carousel-3d__controls">
        <button v-if="controls" type="button" :disabled="disabled || (!loop && current === 0)" @click="previous">
{{ previousLabel }}
</button>
        <div v-if="dots" class="tx-carousel-3d__dots">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-carousel-3d__dot" :class="{ 'is-active': current === index }" :disabled="disabled" :aria-label="`${itemLabel} ${index + 1}: ${item.title || ''}`" :aria-current="current === index ? 'true' : undefined" @click="select(index)">
<span :style="{ transition: `width ${active ? 300 : 0}ms ${motion.easing}` }" />
</button>
        </div>
        <button v-if="controls" type="button" :disabled="disabled || (!loop && current === items.length - 1)" @click="next">
{{ nextLabel }}
</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tx-carousel-3d { position: relative; width: 100%; overflow: hidden; border-radius: 16px; background: var(--tx-bg-color); color: var(--tx-text-color-primary); font-size: 13px; padding: 12px 0; }
.tx-carousel-3d__spatial { display: flex; align-items: center; justify-content: center; gap: 12px; }
.tx-carousel-3d__stage { position: relative; flex: 1; min-width: 0; transform-style: preserve-3d; }
/* A horizontal drag moves the deck and a vertical swipe still scrolls the page; the time machine moves vertically. */
.tx-carousel-3d.is-draggable .tx-carousel-3d__stage { cursor: grab; touch-action: pan-y; -webkit-user-select: none; user-select: none; }
.tx-carousel-3d.is-draggable.is-time-machine .tx-carousel-3d__stage { touch-action: pan-x; }
.tx-carousel-3d__slide { position: absolute; left: 50%; top: 50%; padding: 0; border: 0; border-radius: 12px; color: inherit; font: inherit; background: var(--tx-bg-color-overlay, var(--tx-bg-color)); box-shadow: inset 0 0 0 1px var(--tx-border-color), 3px 6px 20px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); cursor: pointer; overflow: hidden; }
.tx-carousel-3d__slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tx-carousel-3d__content { display: flex; height: 100%; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px; }
.tx-carousel-3d__content small { color: var(--tx-text-color-regular); font-size: 12px; }
.tx-carousel-3d.is-draggable .tx-carousel-3d__slide { cursor: grab; }
.tx-carousel-3d.is-dragging .tx-carousel-3d__stage, .tx-carousel-3d.is-dragging .tx-carousel-3d__slide { cursor: grabbing; }
.tx-carousel-3d__slide.is-active { box-shadow: inset 0 0 0 2px var(--tx-color-primary), 3px 6px 20px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); }
.tx-carousel-3d__caption { min-height: 20px; text-align: center; padding: 6px 12px; font-weight: var(--tx-font-weight-medium, 500); }
.tx-carousel-3d__controls, .tx-carousel-3d__dots { display: flex; justify-content: center; align-items: center; gap: 4px; }
.tx-carousel-3d__controls button { padding: 6px 8px; border: 0; border-radius: 8px; color: var(--tx-text-color-regular); background: var(--tx-fill-color-light); font: inherit; cursor: pointer; }
.tx-carousel-3d__controls button:hover { background: var(--tx-fill-color); }
.tx-carousel-3d__controls .tx-carousel-3d__dot { width: 28px; height: 28px; padding: 8px 4px; background: transparent; }
.tx-carousel-3d__dot span { display: block; width: 6px; height: 6px; margin: auto; border-radius: 6px; background: var(--tx-text-color-placeholder); }
.tx-carousel-3d__dot.is-active span { width: 18px; background: var(--tx-color-primary); }
.tx-carousel-3d button:focus-visible, .tx-carousel-3d__scrubber:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-carousel-3d button:disabled { cursor: not-allowed; }
.tx-carousel-3d__timeline { display: flex; flex-direction: column; align-items: stretch; flex: 0 0 112px; padding: 12px 8px 12px 0; }
.tx-carousel-3d__tick { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 12px; padding: 3px 0; border: 0; background: transparent; color: var(--tx-text-color-regular); cursor: pointer; font: inherit; }
.tx-carousel-3d__date { font-size: 12px; white-space: nowrap; }
.tx-carousel-3d__line { display: block; width: 24px; height: 3px; border-radius: 3px; background: var(--tx-text-color-placeholder); transform-origin: right; }
.tx-carousel-3d__tick.is-main.is-selected .tx-carousel-3d__line { background: var(--tx-color-primary); }
.tx-carousel-3d__scrubber { width: 100%; margin-top: 12px; accent-color: var(--tx-color-primary); }
.tx-carousel-3d__defs { position: absolute; width: 0; height: 0; }
@media (max-width: 400px) { .tx-carousel-3d__timeline { flex-basis: 88px; } .tx-carousel-3d__date { max-width: 52px; overflow: hidden; text-overflow: ellipsis; } }
@media (prefers-reduced-motion: reduce) { .tx-carousel-3d__line, .tx-carousel-3d__date, .tx-carousel-3d__dot span { transition: none !important; } }
</style>
