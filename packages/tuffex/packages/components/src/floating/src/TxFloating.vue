<script setup lang="ts">
import type { FloatingProps } from './types'
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { TX_FLOATING_CONTEXT_KEY } from './context'

defineOptions({
  name: 'TxFloating',
})

const props = withDefaults(defineProps<FloatingProps>(), {
  className: '',
  sensitivity: 1,
  easingFactor: 0.05,
  disabled: false,
})

/**
 * Travel below this is invisible even at high DPR. Exponential easing only ever
 * approaches its target, so the last fraction of a pixel is snapped — without
 * that the loop would creep forever and could never be allowed to idle.
 */
const SETTLE_EPSILON = 0.01

const containerRef = ref<HTMLDivElement | null>(null)
const elementsMap = new Map<
  string,
  {
    element: HTMLDivElement
    depth: number
    currentPosition: { x: number; y: number }
  }
>()

const pointerClient = { x: 0, y: 0 }
const pointerOffset = { x: 0, y: 0 }
let pointerTracked = false
let offsetDirty = true
let rafId: number | null = null
let listenersStarted = false
let visible = true
let reducedMotion = false
let visibilityObserver: IntersectionObserver | null = null
let motionQuery: MediaQueryList | null = null

/**
 * Wake the animation loop.
 *
 * The loop is not free-running: it parks itself as soon as every element has
 * reached its target, so only the things that can move a target — pointer
 * input, scroll, resize, registration, prop changes — bring it back.
 */
function requestFrame() {
  if (rafId !== null || !listenersStarted || !visible)
    return
  rafId = requestAnimationFrame(animate)
}

function updatePosition(x: number, y: number) {
  pointerClient.x = x
  pointerClient.y = y
  pointerTracked = true
  offsetDirty = true
  requestFrame()
}

/**
 * Resolve the pointer offset relative to the container centre.
 *
 * Centred so elements swing symmetrically around their layout position instead
 * of drifting one way by a fraction of the container's own size. Recomputed
 * only when something could have moved the pointer or the container, so the
 * easing tail after the pointer stops costs no layout reads at all.
 */
function syncPointerOffset() {
  offsetDirty = false

  if (!pointerTracked) {
    pointerOffset.x = 0
    pointerOffset.y = 0
    return
  }

  const container = containerRef.value
  if (!container) {
    pointerOffset.x = pointerClient.x - window.innerWidth / 2
    pointerOffset.y = pointerClient.y - window.innerHeight / 2
    return
  }

  const rect = container.getBoundingClientRect()
  pointerOffset.x = pointerClient.x - rect.left - rect.width / 2
  pointerOffset.y = pointerClient.y - rect.top - rect.height / 2
}

function handleMouseMove(event: MouseEvent) {
  updatePosition(event.clientX, event.clientY)
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  updatePosition(touch.clientX, touch.clientY)
}

/** Scrolling or resizing moves the container, so its centre has to be re-read. */
function handleViewportChange() {
  offsetDirty = true
  requestFrame()
}

function registerElement(id: string, element: HTMLDivElement, depth: number) {
  const existing = elementsMap.get(id)
  const currentPosition = existing?.currentPosition ?? { x: 0, y: 0 }
  elementsMap.set(id, {
    element,
    depth,
    currentPosition,
  })
  requestFrame()
}

function unregisterElement(id: string) {
  elementsMap.delete(id)
}

function resetPositions() {
  elementsMap.forEach((data) => {
    data.currentPosition.x = 0
    data.currentPosition.y = 0
    data.element.style.transform = 'translate3d(0px, 0px, 0)'
  })
}

/** Advance one frame. Returns true while any element is still travelling. */
function step(): boolean {
  if (!elementsMap.size)
    return false

  if (offsetDirty)
    syncPointerOffset()

  let moving = false

  elementsMap.forEach((data) => {
    const strength = (data.depth * props.sensitivity) / 20
    const targetX = pointerOffset.x * strength
    const targetY = pointerOffset.y * strength

    const dx = targetX - data.currentPosition.x
    const dy = targetY - data.currentPosition.y

    if (Math.abs(dx) < SETTLE_EPSILON && Math.abs(dy) < SETTLE_EPSILON) {
      data.currentPosition.x = targetX
      data.currentPosition.y = targetY
    }
    else {
      data.currentPosition.x += dx * props.easingFactor
      data.currentPosition.y += dy * props.easingFactor
      moving = true
    }

    data.element.style.transform = `translate3d(${data.currentPosition.x}px, ${data.currentPosition.y}px, 0)`
  })

  return moving
}

function animate() {
  rafId = null
  if (step())
    requestFrame()
}

function startListeners() {
  if (!hasWindow() || listenersStarted || props.disabled || reducedMotion)
    return
  listenersStarted = true
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: true })
  window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true })
  window.addEventListener('resize', handleViewportChange, { passive: true })
  offsetDirty = true
  requestFrame()
}

function stopListeners() {
  if (!hasWindow() || !listenersStarted)
    return
  listenersStarted = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('touchmove', handleTouchMove)
  window.removeEventListener('scroll', handleViewportChange, { capture: true })
  window.removeEventListener('resize', handleViewportChange)
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

/** An off-screen container cannot show parallax, so skip its work entirely. */
function setupVisibilityObserver() {
  if (typeof IntersectionObserver === 'undefined' || !containerRef.value)
    return

  visibilityObserver = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (!entry)
      return
    visible = entry.isIntersecting
    if (!visible && rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (visible) {
      offsetDirty = true
      requestFrame()
    }
  })

  visibilityObserver.observe(containerRef.value)
}

function applyMotionPreference(matches: boolean) {
  reducedMotion = matches
  if (matches) {
    stopListeners()
    resetPositions()
    return
  }
  startListeners()
}

function handleMotionPreferenceChange(event: MediaQueryListEvent) {
  applyMotionPreference(event.matches)
}

/** Parallax is exactly the motion `prefers-reduced-motion` asks us to drop. */
function setupMotionPreference() {
  if (!hasWindow() || typeof window.matchMedia !== 'function')
    return
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionQuery.matches
  motionQuery.addEventListener('change', handleMotionPreferenceChange)
}

provide(TX_FLOATING_CONTEXT_KEY, {
  registerElement,
  unregisterElement,
})

watch(() => props.disabled, (disabled) => {
  if (disabled) {
    stopListeners()
    resetPositions()
    return
  }
  startListeners()
})

// Retuning moves every element's target, so ease them over to the new one.
watch(() => [props.sensitivity, props.easingFactor], requestFrame)

onMounted(() => {
  setupMotionPreference()
  setupVisibilityObserver()
  startListeners()
})

onBeforeUnmount(() => {
  stopListeners()
  visibilityObserver?.disconnect()
  visibilityObserver = null
  motionQuery?.removeEventListener('change', handleMotionPreferenceChange)
  motionQuery = null
  elementsMap.clear()
})
</script>

<template>
  <div ref="containerRef" class="tx-floating" :class="props.className">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-floating {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
