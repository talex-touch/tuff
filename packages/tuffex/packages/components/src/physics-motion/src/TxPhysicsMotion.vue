<script setup lang="ts">
// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { PhysicsMotionEmits, PhysicsMotionProps } from './types'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import PhysicsNode from './PhysicsNode.vue'
import { physicsScenes } from './scenes'
import { PHYSICS_MOTION_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxPhysicsMotion' })
const props = withDefaults(defineProps<PhysicsMotionProps>(), {
  variant: 'anim-card-peel', trigger: 'auto', loop: true, paused: false,
  disabled: false, speed: 1, size: 'md',
})
const emit = defineEmits<PhysicsMotionEmits>()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const captionId = useId()
const { active, reduced } = useMotionActivity(root, () => !props.paused && !props.disabled)
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

onDeactivated(() => {
  pending = !reduced.value && (pending || playing.value)
  cancel()
})
onBeforeUnmount(() => {
  disposed = true
  pending = false
  cancel()
})
defineExpose({ replay: play, reset, playing })
</script>

<template>
  <figure ref="root" class="tx-physics-motion" :class="`tx-physics-motion--${size}`" :data-variant="variant" :data-playing="playing">
    <component
      :is="interactive ? 'button' : 'div'" class="tx-physics-motion__stage"
      :type="interactive ? 'button' : undefined" :disabled="interactive ? disabled : undefined"
      :role="interactive ? undefined : 'img'" :aria-label="ariaLabel ?? (interactive ? labels.replay : scene.source.symbol)"
      :aria-describedby="$slots.default ? captionId : undefined"
      @pointerenter="trigger === 'hover' && play()" @focus="trigger === 'hover' && play()"
      @click="interactive && play()"
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
.tx-physics-motion__canvas { position: absolute; width: 160px; height: 160px; scale: var(--tx-physics-scale); pointer-events: none; }
.tx-physics-motion__caption { max-width: 28ch; line-height: 1.5; text-align: center; }
@media (prefers-reduced-motion: reduce) { .tx-physics-motion__canvas { transition: none; } }
</style>
