<script setup lang="ts">
import type { OrbSize, OrbState, OrbTheme } from './types'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { MODE_DRAWS } from './engine/registry'
import { resolvePreset } from './presets'
import { ORB_STATES } from './types'

defineOptions({ name: 'TxThinkingOrb' })

const props = withDefaults(
  defineProps<{
    /** `'random'` draws a different orb on every mount — one per thought. */
    state?: OrbState | 'random'
    /** Preset geometry size; presets are hand-tuned for 20 and 64 only. */
    size?: OrbSize
    /** Rendered CSS size in px. @default the preset size */
    displaySize?: number
    speed?: number
    paused?: boolean
    theme?: OrbTheme
    /** Accessible label. @default an English label for the state */
    label?: string
  }>(),
  {
    state: 'random',
    size: 20,
    speed: 1,
    paused: false,
    theme: 'auto',
  },
)

const LABELS: Record<OrbState, string> = {
  working: 'Working…',
  searching: 'Searching…',
  solving: 'Solving…',
  listening: 'Listening…',
  connecting: 'Connecting…',
  weaving: 'Weaving…',
  composing: 'Composing…',
  breathing: 'Thinking…',
  shaping: 'Shaping…',
}

// Rolled once per mount, not per render: a thought keeps its orb for its
// whole lifetime; the next thought (a fresh mount) rolls a new one.
const rolled = ORB_STATES[Math.floor(Math.random() * ORB_STATES.length)]!

const resolvedState = computed<OrbState>(() =>
  props.state === 'random' ? rolled : props.state,
)

const ariaLabel = computed(() => props.label ?? LABELS[resolvedState.value])

const cssSize = computed(() => props.displaySize ?? props.size)

const resolvedTheme = useAutoTheme(() => props.theme ?? 'auto')

const canvasRef = ref<HTMLCanvasElement | null>(null)

// --- render loop -----------------------------------------------------------
// Ported from the upstream React wrapper: one shared clock (performance.now)
// keeps every mounted orb in phase; the loop pauses offscreen
// (IntersectionObserver) and on hidden tabs, and reduced-motion users get a
// static representative frame that still follows the live theme.

let raf = 0
let running = false
let io: IntersectionObserver | null = null
let detachVisibility: (() => void) | null = null
let detachMotionQuery: (() => void) | null = null

const reduced = ref(false)

function watchReducedMotion(): void {
  if (!hasWindow() || typeof window.matchMedia !== 'function')
    return
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = mq.matches
  const onChange = (event: MediaQueryListEvent): void => {
    reduced.value = event.matches
  }
  mq.addEventListener('change', onChange)
  detachMotionQuery = () => mq.removeEventListener('change', onChange)
}

function stopLoop(): void {
  running = false
  cancelAnimationFrame(raf)
}

function teardown(): void {
  stopLoop()
  io?.disconnect()
  io = null
  detachVisibility?.()
  detachVisibility = null
}

function setup(): void {
  teardown()

  const canvas = canvasRef.value
  if (!canvas)
    return

  const size = props.size
  const dark = resolvedTheme.value === 'dark'
  const dpr = Math.min(2, (hasWindow() && window.devicePixelRatio) || 1)
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)

  // jsdom and other canvas-less hosts: keep the element, skip the painting.
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const { mode, speed: baseSpeed, opts } = resolvePreset(resolvedState.value, size)
  const draw = MODE_DRAWS[mode]
  const effSpeed = baseSpeed * props.speed

  const frame = (tSec: number): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    draw(ctx, size, tSec, dark, opts)
  }

  // Reduced motion → one static, deterministic frame.
  if (reduced.value) {
    frame(0.6)
    return
  }

  const loop = (): void => {
    frame((performance.now() / 1000) * effSpeed)
    if (running)
      raf = requestAnimationFrame(loop)
  }
  const start = (): void => {
    if (running || props.paused)
      return
    running = true
    raf = requestAnimationFrame(loop)
  }

  // Draw at least one frame even when paused/offscreen.
  frame((performance.now() / 1000) * effSpeed)

  let visible = true
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      if (visible && document.visibilityState !== 'hidden')
        start()
      else stopLoop()
    })
    io.observe(canvas)
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden')
      stopLoop()
    else if (visible)
      start()
  }
  document.addEventListener('visibilitychange', onVisibility)
  detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility)
  if (!io)
    start()
}

onMounted(() => {
  watchReducedMotion()
  setup()
})

watch(
  [resolvedState, () => props.size, resolvedTheme, () => props.speed, () => props.paused, reduced],
  () => setup(),
)

onBeforeUnmount(() => {
  teardown()
  detachMotionQuery?.()
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="tx-thinking-orb"
    role="img"
    :aria-label="ariaLabel"
    :style="{ width: `${cssSize}px`, height: `${cssSize}px` }"
  />
</template>

<style lang="scss">
.tx-thinking-orb {
  display: block;
  flex: none;
}
</style>
