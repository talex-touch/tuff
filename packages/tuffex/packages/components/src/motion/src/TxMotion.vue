<script setup lang="ts">
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { MotionItem, MotionProps } from './types'
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, triggerRef, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition, springSteps } from '../../liquid/src/spring'
import { useMotionResources, useMousePosition, useScrollProgress } from './composables'
import IconSwap from './IconSwap.vue'

defineOptions({ name: 'TxMotion' })
const props = withDefaults(defineProps<MotionProps>(), {
  variant: 'fade-in', enabled: true, disabled: false, delay: 0, initialBlur: 12,
  maxTilt: 15, range: 45, strength: .35, cursorSize: 8, cursorCount: 6, global: false,
  progressHeight: 4, stickyTop: 20, once: true, stateKey: 0,
  glowColor: 'var(--tx-color-primary)', items: () => [],
})
const emit = defineEmits<{
  complete: []
  progress: [value: number]
  'active-change': [index: number]
  select: [item: MotionItem, index: number]
  'visible-change': [value: boolean]
}>()
const root = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
const activity = useMotionActivity(root, () => props.enabled && !props.disabled)
const cursorVariant = computed(() => props.variant === 'cursor-trail' || props.variant === 'mouse-follow')
const pointerVariant = computed(() => cursorVariant.value || ['tilt-card', 'magnetic-button', 'glow-button', 'spotlight'].includes(props.variant))
const pointer = useMousePosition(root, () => activity.active.value && pointerVariant.value, () => props.global && cursorVariant.value)
const scroll = useScrollProgress(() => props.scrollContainer, () => props.enabled && !props.disabled && ['progress-indicator', 'sticky-reveal'].includes(props.variant) && (activity.active.value || activity.reduced.value && activity.visible.value), () => props.variant === 'sticky-reveal' ? root.value : undefined)
const activeIndex = computed(() => Math.min(Math.max(0, props.items.length - 1), Math.floor(scroll.value * props.items.length)))
watch(scroll, value => { if (props.variant === 'progress-indicator' || props.variant === 'sticky-reveal') emit('progress', value) })
watch(activeIndex, value => { if (props.variant === 'sticky-reveal') emit('active-change', value) })
const scrollViewportHeight = ref(0)
useMotionResources(() => props.variant === 'sticky-reveal' && activity.present.value, () => {
  const container = props.scrollContainer
  const measure = () => { scrollViewportHeight.value = container?.clientHeight ?? window.innerHeight }
  measure()
  if (container && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }
  window.addEventListener('resize', measure)
  return () => window.removeEventListener('resize', measure)
}, () => props.scrollContainer)
const tag = computed(() => props.as ?? (props.variant === 'magnetic-button' || props.variant === 'glow-button' ? 'button' : 'div'))
const rootStyle = computed<CSSProperties>(() => ({
  '--tx-motion-color': props.glowColor,
  '--tx-motion-sticky-top': `${props.stickyTop}px`,
  '--tx-motion-progress-height': `${props.progressHeight}px`,
  '--tx-motion-step-height': scrollViewportHeight.value > 0 ? `${scrollViewportHeight.value * .5}px` : '50vh',
  '--tx-motion-visual-height': scrollViewportHeight.value > 0 ? `${Math.max(0, Math.min(scrollViewportHeight.value - Math.max(0, props.stickyTop), Math.max(120, scrollViewportHeight.value * .4)))}px` : '40vh',
  minHeight: props.variant === 'progress-indicator' && props.global ? `${props.progressHeight}px` : undefined,
  transform: props.variant === 'magnetic-button' ? `translate(${pose.value.x}px, ${pose.value.y}px)` : undefined,
  '--tx-motion-ease': resolveTransition(props.transition ?? 'smooth', activity.reduced.value).easing,
  '--tx-motion-duration': `${resolveTransition(props.transition ?? 'smooth', activity.reduced.value).duration}ms`,
}))
const glowStyle = computed<CSSProperties>(() => ({
  opacity: pointer.value.inside && activity.active.value ? 1 : 0,
  backgroundImage: `radial-gradient(${props.glowSize ?? (props.variant === 'glow-button' ? 120 : 250)}px circle at ${pointer.value.elementX}px ${pointer.value.elementY}px, color-mix(in srgb, ${props.glowColor} 18%, transparent), transparent 80%)`,
}))
const observed = ref(false)
const entered = ref(false)
const renderContent = computed(() => props.variant !== 'in-view' || !props.enabled || observed.value || props.once && entered.value)
useMotionResources(() => !!root.value && props.enabled && ['in-view', 'scroll-reveal'].includes(props.variant), () => {
  if (typeof IntersectionObserver === 'undefined') { observed.value = true; entered.value = true; return () => {} }
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry) return
    observed.value = entry.isIntersecting
    if (observed.value) entered.value = true
    emit('visible-change', observed.value)
  }, { root: props.scrollContainer ?? null, rootMargin: props.rootMargin ?? (props.variant === 'in-view' ? '200px' : '-15%') })
  observer.observe(root.value!)
  return () => observer.disconnect()
}, () => [props.variant, props.scrollContainer, props.rootMargin])
let entrance: Animation | undefined
let played = false
function cancelEntrance() { entrance?.cancel(); entrance = undefined }
function playEntrance() {
  const element = surface.value
  if (!element || !activity.active.value || !element.animate) return
  cancelEntrance()
  const variant = props.variant
  const defaults: Record<string, number> = { 'fade-in': 500, 'scale-in': 500, 'zoom-in': 700 }
  const duration = props.duration ?? defaults[variant] ?? 600
  const x = props.xOffset ?? (variant === 'slide-left' ? 40 : variant === 'slide-right' ? -40 : 0)
  const y = props.yOffset ?? (variant === 'fade-up' ? 20 : variant === 'fade-down' ? -20 : variant === 'scroll-reveal' ? 30 : 0)
  const scale = props.initialScale ?? (variant === 'scale-in' ? .92 : variant === 'zoom-in' ? .85 : variant === 'scroll-reveal' ? .95 : 1)
  const easing = variant === 'fade-in' ? 'cubic-bezier(.215,.61,.355,1)' : variant === 'scale-in' ? 'cubic-bezier(.34,1.56,.64,1)' : 'cubic-bezier(.16,1,.3,1)'
  entrance = element.animate([
    { opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})`, filter: `blur(${variant === 'zoom-in' ? props.initialBlur : 0}px)` },
    { opacity: 1, transform: 'translate(0, 0) scale(1)', filter: 'blur(0px)' },
  ], { ...resolveTransition(props.transition ?? { duration, ease: easing }), delay: props.delay, fill: 'both' })
  played = true
  entrance.onfinish = () => { cancelEntrance(); emit('complete') }
}
const isEntrance = computed(() => ['fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'scale-in', 'zoom-in', 'scroll-reveal'].includes(props.variant))
watch(() => props.variant, () => { observed.value = false; entered.value = false })
watch(() => [activity.active.value, observed.value, props.variant, props.stateKey] as const, (values, old) => {
  if (old && (values[2] !== old[2] || values[3] !== old[3])) { cancelEntrance(); played = false }
  if (!activity.active.value) { cancelEntrance(); if (!props.once) played = false; return }
  if (isEntrance.value && (!played || !props.once) && (props.variant !== 'scroll-reveal' || observed.value)) playEntrance()
}, { flush: 'post' })

interface Point { x: number; y: number; vx: number; vy: number }
const positions = shallowRef<Point[]>([])
const pose = shallowRef({ x: 0, y: 0 })
const smoothedProgress = ref(0)
const cursorLength = computed(() => Math.min(64, Math.max(1, Math.floor(props.cursorCount))))
const pointerSpring = computed(() => props.spring ?? (props.variant === 'tilt-card' ? { stiffness: 200, damping: 20, mass: .5 } : props.variant === 'magnetic-button' ? { stiffness: 150, damping: 15, mass: .6 } : { stiffness: 180, damping: 20 }))
const progressSpring = computed(() => props.spring ?? { stiffness: 100, damping: 30 })
const trailSprings = computed(() => Array.from({ length: cursorLength.value }, (_, index) => props.spring ?? { stiffness: Math.max(30, 300 - index * 30), damping: 25 + index * 2, mass: .2 + index * .1 }))
let point: Point = { x: 0, y: 0, vx: 0, vy: 0 }
let progressVelocity = 0
let frame: number | undefined
let lastTime = 0
function stopFrame() { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; lastTime = 0 }
function requestFrame() { if (activity.active.value && (cursorVariant.value || props.variant === 'tilt-card' || props.variant === 'magnetic-button' || props.variant === 'progress-indicator') && frame === undefined) frame = requestAnimationFrame(tick) }
function tick(time: number) {
  frame = undefined
  if (!activity.active.value) return
  const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 1 / 60
  lastTime = time
  if (props.variant === 'progress-indicator') {
    ;[smoothedProgress.value, progressVelocity] = springSteps(smoothedProgress.value, progressVelocity, scroll.value, progressSpring.value, dt)
    if (Math.abs(smoothedProgress.value - scroll.value) + Math.abs(progressVelocity) > .001) requestFrame()
    else lastTime = 0
    return
  }
  const p = pointer.value
  let tx = 0; let ty = 0
  if (props.variant === 'tilt-card' && p.inside) {
    tx = -(p.elementY / Math.max(1, p.height) - .5) * props.maxTilt * 2
    ty = (p.elementX / Math.max(1, p.width) - .5) * props.maxTilt * 2
  }
  else if (props.variant === 'magnetic-button' && p.inside) {
    const dx = p.elementX - p.width / 2; const dy = p.elementY - p.height / 2
    if (Math.hypot(dx, dy) < props.range) { tx = dx * props.strength; ty = dy * props.strength }
  }
  else if (cursorVariant.value && p.inside) { tx = props.global ? p.x : p.elementX; ty = props.global ? p.y : p.elementY }
  let moving = false
  if (props.variant !== 'cursor-trail') {
    ;[point.x, point.vx] = springSteps(point.x, point.vx, tx, pointerSpring.value, dt)
    ;[point.y, point.vy] = springSteps(point.y, point.vy, ty, pointerSpring.value, dt)
    pose.value.x = point.x; pose.value.y = point.y; triggerRef(pose)
    moving = Math.abs(point.x - tx) + Math.abs(point.y - ty) + Math.abs(point.vx) + Math.abs(point.vy) > .1
  }
  if (props.variant === 'cursor-trail') {
    const current = positions.value
    current.length = cursorLength.value
    for (let index = 0; index < cursorLength.value; index++) {
      const dot = current[index] ?? { x: tx, y: ty, vx: 0, vy: 0 }
      ;[dot.x, dot.vx] = springSteps(dot.x, dot.vx, tx, trailSprings.value[index]!, dt)
      ;[dot.y, dot.vy] = springSteps(dot.y, dot.vy, ty, trailSprings.value[index]!, dt)
      current[index] = dot
      moving = moving || Math.abs(dot.x - tx) + Math.abs(dot.y - ty) + Math.abs(dot.vx) + Math.abs(dot.vy) > .1
    }
    triggerRef(positions)
  }
  if (moving) requestFrame()
  else lastTime = 0
}
watch(pointer, requestFrame)
watch(() => [props.variant, props.maxTilt, props.range, props.strength, props.spring, props.cursorCount, props.global], requestFrame, { deep: true })
watch(scroll, () => { if (activity.reduced.value) smoothedProgress.value = scroll.value; else if (props.variant === 'progress-indicator') requestFrame() })
watch(() => activity.active.value, (active) => {
  if (active) requestFrame()
  else { stopFrame(); point = { x: 0, y: 0, vx: 0, vy: 0 }; progressVelocity = 0; pose.value = { x: 0, y: 0 }; positions.value = []; smoothedProgress.value = scroll.value }
})
const surfaceStyle = computed<CSSProperties>(() => props.variant === 'tilt-card'
  ? { transform: `rotateX(${pose.value.x}deg) rotateY(${pose.value.y}deg)`, transformStyle: 'preserve-3d' }
  : {})
function cursorStyle(index: number): CSSProperties {
  const dot = props.variant === 'mouse-follow' ? pose.value : positions.value[index] ?? pose.value
  const ratio = props.variant === 'mouse-follow' ? 1 : 1 - index / Math.max(1, positions.value.length)
  return { transform: `translate(${dot.x}px, ${dot.y}px) translate(-50%, -50%)`, width: `${props.cursorSize * ratio}px`, height: `${props.cursorSize * ratio}px`, opacity: ratio }
}
const highlighted = ref<number | null>(null)
const highlight = shallowRef<CSSProperties>({ opacity: 0 })
function hoverItem(index: number, event: Event) {
  if (!props.enabled || props.disabled || props.items[index]?.disabled) return
  highlighted.value = index
  const item = event.currentTarget as HTMLElement
  highlight.value = { opacity: 1, transform: `translate(${item.offsetLeft}px, ${item.offsetTop}px)`, width: `${item.offsetWidth}px`, height: `${item.offsetHeight}px` }
}
function leaveItem() { highlighted.value = null; highlight.value = { ...highlight.value, opacity: 0 } }
function dispose() { stopFrame(); cancelEntrance() }
onDeactivated(dispose)
onBeforeUnmount(dispose)
defineExpose({ replay: () => { played = false; if (isEntrance.value) playEntrance() }, progress: scroll, activeIndex })
</script>

<template>
  <component :is="tag" ref="root" class="tx-motion" :class="[`tx-motion--${variant}`, { 'is-reduced': activity.reduced.value, 'is-active': activity.active.value }]" :style="rootStyle" :type="tag === 'button' ? 'button' : undefined" :disabled="tag === 'button' ? disabled : undefined" :aria-label="label">
    <div v-if="variant === 'card-hover'" class="tx-motion__cards" @pointerleave="leaveItem">
      <span aria-hidden="true" class="tx-motion__card-highlight" :style="highlight" />
      <component :is="item.href ? 'a' : 'button'" v-for="(item, index) in items" :key="item.id" class="tx-motion__card" :class="{ 'is-highlighted': highlighted === index }" :href="item.href" :type="item.href ? undefined : 'button'" :disabled="item.href ? undefined : disabled || item.disabled" :aria-disabled="disabled || item.disabled || undefined" :tabindex="item.href && (disabled || item.disabled) ? -1 : undefined" @pointerenter="hoverItem(index, $event)" @focus="hoverItem(index, $event)" @blur="leaveItem" @click="disabled || item.disabled ? $event.preventDefault() : emit('select', item, index)">
        <slot name="item" :item="item" :index="index" :active="highlighted === index">
<strong>{{ item.title }}</strong><span v-if="item.description">{{ item.description }}</span>
</slot>
      </component>
    </div>
    <div v-else-if="variant === 'sticky-reveal'" class="tx-motion__sticky">
      <div class="tx-motion__steps">
        <section v-for="(item, index) in items" :key="item.id" class="tx-motion__step" :class="{ 'is-current': activeIndex === index }">
          <slot name="item" :item="item" :index="index" :active="activeIndex === index">
<h3>{{ item.title }}</h3><p v-if="item.description">
{{ item.description }}
</p>
</slot>
        </section>
      </div>
      <div class="tx-motion__sticky-visual">
        <div v-for="(item, index) in items" :key="item.id" class="tx-motion__visual" :class="{ 'is-current': activeIndex === index }" :aria-hidden="activeIndex !== index" :inert="activeIndex !== index || undefined">
<slot name="visual" :item="item" :index="index" :active="activeIndex === index">
{{ item.title }}
</slot>
</div>
      </div>
    </div>
    <Teleport v-else-if="variant === 'progress-indicator'" to="body" :disabled="!global">
<div class="tx-motion__progress" :class="{ 'tx-motion__progress--global': global }" :style="rootStyle" role="progressbar" :aria-label="label" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="Math.round(scroll * 100)">
<span :style="{ transform: `scaleX(${smoothedProgress})` }" />
</div>
</Teleport>
    <IconSwap v-else-if="variant === 'icon-swap'" :state-key="stateKey" :enabled="enabled" :duration="duration">
<slot />
</IconSwap>
    <span v-else ref="surface" class="tx-motion__surface" :style="surfaceStyle">
      <span v-if="variant === 'spotlight' || variant === 'glow-button'" aria-hidden="true" class="tx-motion__glow" :style="glowStyle" />
      <span v-if="renderContent" class="tx-motion__content"><slot :pointer="pointer" :progress="scroll" :active="activity.active.value" /></span>
    </span>
    <Teleport v-if="cursorVariant && global" to="body">
      <div v-if="pointer.inside && activity.active.value" aria-hidden="true" class="tx-motion__cursor-layer tx-motion__cursor-layer--global" :style="rootStyle">
        <span v-for="(_, index) in variant === 'mouse-follow' ? 1 : positions.length" :key="index" class="tx-motion__cursor" :class="{ 'tx-motion__cursor--follow': variant === 'mouse-follow' }" :style="cursorStyle(index)"><slot v-if="variant === 'mouse-follow'" name="cursor" /></span>
      </div>
    </Teleport>
    <div v-else-if="cursorVariant && pointer.inside && activity.active.value" aria-hidden="true" class="tx-motion__cursor-layer">
      <span v-for="(_, index) in variant === 'mouse-follow' ? 1 : positions.length" :key="index" class="tx-motion__cursor" :class="{ 'tx-motion__cursor--follow': variant === 'mouse-follow' }" :style="cursorStyle(index)"><slot v-if="variant === 'mouse-follow'" name="cursor" /></span>
    </div>
  </component>
</template>

<style scoped>
.tx-motion { position: relative; display: block; font-size: 14px; color: var(--tx-text-color-primary); }
.tx-motion__surface, .tx-motion__content { display: block; position: relative; }
.tx-motion__content { z-index: 1; }
.tx-motion--tilt-card { perspective: 800px; }
.tx-motion--tilt-card .tx-motion__content { transform: translateZ(40px); }
.tx-motion--magnetic-button, .tx-motion--glow-button { appearance: none; border: 0; padding: 0; background: var(--tx-fill-color-light); color: var(--tx-text-color-primary); border-radius: 12px; cursor: pointer; }
.tx-motion--magnetic-button .tx-motion__surface, .tx-motion--glow-button .tx-motion__surface { padding: 10px 18px; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.tx-motion--magnetic-button:disabled, .tx-motion--glow-button:disabled { opacity: .5; cursor: not-allowed; }
.tx-motion__progress--global { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; }
.tx-motion--glow-button .tx-motion__surface, .tx-motion--spotlight .tx-motion__surface { overflow: hidden; border-radius: inherit; }
.tx-motion__glow { position: absolute; inset: 0; pointer-events: none; transition: opacity 300ms; }
.tx-motion__cursor-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; }
.tx-motion__cursor-layer--global { position: fixed; z-index: 9999; }
.tx-motion__cursor { position: absolute; top: 0; left: 0; border-radius: 50%; background: var(--tx-motion-color, var(--tx-color-primary)); pointer-events: none; }
.tx-motion__cursor--follow { width: auto !important; height: auto !important; min-width: 24px; min-height: 24px; background: color-mix(in srgb, var(--tx-motion-color, var(--tx-color-primary)) 10%, transparent); box-shadow: inset 0 0 0 1px var(--tx-motion-color, var(--tx-color-primary)); }
.tx-motion__cards { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 12px; }
.tx-motion__card { position: relative; display: flex; flex-direction: column; gap: 6px; appearance: none; border: 0; background: var(--tx-bg-color); color: var(--tx-text-color-primary); padding: 18px; margin: 6px; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); text-decoration: none; text-align: start; font: inherit; cursor: pointer; }
.tx-motion__card strong { font-weight: 600; }
.tx-motion__card span { color: var(--tx-text-color-regular); font-size: 13px; }
.tx-motion__card-highlight { position: absolute; top: -6px; left: -6px; padding: 6px; box-sizing: content-box; background: var(--tx-fill-color); border-radius: 18px; transition: transform var(--tx-motion-duration) var(--tx-motion-ease), width var(--tx-motion-duration) var(--tx-motion-ease), height var(--tx-motion-duration) var(--tx-motion-ease), opacity 150ms; }
.tx-motion__progress { width: 100%; height: var(--tx-motion-progress-height); background: var(--tx-fill-color); overflow: hidden; }
.tx-motion__progress span { display: block; height: 100%; background: var(--tx-motion-color); transform-origin: left; }
.tx-motion__sticky { display: flex; gap: 32px; align-items: flex-start; }
.tx-motion__steps, .tx-motion__sticky-visual { width: calc(50% - 16px); }
.tx-motion__step { min-height: var(--tx-motion-step-height, 50vh); display: flex; flex-direction: column; justify-content: center; opacity: .3; transition: opacity 400ms; }
.tx-motion__step.is-current { opacity: 1; }
.tx-motion__step h3 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
.tx-motion__step p { color: var(--tx-text-color-regular); margin: 0; font-size: 14px; }
.tx-motion__sticky-visual { position: sticky; top: var(--tx-motion-sticky-top); height: var(--tx-motion-visual-height, 40vh); min-height: min(120px, var(--tx-motion-visual-height, 40vh)); border-radius: 12px; background: var(--tx-fill-color-light); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.tx-motion__visual { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; opacity: 0; transform: scale(.9); transition: opacity 400ms, transform 400ms; }
.tx-motion__visual.is-current { opacity: 1; transform: scale(1); }
.tx-motion :focus-visible, .tx-motion:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-motion.is-reduced *, .tx-motion:not(.is-active) * { transition: none; }
@media (prefers-reduced-motion: reduce) { .tx-motion * { transition: none; } }
@media (max-width: 600px) { .tx-motion__sticky { gap: 16px; } .tx-motion__steps, .tx-motion__sticky-visual { width: calc(50% - 8px); } }
</style>
