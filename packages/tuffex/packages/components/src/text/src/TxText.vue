<script setup lang="ts">
import type { TxTextProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({
  name: 'TxText',
})

const props = withDefaults(defineProps<TxTextProps>(), {
  overflow: 'end',
  scroll: 'none',
})

const AUTO_SPEED = 40
const HOVER_SPEED = 60
const ELLIPSIS = '…'

const rootRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)

const reducedMotion = ref(false)
const overflowing = ref(false)
const travel = ref(0)
const displayText = ref(props.text)
const phase = ref<'idle' | 'entering' | 'revealed' | 'leaving'>('idle')

const scrollMode = computed(() => (reducedMotion.value ? 'none' : props.scroll))
const showTrack = computed(() => scrollMode.value === 'auto' || phase.value !== 'idle')
const animated = computed(() => scrollMode.value === 'auto' && overflowing.value)

const loopSeconds = computed(() => Math.max(travel.value / AUTO_SPEED / 0.38, 4))
const slideSeconds = computed(() => Math.min(3, Math.max(0.35, travel.value / HOVER_SPEED)))

const cssVars = computed(() => {
  const atStart = props.overflow === 'start'
  return {
    '--tx-text-travel': `${-travel.value}px`,
    '--tx-text-rest': atStart ? `${-travel.value}px` : '0px',
    '--tx-text-target': atStart ? '0px' : `${-travel.value}px`,
    '--tx-text-loop': `${loopSeconds.value}s`,
    '--tx-text-slide': `${slideSeconds.value}s`,
  }
})

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

function layout() {
  const root = rootRef.value
  if (!root)
    return
  const available = root.clientWidth
  const extra = measure(props.text) - available
  overflowing.value = extra > 0.5
  travel.value = overflowing.value ? extra : 0
  displayText.value = overflowing.value && props.overflow !== 'end' && scrollMode.value !== 'auto'
    ? fit(Array.from(props.text), available)
    : props.text
}

let settleTimer: ReturnType<typeof setTimeout> | undefined

function clearSettle() {
  if (settleTimer !== undefined)
    clearTimeout(settleTimer)
  settleTimer = undefined
}

function settle() {
  clearSettle()
  phase.value = 'idle'
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
}

function onEnter() {
  if (scrollMode.value !== 'hover' || !overflowing.value)
    return
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  clearSettle()
  if (phase.value !== 'idle') {
    phase.value = 'revealed'
    return
  }
  phase.value = 'entering'
  nextTick(() => {
    void trackRef.value?.offsetWidth
    if (phase.value === 'entering')
      phase.value = 'revealed'
  })
}

function onLeave() {
  if (phase.value === 'idle')
    return
  phase.value = 'leaving'
  clearSettle()
  settleTimer = setTimeout(settle, slideSeconds.value * 1000 + 120)
}

function onTrackTransitionEnd(event: TransitionEvent) {
  if (event.propertyName === 'transform' && phase.value === 'leaving')
    settle()
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
  if (phase.value === 'idle' || phase.value === 'leaving')
    onEnter()
  else
    onLeave()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && rootRef.value?.contains(event.target))
    return
  onLeave()
}

watch([() => props.text, () => props.overflow, scrollMode], () => {
  layout()
}, { flush: 'post' })

watch(scrollMode, () => {
  clearSettle()
  phase.value = 'idle'
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
  clearSettle()
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <span
    ref="rootRef"
    class="tx-text"
    :class="[`tx-text--overflow-${overflow}`, `tx-text--scroll-${scrollMode}`, { 'is-overflowing': overflowing }]"
    :title="overflowing ? text : undefined"
    :style="cssVars"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointerup="onPointerUp"
  >
    <span
      v-if="showTrack"
      ref="trackRef"
      class="tx-text__track"
      :class="{ 'is-animated': animated, 'is-revealed': phase === 'revealed' }"
      aria-hidden="true"
      @transitionend="onTrackTransitionEnd"
    >{{ text }}</span>
    <span v-else class="tx-text__value" aria-hidden="true">{{ displayText }}</span>
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
  text-overflow: clip;
}

.tx-text--overflow-end {
  text-overflow: ellipsis;
}

.tx-text__track {
  display: inline-block;
  vertical-align: top;
  white-space: pre;
  will-change: transform;
  transform: translate3d(var(--tx-text-rest, 0px), 0, 0);
  transition: transform var(--tx-text-slide, 0.6s) cubic-bezier(0.4, 0, 0.2, 1);
}

.tx-text__track.is-revealed {
  transform: translate3d(var(--tx-text-target, 0px), 0, 0);
}

.tx-text__track.is-animated {
  animation: tx-text-loop var(--tx-text-loop, 8s) ease-in-out infinite;
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
  12% {
    transform: translate3d(0, 0, 0);
  }

  50%,
  62% {
    transform: translate3d(var(--tx-text-travel, 0px), 0, 0);
  }

  100% {
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-text__track,
  .tx-text__track.is-animated {
    animation: none;
    transition: none;
  }
}
</style>
