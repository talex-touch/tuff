<script setup lang="ts">
import type { TxTransitionPushProps } from './types'
import { nextTick, onBeforeUnmount, ref } from 'vue'

defineOptions({ name: 'TxTransitionPush' })

const props = withDefaults(defineProps<TxTransitionPushProps>(), {
  direction: 'forward',
  duration: 220,
  easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  height: true,
  appear: false,
})

const emit = defineEmits<{
  'before-enter': [el: Element]
  'after-enter': [el: Element]
  'after-leave': [el: Element]
}>()

/** Reduced motion swaps the slide for a crossfade, never longer than this. */
const REDUCED_MOTION_FADE_MS = 120

/** The inline properties a leaving page is pinned with; restored when its leave ends. */
const PIN_PROPERTIES = [
  'position',
  'top',
  'left',
  'width',
  'height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
] as const

/**
 * A page in motion. `from` / `to` are a `translate` offset in percent of the page's own
 * width, or an opacity under reduced motion: kept so a page cut short mid-way can be picked
 * up from where it is drawn.
 */
interface PageMotion {
  animation: Animation
  from: number
  to: number
  fade: boolean
  leaving: boolean
  finished: boolean
}

/** Where a page was drawn when Vue removed it early, for the same-key page replacing it. */
interface Handover {
  value: number
  fade: boolean
}

interface Pin {
  style: Array<[name: string, value: string, priority: string]>
  inert: boolean
}

const rootRef = ref<HTMLElement | null>(null)
const pushing = ref(false)

const motions = new Map<HTMLElement, PageMotion>()
const pins = new WeakMap<HTMLElement, Pin>()
const handovers = new WeakMap<Element, Handover>()
let pendingHandover: Handover | null = null
let heightAnimation: Animation | null = null
/** The container's height when the current switch began: where its FLIP starts. */
let firstHeight: number | null = null

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function canAnimate(el: HTMLElement): boolean {
  return props.duration > 0 && typeof el.animate === 'function'
}

/** `1` when the incoming page enters from the right, `-1` from the left. */
function entrySide(): number {
  const root = rootRef.value
  const rtl = root ? getComputedStyle(root).direction === 'rtl' : false
  return (props.direction === 'back') === rtl ? 1 : -1
}

/**
 * The used size, the way `width` / `height` read it back: unrounded, untouched by
 * transforms, and the current value while a tween runs. Without layout (jsdom) there is no
 * used value, so fall back to the box.
 */
function usedSize(el: HTMLElement, axis: 'width' | 'height'): number {
  const value = Number.parseFloat(getComputedStyle(el)[axis])
  if (!Number.isNaN(value))
    return value
  const box = el.getBoundingClientRect()
  return axis === 'width' ? box.width : box.height
}

function drawnValue(motion: PageMotion): number {
  const progress = motion.animation.effect?.getComputedTiming().progress
  return typeof progress === 'number'
    ? motion.from + (motion.to - motion.from) * progress
    : motion.to
}

function syncPushing(): void {
  pushing.value = motions.size > 0 || heightAnimation !== null
}

function play(page: HTMLElement, from: number, to: number, fade: boolean, leaving: boolean, done: () => void): void {
  motions.get(page)?.animation.cancel()

  const frame = (value: number): Keyframe => fade ? { opacity: value } : { translate: `${value}% 0` }
  const animation = page.animate([frame(from), frame(to)], {
    duration: fade ? Math.min(REDUCED_MOTION_FADE_MS, props.duration) : props.duration,
    easing: props.easing,
    // A finished leave holds its last frame until Vue removes the page; without it the
    // page would flash back in place for the frame in between.
    fill: leaving ? 'forwards' : 'none',
  })
  const motion: PageMotion = { animation, from, to, fade, leaving, finished: false }
  motions.set(page, motion)
  syncPushing()

  animation.onfinish = () => {
    if (motions.get(page) !== motion)
      return
    motion.finished = true
    // A leave stays registered until Vue ends it in `release`, which also drops the fill.
    if (!leaving) {
      motions.delete(page)
      syncPushing()
    }
    done()
  }
}

function stopHeight(): void {
  const running = heightAnimation
  heightAnimation = null
  running?.cancel()
}

/** LAST: the entering page is in flow and the leaving one is pinned out of it. */
function flipHeight(): void {
  const first = firstHeight
  firstHeight = null
  const root = rootRef.value
  if (first === null || !root)
    return

  const last = usedSize(root, 'height')
  if (Math.abs(last - first) < 0.5)
    return

  const animation = root.animate(
    [{ height: `${first}px` }, { height: `${last}px` }],
    { duration: props.duration, easing: props.easing },
  )
  heightAnimation = animation
  syncPushing()
  animation.onfinish = () => {
    if (heightAnimation !== animation)
      return
    heightAnimation = null
    syncPushing()
  }
}

/**
 * Takes a leaving page out of flow where it stands, so the container measures only the
 * page that enters. Its size is pinned too: out of a flex parent it would reflow.
 */
function pin(page: HTMLElement): void {
  const values: Record<(typeof PIN_PROPERTIES)[number], string> = {
    'position': 'absolute',
    'top': `${page.offsetTop}px`,
    'left': `${page.offsetLeft}px`,
    'width': `${usedSize(page, 'width')}px`,
    'height': `${usedSize(page, 'height')}px`,
    'margin-top': '0px',
    'margin-right': '0px',
    'margin-bottom': '0px',
    'margin-left': '0px',
  }
  pins.set(page, {
    style: PIN_PROPERTIES.map(name => [name, page.style.getPropertyValue(name), page.style.getPropertyPriority(name)]),
    inert: page.hasAttribute('inert'),
  })
  for (const name of PIN_PROPERTIES)
    page.style.setProperty(name, values[name])
  // On its way out: no pointer, no Tab stop, nothing for assistive technology to land on.
  page.setAttribute('inert', '')
}

function unpin(page: HTMLElement): void {
  const saved = pins.get(page)
  if (!saved)
    return
  pins.delete(page)
  for (const [name, value, priority] of saved.style) {
    if (value)
      page.style.setProperty(name, value, priority)
    else
      page.style.removeProperty(name)
  }
  if (!saved.inert)
    page.removeAttribute('inert')
}

/** A leave ended: it finished, or Vue cut it short so a page with the same key can come back. */
function release(page: HTMLElement): void {
  const motion = motions.get(page)
  if (motion) {
    // A slide cut short: the page replacing it starts from where this one is drawn, not
    // the far edge. Only Vue's early removal for a same-key page gets here unfinished, and
    // that page's `onBeforeEnter` follows at once; an enter dropped by an instant leave
    // hands nothing over.
    if (motion.leaving && !motion.finished)
      pendingHandover = { value: drawnValue(motion), fade: motion.fade }
    motion.animation.cancel()
    motions.delete(page)
    syncPushing()
  }
  unpin(page)
}

function onBeforeEnter(el: Element): void {
  // `release` has just run for the page this one replaces, if Vue removed it early.
  if (pendingHandover)
    handovers.set(el, pendingHandover)
  pendingHandover = null
  emit('before-enter', el)
}

function onEnter(el: Element, done: () => void): void {
  const page = el as HTMLElement
  const handover = handovers.get(el)
  handovers.delete(el)
  if (!canAnimate(page)) {
    firstHeight = null
    done()
    return
  }

  const fade = prefersReducedMotion()
  const from = handover?.fade === fade ? handover.value : fade ? 0 : entrySide() * 100
  play(page, from, fade ? 1 : 0, fade, false, done)
  flipHeight()
}

function onAfterEnter(el: Element): void {
  emit('after-enter', el)
}

function onBeforeLeave(el: Element): void {
  const page = el as HTMLElement
  const root = rootRef.value
  const animate = canAnimate(page)
  // FIRST, before anything moves: the container as drawn, mid-tween if the last switch is
  // still running.
  if (root && animate && props.height && !prefersReducedMotion() && firstHeight === null)
    firstHeight = usedSize(root, 'height')
  // A running FLIP aims at the page that is leaving now; it never outlives a switch.
  stopHeight()
  if (animate)
    pin(page)
}

function onLeave(el: Element, done: () => void): void {
  const page = el as HTMLElement
  if (!canAnimate(page)) {
    done()
    return
  }

  const fade = prefersReducedMotion()
  // An entering page that leaves again goes from where it is drawn.
  const running = motions.get(page)
  const from = running?.fade === fade ? drawnValue(running) : fade ? 1 : 0
  play(page, from, fade ? 0 : -entrySide() * 100, fade, true, done)
  // Nothing may enter (the slot emptied); land the container once the patch is done.
  void nextTick(flipHeight)
}

function onAfterLeave(el: Element): void {
  release(el as HTMLElement)
  emit('after-leave', el)
}

function onLeaveCancelled(el: Element): void {
  release(el as HTMLElement)
}

onBeforeUnmount(() => {
  for (const motion of motions.values())
    motion.animation.cancel()
  motions.clear()
  stopHeight()
})
</script>

<template>
  <div ref="rootRef" class="tx-transition-push" :class="{ 'is-pushing': pushing }">
    <Transition
      :css="false"
      :appear="appear"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
      @leave-cancelled="onLeaveCancelled"
    >
      <slot />
    </Transition>
  </div>
</template>

<style lang="scss">
.tx-transition-push {
  position: relative;
  // Keeps the pages' margins inside, so the height FLIP measures the box it animates.
  display: flow-root;
}

// Clips the pages sliding past the edges and a leaving page taller than the container.
// Only while moving: at rest a focus ring inside a page must not be cut off. `clip`, not
// `hidden`: a hidden container is still scrolled to reveal a focused element.
.tx-transition-push.is-pushing {
  overflow: clip;
}
</style>
