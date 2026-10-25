<script setup lang="ts">
// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { VelocityTracker } from '../../../../utils/gesture'
import type { PhysicsMotionEmits, PhysicsMotionProps } from './types'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createVelocityTracker, responseSpring, tether } from '../../../../utils/gesture'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import PhysicsNode from './PhysicsNode.vue'
import { physicsScenes } from './scenes'
import { PHYSICS_MOTION_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxPhysicsMotion' })
const props = withDefaults(defineProps<PhysicsMotionProps>(), {
  variant: 'anim-card-peel', trigger: 'auto', loop: true, paused: false,
  disabled: false, draggable: true, speed: 1, size: 'md',
})
const emit = defineEmits<PhysicsMotionEmits>()
const DRAG_SLOP = 4
// A release faster than this, in px/s, carried momentum: only then may the scene overshoot home.
const FLICK = 100
const LIFT = 1.04
// Thrown, the scene springs home with a response of about a third of a second.
const RESPONSE = 0.35
const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const captionId = useId()
const { active, present, reduced } = useMotionActivity(root, () => !props.paused && !props.disabled)
// The throw answers the user's own drag, so pausing the choreography leaves it on.
const thrown = computed(() => present.value && !reduced.value)
const dragging = ref(false)
/** The scene's offset from home, drawn with `translate` and `scale` over the choreography. */
const body = { x: 0, y: 0, vx: 0, vy: 0, lift: 1, liftVelocity: 0, spring: responseSpring(RESPONSE), pivot: [0, 0] as [number, number] }
let raf: number | undefined
let lastFrame: number | undefined
let suppressClick = false
let drag: {
  pointerId: number
  x: number
  y: number
  moved: boolean
  /** Where the scene was drawn when grabbed, and how far it moves 1:1 before the stage's edge resists. */
  from: [number, number]
  min: [number, number]
  max: [number, number]
  size: [number, number]
  tracker: VelocityTracker
} | undefined
const scene = computed(() => physicsScenes[props.variant])
const labels = computed(() => ({ ...PHYSICS_MOTION_DEFAULT_LABELS, ...props.labels }))
const interactive = computed(() => props.trigger === 'hover' || props.trigger === 'click')
const speed = computed(() => Number.isFinite(props.speed) ? Math.min(5, Math.max(.1, props.speed)) : 1)
const playing = ref(false)
let animations: Animation[] = []
let coveredTimer: ReturnType<typeof setTimeout> | undefined
let cycleTimer: ReturnType<typeof setTimeout> | undefined
let serial = 0
let pending = false
let disposed = false

function cancel(): void {
  serial++
  for (const animation of animations) {
    animation.onfinish = null
    animation.cancel()
  }
  animations = []
  if (coveredTimer !== undefined)
    clearTimeout(coveredTimer)
  coveredTimer = undefined
  if (cycleTimer !== undefined)
    clearTimeout(cycleTimer)
  cycleTimer = undefined
  playing.value = false
}

function scheduleCovered(generation: number, delay: number): void {
  coveredTimer = setTimeout(() => {
    coveredTimer = undefined
    if (generation !== serial || !active.value || disposed)
      return
    emit('covered', props.variant)
  }, delay)
}

function play(): void {
  cancel()
  if (!active.value || !canvas.value || disposed) {
    pending = !reduced.value && !disposed
    return
  }
  pending = false
  // No synthetic animation fallback: the assembled, readable scene stays visible.
  if (typeof canvas.value.animate !== 'function')
    return
  const generation = serial
  const spring = resolveTransition({ stiffness: 300, damping: 20, mass: 1 })
  let lastAnimation: Animation | undefined
  let lastEnd = -1
  for (const motion of scene.value.tracks) {
    const element = canvas.value.querySelector<HTMLElement | SVGElement>(`[data-part="${motion.part}"]`)
    if (!element)
      continue
    const animation = element.animate(motion.frames.map(frame => ({
      ...frame, easing: frame.easing === 'spring' ? spring.easing : frame.easing,
    })), { duration: motion.duration / speed.value, delay: motion.delay / speed.value,
      iterations: props.loop ? Infinity : 1, fill: 'both', easing: 'linear' })
    animations.push(animation)
    if (motion.duration + motion.delay > lastEnd) {
      lastEnd = motion.duration + motion.delay
      lastAnimation = animation
    }
  }
  playing.value = animations.length > 0
  if (!playing.value)
    return
  emit('play', props.variant)
  if (scene.value.coveredAt !== undefined)
    scheduleCovered(generation, scene.value.coveredAt / speed.value)
  if (!props.loop && lastAnimation) {
    lastAnimation.onfinish = () => {
      if (generation !== serial)
        return
      // Dropping the effects reveals every scene's explicit assembled final pose.
      cancel()
      emit('finish', props.variant)
    }
  }
  else if (props.loop) {
    // Upstream useLoopFlg restarts the complete scene at its own cadence. Some
    // individual tracks (gimbal, gears, metronome) have a different duration.
    cycleTimer = setTimeout(() => {
      cycleTimer = undefined
      if (generation === serial && active.value && !disposed)
        play()
    }, scene.value.source.period / speed.value)
  }
}

function reset(): void {
  pending = false
  cancel()
}

function paint(): void {
  const element = canvas.value
  if (!element)
    return
  // Shifted by what the lift moves the grabbed point, so that point stays under the pointer.
  const x = body.x - (body.lift - 1) * body.pivot[0]
  const y = body.y - (body.lift - 1) * body.pivot[1]
  element.style.translate = x || y ? `${x}px ${y}px` : ''
  element.style.scale = body.lift === 1 ? '' : `calc(var(--tx-physics-scale) * ${body.lift})`
}

/** The point on the screen the lift scales about: the scene's transform origin, laid out before any transform. */
function originOf(element: HTMLElement): [number, number] | undefined {
  const parent = element.offsetParent
  if (!(parent instanceof HTMLElement))
    return undefined
  const bounds = parent.getBoundingClientRect()
  const [x = 0, y = 0] = getComputedStyle(element).transformOrigin.split(' ').map(Number.parseFloat)
  return [bounds.left + parent.clientLeft + element.offsetLeft + x, bounds.top + parent.clientTop + element.offsetTop + y]
}

function stopThrow(): void {
  if (raf !== undefined)
    cancelAnimationFrame(raf)
  raf = undefined
  lastFrame = undefined
}

/** The scene straight home. */
function home(): void {
  stopThrow()
  Object.assign(body, { x: 0, y: 0, vx: 0, vy: 0, lift: 1, liftVelocity: 0 })
  paint()
}

function held(): boolean {
  return drag?.moved === true
}

function frame(time: number): void {
  raf = undefined
  const dt = lastFrame === undefined ? 1 / 60 : Math.min(.1, Math.max(0, (time - lastFrame) / 1000))
  lastFrame = time
  if (!held()) {
    const [x, vx] = stepSpring(body.x, body.vx, 0, body.spring, dt)
    const [y, vy] = stepSpring(body.y, body.vy, 0, body.spring, dt)
    Object.assign(body, { x, vx, y, vy })
  }
  const height = held() ? LIFT : 1
  const [lift, liftVelocity] = stepSpring(body.lift, body.liftVelocity, height, responseSpring(RESPONSE), dt)
  const lifted = Math.abs(lift - height) < 1e-3 && Math.abs(liftVelocity) < 1e-2
  body.lift = lifted ? height : lift
  body.liftVelocity = lifted ? 0 : liftVelocity
  if (!held() && Math.hypot(body.x, body.y) < .1 && Math.hypot(body.vx, body.vy) < 1 && body.lift === 1) {
    home()
    return
  }
  paint()
  if (!held() || !lifted)
    raf = requestAnimationFrame(frame)
  else
    lastFrame = undefined
}

function startThrow(): void {
  if (!thrown.value) {
    // Without motion a held scene still follows the pointer; a released one is home at once.
    if (!held()) {
      home()
      return
    }
    stopThrow()
    body.lift = LIFT
    body.liftVelocity = 0
    paint()
    return
  }
  if (raf === undefined)
    raf = requestAnimationFrame(frame)
}

function endDrag(): void {
  const state = drag
  drag = undefined
  dragging.value = false
  window.removeEventListener('keydown', onDragKeydown, true)
  if (state && stage.value?.hasPointerCapture(state.pointerId))
    stage.value.releasePointerCapture(state.pointerId)
}

/** Escape, a cancelled pointer or lost capture: the scene springs home without overshoot. */
function cancelDrag(): void {
  const state = drag
  if (!state)
    return
  endDrag()
  if (!state.moved)
    return
  suppressClick = true
  body.spring = responseSpring(RESPONSE)
  startThrow()
}

function onDragKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !drag?.moved)
    return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}

function pointerDown(event: PointerEvent): void {
  if (!props.draggable || props.disabled || drag?.moved || event.button !== 0 || !event.isPrimary)
    return
  suppressClick = false
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
    from: [0, 0], min: [0, 0], max: [0, 0], size: [0, 0], tracker: createVelocityTracker() }
}

/** How far the drawn scene can move before it meets the stage's edge, read once, at grab time. */
function measure(state: NonNullable<typeof drag>): void {
  const frame = stage.value?.getBoundingClientRect()
  if (!frame || !canvas.value)
    return
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const part of canvas.value.querySelectorAll('*')) {
    const bounds = part.getBoundingClientRect()
    if (!bounds.width && !bounds.height)
      continue
    left = Math.min(left, bounds.left)
    top = Math.min(top, bounds.top)
    right = Math.max(right, bounds.right)
    bottom = Math.max(bottom, bounds.bottom)
  }
  if (!Number.isFinite(left))
    return
  state.min = [Math.min(0, frame.left - left + body.x), Math.min(0, frame.top - top + body.y)]
  state.max = [Math.max(0, frame.right - right + body.x), Math.max(0, frame.bottom - bottom + body.y)]
  state.size = [frame.width, frame.height]
}

function pointerMove(event: PointerEvent): void {
  const state = drag
  if (!state || state.pointerId !== event.pointerId)
    return
  const begins = !state.moved
  if (begins) {
    const dx = Math.abs(event.clientX - state.x)
    const dy = Math.abs(event.clientY - state.y)
    if (Math.hypot(dx, dy) < DRAG_SLOP)
      return
    // A touch that sets off vertically is the page's scroll: the browser pans and cancels it anyway.
    if (event.pointerType !== 'mouse' && dy > dx) {
      drag = undefined
      return
    }
    state.moved = true
    dragging.value = true
    // Caught in flight, the scene continues from where it is drawn, under the new grab.
    const drawnX = body.x - (body.lift - 1) * body.pivot[0]
    const drawnY = body.y - (body.lift - 1) * body.pivot[1]
    const origin = canvas.value && originOf(canvas.value)
    body.pivot = origin ? [(state.x - origin[0] - drawnX) / body.lift, (state.y - origin[1] - drawnY) / body.lift] : [0, 0]
    body.x = drawnX + (body.lift - 1) * body.pivot[0]
    body.y = drawnY + (body.lift - 1) * body.pivot[1]
    state.from = [body.x, body.y]
    body.vx = 0
    body.vy = 0
    measure(state)
    stage.value?.setPointerCapture(event.pointerId)
    window.addEventListener('keydown', onDragKeydown, true)
  }
  event.preventDefault()
  body.x = tether(state.from[0] + event.clientX - state.x, state.min[0], state.max[0], state.size[0])
  body.y = tether(state.from[1] + event.clientY - state.y, state.min[1], state.max[1], state.size[1])
  paint()
  if (begins) {
    state.tracker.reset(event.timeStamp, body.x, body.y)
    startThrow()
  }
  else {
    state.tracker.push(event.timeStamp, body.x, body.y)
  }
}

function pointerUp(event: PointerEvent): void {
  const state = drag
  if (!state || state.pointerId !== event.pointerId)
    return
  endDrag()
  if (!state.moved)
    return
  suppressClick = true
  // There is one place to rest, so nothing to project: the release only hands over its velocity.
  const [vx, vy] = state.tracker.velocity(event.timeStamp)
  Object.assign(body, { vx, vy, spring: responseSpring(RESPONSE, Math.hypot(vx, vy) >= FLICK ? .8 : 1) })
  startThrow()
}

function replay(event: MouseEvent): void {
  // A throw is not a request to replay; keyboard clicks have no detail.
  if (suppressClick && event.detail > 0) {
    suppressClick = false
    return
  }
  play()
}

watch([active, scene, () => props.loop, speed, () => props.trigger, () => props.replayKey], async (values, old) => {
  const requestedReplay = !!old && values[5] !== old[5]
  const wasPlaying = playing.value
  cancel()
  const generation = serial
  await nextTick()
  if (generation !== serial || disposed)
    return
  if (!active.value) {
    pending = !reduced.value && (pending || requestedReplay || wasPlaying)
    return
  }
  if (pending || requestedReplay || wasPlaying || props.trigger === 'auto' || (props.loop && props.trigger !== 'manual'))
    play()
}, { immediate: true, flush: 'post' })

watch(thrown, value => !value && startThrow())
watch([() => props.disabled, () => props.draggable, () => props.variant], () => {
  if (drag)
    endDrag()
  home()
})

onDeactivated(() => {
  pending = !reduced.value && (pending || playing.value)
  cancel()
  if (drag)
    endDrag()
  home()
})
onBeforeUnmount(() => {
  disposed = true
  pending = false
  cancel()
  if (drag)
    endDrag()
  stopThrow()
})
defineExpose({ replay: play, reset, playing })
</script>

<template>
  <figure ref="root" class="tx-physics-motion" :class="[`tx-physics-motion--${size}`, { 'is-draggable': draggable && !disabled, 'is-dragging': dragging }]" :data-variant="variant" :data-playing="playing">
    <component
      :is="interactive ? 'button' : 'div'" ref="stage" class="tx-physics-motion__stage"
      :type="interactive ? 'button' : undefined" :disabled="interactive ? disabled : undefined"
      :role="interactive ? undefined : 'img'" :aria-label="ariaLabel ?? (interactive ? labels.replay : scene.source.symbol)"
      :aria-describedby="$slots.default ? captionId : undefined"
      @pointerenter="trigger === 'hover' && play()" @focus="trigger === 'hover' && play()"
      @click="interactive && replay($event)"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp"
      @pointercancel="drag?.pointerId === $event.pointerId && cancelDrag()"
      @lostpointercapture="$event.target === stage && drag?.pointerId === $event.pointerId && cancelDrag()"
    >
      <div ref="canvas" class="tx-physics-motion__canvas" aria-hidden="true">
        <PhysicsNode v-for="(node, index) in scene.nodes" :key="`${variant}-${node.part ?? index}`" :node="node" :labels="labels" />
      </div>
    </component>
    <figcaption v-if="$slots.default" :id="captionId" class="tx-physics-motion__caption">
<slot />
</figcaption>
  </figure>
</template>

<style scoped>
.tx-physics-motion { --tx-physics-size: 160px; --tx-physics-scale: 1; margin: 0; display: inline-grid; justify-items: center; color: var(--tx-text-color-regular, #606266); font-size: 13px; }
.tx-physics-motion--xs { --tx-physics-size: 96px; --tx-physics-scale: .6; }
.tx-physics-motion--sm { --tx-physics-size: 128px; --tx-physics-scale: .8; }
.tx-physics-motion--lg { --tx-physics-size: 192px; --tx-physics-scale: 1.2; }
.tx-physics-motion__stage { position: relative; display: grid; place-items: center; width: var(--tx-physics-size); height: var(--tx-physics-size); padding: 0; border: 0; background: transparent; color: inherit; font: inherit; border-radius: 12px; overflow: hidden; }
button.tx-physics-motion__stage { cursor: pointer; }
button.tx-physics-motion__stage:disabled { cursor: not-allowed; opacity: .6; }
button.tx-physics-motion__stage:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 2px; }
/* A throw starts sideways on touch: the catalogue is a scrolling grid of these, and a vertical swipe still scrolls it. */
.tx-physics-motion.is-draggable .tx-physics-motion__stage { cursor: grab; touch-action: pan-y; -webkit-user-select: none; user-select: none; }
.tx-physics-motion.is-dragging .tx-physics-motion__stage { cursor: grabbing; }
.tx-physics-motion__canvas { position: absolute; width: 160px; height: 160px; scale: var(--tx-physics-scale); pointer-events: none; }
.tx-physics-motion__caption { max-width: 28ch; line-height: 1.5; text-align: center; }
@media (prefers-reduced-motion: reduce) { .tx-physics-motion__canvas { transition: none; } }
</style>
