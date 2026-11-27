<script setup lang="ts">
import type { TxTextProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({
  name: 'TxText',
})

const props = withDefaults(defineProps<TxTextProps>(), {
  overflow: 'end',
  scroll: 'none',
  loopEdge: 'gap',
})

const AUTO_SPEED = 40
const HOVER_SPEED = 48
const HOVER_RETURN_SPEED = 140
const LOOP_SPEED = 40
const LOOP_CLIP_EM = 2
const HOVER_FADE_MS = 160
const HOVER_LEAD_MS = 70
const HOVER_EDGE_FADE_PX = 14
const ELLIPSIS = '…'

const rootRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)

const reducedMotion = ref(false)
const overflowing = ref(false)
const availableWidth = ref(0)
const fullWidth = ref(0)
const travel = ref(0)
const restOffset = ref(0)
const loopDistance = ref(0)
const loopGap = ref(0)
const displayText = ref(props.text)

type HoverPhase = 'idle' | 'entering' | 'scrolling' | 'revealed' | 'leaving' | 'fading-out'
const phase = ref<HoverPhase>('idle')
const hoverOffset = ref(0)

const scrollMode = computed(() => (reducedMotion.value ? 'none' : props.scroll))
const isContinuousTrack = computed(() => scrollMode.value === 'auto' || scrollMode.value === 'loop')
const showHoverTrack = computed(() => scrollMode.value === 'hover' && overflowing.value && phase.value !== 'idle')
const hoverTrackVisible = computed(() =>
  phase.value === 'scrolling' || phase.value === 'revealed' || phase.value === 'leaving',
)
const animated = computed(() => scrollMode.value === 'auto' && overflowing.value)
const looping = computed(() => scrollMode.value === 'loop' && overflowing.value)
const truncating = computed(() => scrollMode.value === 'none' || scrollMode.value === 'hover')

const hoverTarget = computed(() => (props.overflow === 'start' ? 0 : -travel.value))
const loopSeconds = computed(() => Math.max(travel.value / AUTO_SPEED / 0.36, 4))

const cssVars = computed(() => ({
  '--tx-text-travel': `${-travel.value}px`,
  '--tx-text-loop': `${loopSeconds.value}s`,
  '--tx-text-gap': `${loopGap.value}px`,
  '--tx-text-loop-shift': `${-loopDistance.value}px`,
  '--tx-text-loop-duration': `${Math.max(loopDistance.value / LOOP_SPEED, 0.1)}s`,
}))

const hoverViewportStyle = computed(() => {
  const leftFade = Math.min(HOVER_EDGE_FADE_PX, Math.max(0, -hoverOffset.value))
  const rightOverflow = fullWidth.value + hoverOffset.value - availableWidth.value
  const rightFade = Math.min(HOVER_EDGE_FADE_PX, Math.max(0, rightOverflow))
  if (leftFade < 0.5 && rightFade < 0.5)
    return undefined
  const mask = `linear-gradient(to right, transparent 0, black ${leftFade.toFixed(1)}px, black calc(100% - ${rightFade.toFixed(1)}px), transparent 100%)`
  return {
    maskImage: mask,
    WebkitMaskImage: mask,
  }
})

const hoverTrackStyle = computed(() => ({
  transform: `translate3d(${hoverOffset.value.toFixed(2)}px, 0, 0)`,
}))

function measure(content: string): number {
  const el = measureRef.value
  if (!el)
    return 0
  el.textContent = content
  return el.getBoundingClientRect().width
}

function cut(chars: string[], kept: number): string {
  if (props.overflow === 'start')
    return `${ELLIPSIS}${chars.slice(chars.length - kept).join('')}`
  const head = Math.ceil(kept / 2)
  return `${chars.slice(0, head).join('')}${ELLIPSIS}${chars.slice(chars.length - (kept - head)).join('')}`
}

function fit(chars: string[], available: number): string {
  let low = 0
  let high = chars.length - 1
  let best = cut(chars, 0)
  while (low <= high) {
    const mid = (low + high) >> 1
    const candidate = cut(chars, mid)
    if (measure(candidate) <= available) {
      best = candidate
      low = mid + 1
    }
    else {
      high = mid - 1
    }
  }
  return best
}

function loopGapFor(available: number, fontPx: number): number {
  if (props.loopEdge === 'gap')
    return available
  if (props.loopEdge === 'wrap')
    return 0
  return LOOP_CLIP_EM * fontPx
}

function layout() {
  const root = rootRef.value
  if (!root)
    return
  const available = root.clientWidth
  const width = measure(props.text)
  const extra = width - available
  availableWidth.value = available
  fullWidth.value = width
  overflowing.value = extra > 0.5
  travel.value = overflowing.value ? extra : 0
  const fontPx = Number.parseFloat(getComputedStyle(root).fontSize) || 16
  loopGap.value = loopGapFor(available, fontPx)
  loopDistance.value = width + loopGap.value
  const nextDisplay = overflowing.value && truncating.value && props.overflow !== 'end'
    ? fit(Array.from(props.text), available)
    : props.text
  displayText.value = nextDisplay

  // Align the scrolling track's rest offset to the exact subpixel right edge of
  // `displayText` for `overflow="start"`, so shared characters stay pixel-locked
  // while the ellipsis cross-fades out and back in.
  if (overflowing.value && props.overflow === 'start') {
    const restEnd = measure(nextDisplay)
    restOffset.value = Math.min(0, -(width - restEnd))
  }
  else {
    restOffset.value = 0
  }

  if (phase.value === 'idle')
    hoverOffset.value = restOffset.value
}

let rafId: number | undefined
let leadTimer: ReturnType<typeof setTimeout> | undefined
let fadeOutTimer: ReturnType<typeof setTimeout> | undefined
let lastFrameTime = 0

function stopMotion() {
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId)
    rafId = undefined
  }
  if (leadTimer !== undefined) {
    clearTimeout(leadTimer)
    leadTimer = undefined
  }
  if (fadeOutTimer !== undefined) {
    clearTimeout(fadeOutTimer)
    fadeOutTimer = undefined
  }
}

function finishLeave() {
  phase.value = 'fading-out'
  fadeOutTimer = setTimeout(() => {
    fadeOutTimer = undefined
    if (phase.value === 'fading-out') {
      phase.value = 'idle'
      hoverOffset.value = restOffset.value
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    }
  }, HOVER_FADE_MS)
}

function runLinearGlide(destination: number, speedPxPerSec: number, onArrive: () => void) {
  stopMotion()
  const distance = Math.abs(destination - hoverOffset.value)
  if (distance <= 0.25) {
    hoverOffset.value = destination
    onArrive()
    return
  }

  const direction = destination > hoverOffset.value ? 1 : -1
  lastFrameTime = performance.now()

  const step = (now: number) => {
    // Clamp frame delta so a backgrounded tab cannot leap abruptly.
    const dt = Math.min(64, Math.max(0, now - lastFrameTime)) / 1000
    lastFrameTime = now
    const next = hoverOffset.value + direction * speedPxPerSec * dt
    const arrived = direction > 0 ? next >= destination : next <= destination
    if (arrived) {
      hoverOffset.value = destination
      rafId = undefined
      onArrive()
      return
    }
    hoverOffset.value = next
    rafId = requestAnimationFrame(step)
  }

  rafId = requestAnimationFrame(step)
}

function startRevealGlide() {
  runLinearGlide(hoverTarget.value, HOVER_SPEED, () => {
    if (phase.value === 'scrolling')
      phase.value = 'revealed'
  })
}

function onEnter() {
  if (scrollMode.value !== 'hover' || !overflowing.value)
    return
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  stopMotion()

  if (phase.value === 'idle') {
    hoverOffset.value = restOffset.value
    phase.value = 'entering'
    nextTick(() => {
      // One frame at opacity 0 so the browser paints the cross-fade transition
      // before fading the track in and beginning the constant-speed glide.
      rafId = requestAnimationFrame(() => {
        rafId = undefined
        if (phase.value !== 'entering')
          return
        phase.value = 'scrolling'
        leadTimer = setTimeout(() => {
          leadTimer = undefined
          if (phase.value === 'scrolling')
            startRevealGlide()
        }, HOVER_LEAD_MS)
      })
    })
    return
  }

  phase.value = 'scrolling'
  startRevealGlide()
}

function onLeave() {
  if (phase.value === 'idle' || phase.value === 'fading-out')
    return
  stopMotion()

  if (Math.abs(hoverOffset.value - restOffset.value) <= 0.25) {
    hoverOffset.value = restOffset.value
    finishLeave()
    return
  }

  phase.value = 'leaving'
  runLinearGlide(restOffset.value, HOVER_RETURN_SPEED, () => {
    if (phase.value === 'leaving')
      finishLeave()
  })
}

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'touch')
    onEnter()
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'touch')
    onLeave()
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType !== 'touch')
    return
  if (phase.value === 'idle' || phase.value === 'leaving' || phase.value === 'fading-out')
    onEnter()
  else
    onLeave()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && rootRef.value?.contains(event.target))
    return
  onLeave()
}

watch([() => props.text, () => props.overflow, () => props.loopEdge, scrollMode], () => {
  layout()
}, { flush: 'post' })

watch(scrollMode, () => {
  stopMotion()
  phase.value = 'idle'
  hoverOffset.value = restOffset.value
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

let resizeObserver: ResizeObserver | undefined
let motionQuery: MediaQueryList | undefined

function onMotionChange(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)
  if (rootRef.value) {
    resizeObserver = new ResizeObserver(() => layout())
    resizeObserver.observe(rootRef.value)
  }
  layout()
  void document.fonts?.ready.then(() => layout())
})

onBeforeUnmount(() => {
  stopMotion()
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <span
    ref="rootRef"
    class="tx-text"
    :class="[`tx-text--overflow-${overflow}`, `tx-text--scroll-${scrollMode}`, `tx-text--edge-${loopEdge}`, { 'is-overflowing': overflowing }]"
    :title="overflowing ? text : undefined"
    :style="cssVars"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointerup="onPointerUp"
  >
    <span
      v-if="isContinuousTrack"
      class="tx-text__track"
      :class="{ 'is-animated': animated, 'is-looping': looping }"
      aria-hidden="true"
    >
      <template v-if="looping"><span class="tx-text__copy">{{ text }}</span><span class="tx-text__gap" /><span class="tx-text__copy">{{ text }}</span></template>
      <template v-else>{{ text }}</template>
    </span>
    <template v-else>
      <span
        class="tx-text__value"
        :class="{ 'is-faded': hoverTrackVisible }"
        aria-hidden="true"
      >{{ displayText }}</span>
      <span
        v-if="showHoverTrack"
        class="tx-text__viewport"
        :class="{ 'is-visible': hoverTrackVisible }"
        :style="hoverViewportStyle"
        aria-hidden="true"
      >
        <span class="tx-text__track tx-text__track--hover" :style="hoverTrackStyle">{{ text }}</span>
      </span>
    </template>
    <span class="tx-text__sr">{{ text }}</span>
    <span class="tx-text__measure-box" aria-hidden="true">
      <span ref="measureRef" class="tx-text__measure" />
    </span>
  </span>
</template>

<style scoped>
.tx-text {
  position: relative;
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.tx-text__value {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
  opacity: 1;
  transition: opacity 160ms ease;
}

.tx-text--overflow-end .tx-text__value {
  text-overflow: ellipsis;
}

.tx-text__value.is-faded {
  opacity: 0;
}

.tx-text__viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}

.tx-text__viewport.is-visible {
  opacity: 1;
}

.tx-text__track {
  display: inline-block;
  vertical-align: top;
  white-space: pre;
  will-change: transform;
}

.tx-text__track.is-animated {
  animation: tx-text-loop var(--tx-text-loop, 8s) linear infinite;
}

.tx-text__track.is-looping {
  animation: tx-text-marquee var(--tx-text-loop-duration, 8s) linear infinite;
}

.tx-text__copy {
  display: inline;
}

.tx-text__gap {
  display: inline-block;
  width: var(--tx-text-gap, 0px);
}

.tx-text--edge-fade.tx-text--scroll-loop.is-overflowing {
  mask-image: linear-gradient(to right, transparent, black 1em, black calc(100% - 1em), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 1em, black calc(100% - 1em), transparent);
}

.tx-text__measure-box {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

.tx-text__measure {
  white-space: pre;
}

.tx-text__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes tx-text-loop {
  0%,
  14% {
    transform: translate3d(0, 0, 0);
  }

  50%,
  64% {
    transform: translate3d(var(--tx-text-travel, 0px), 0, 0);
  }

  100% {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes tx-text-marquee {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(var(--tx-text-loop-shift, 0px), 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-text__value,
  .tx-text__viewport {
    transition: none;
  }

  .tx-text__track.is-animated,
  .tx-text__track.is-looping {
    animation: none;
  }
}
</style>
