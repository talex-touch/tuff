<script setup lang="ts">
import type { MatrixLoaderProps, MatrixLoaderState } from './types'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { renderMatrixLoaderFrame, resolveInkRgb } from './engine/renderer'
import { MATRIX_LOADER_DEFAULT_LABELS, MATRIX_LOADER_SIZE_PX } from './types'

defineOptions({ name: 'TxMatrixLoader' })

const props = withDefaults(defineProps<MatrixLoaderProps>(), {
  state: 'thinking',
  size: 'md',
  era: 'oled',
  shape: 'quad',
  gridSize: 5,
  bulge: 1,
  taper: 1,
  fill: 1,
  speed: 1,
  intensity: 1,
  noise: 0,
  noiseFrequency: 1.4,
  fxStrength: 0.65,
  theme: 'auto',
  transitionDuration: 220,
  paused: false,
  showLabel: false,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const resolvedTheme = useAutoTheme(() => props.theme ?? 'auto')

const pixelSize = computed(() => {
  if (typeof props.displaySize === 'number' && Number.isFinite(props.displaySize) && props.displaySize > 0)
    return Math.round(props.displaySize)
  return MATRIX_LOADER_SIZE_PX[props.size] ?? MATRIX_LOADER_SIZE_PX.md
})

const effectiveSpeed = computed(() =>
  Number.isFinite(props.speed) && props.speed > 0 ? props.speed : 1,
)

const statusLabel = computed(() =>
  props.label ?? props.labels?.[props.state] ?? MATRIX_LOADER_DEFAULT_LABELS[props.state],
)

const reduced = ref(false)
let raf = 0
let running = false
let io: IntersectionObserver | null = null
let detachVisibility: (() => void) | null = null
let detachMotionQuery: (() => void) | null = null
let offscreen: HTMLCanvasElement | null = null

let prevState: MatrixLoaderState | undefined
let morphStartMs = 0

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

function getOffscreen(): HTMLCanvasElement | null {
  if (typeof document === 'undefined')
    return null
  if (!offscreen)
    offscreen = document.createElement('canvas')
  return offscreen
}

function renderFrame(explicitSec?: number): void {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const size = pixelSize.value
  const dpr = Math.min(2, (hasWindow() && window.devicePixelRatio) || 1)
  const targetW = Math.round(size * dpr)
  const targetH = Math.round(size * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  const dark = resolvedTheme.value === 'dark'
  const inkRgb = resolveInkRgb(props.color, dark)
  const nowMs = typeof performance !== 'undefined' ? performance.now() : 0
  const tSec = typeof explicitSec === 'number' && Number.isFinite(explicitSec)
    ? explicitSec
    : (nowMs / 1000) * effectiveSpeed.value

  const dur = Math.max(0, props.transitionDuration)
  let morphMix = 1
  if (prevState && prevState !== props.state && dur > 0 && !reduced.value && props.time === undefined) {
    morphMix = Math.min(1, (nowMs - morphStartMs) / dur)
    if (morphMix >= 1)
      prevState = undefined
  }
  else {
    prevState = undefined
  }

  renderMatrixLoaderFrame(
    ctx,
    canvas,
    size,
    dpr,
    tSec,
    {
      state: props.state,
      era: props.era,
      shape: props.shape,
      gridSize: props.gridSize,
      bulge: props.bulge,
      taper: props.taper,
      fill: props.fill,
      intensity: props.intensity,
      noise: props.noise,
      noiseFrequency: props.noiseFrequency,
      fxStrength: props.fxStrength,
      dark,
      inkRgb,
      prevState,
      morphMix,
    },
    props.era === 'dither' || props.era === 'lcd' ? getOffscreen() : null,
  )
}

function setup(): void {
  teardown()

  const canvas = canvasRef.value
  if (!canvas)
    return

  // Deterministic timestamp override (testing / frame capture)
  if (typeof props.time === 'number' && Number.isFinite(props.time)) {
    renderFrame(props.time * effectiveSpeed.value)
    return
  }

  // Reduced motion: paint one clean representative frame and stop.
  if (reduced.value) {
    renderFrame(1.0)
    return
  }

  const loop = (): void => {
    renderFrame()
    if (running)
      raf = requestAnimationFrame(loop)
  }

  const start = (): void => {
    if (running || props.paused)
      return
    running = true
    raf = requestAnimationFrame(loop)
  }

  // Paint immediately even when paused or before IO fires.
  renderFrame()

  let visible = true
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      if (visible && document.visibilityState !== 'hidden')
        start()
      else
        stopLoop()
    })
    io.observe(canvas)
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden')
      stopLoop()
    else if (visible)
      start()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility)
  }
  if (!io)
    start()
}

watch(
  () => props.state,
  (next, prev) => {
    if (prev && next !== prev && props.transitionDuration > 0 && !reduced.value && props.time === undefined) {
      prevState = prev
      morphStartMs = typeof performance !== 'undefined' ? performance.now() : 0
    }
  },
)

watch(
  [
    () => props.state,
    pixelSize,
    () => props.era,
    () => props.shape,
    () => props.gridSize,
    () => props.bulge,
    () => props.taper,
    () => props.fill,
    effectiveSpeed,
    () => props.intensity,
    () => props.noise,
    () => props.noiseFrequency,
    () => props.fxStrength,
    () => props.color,
    () => props.paused,
    () => props.time,
    resolvedTheme,
    reduced,
  ],
  () => setup(),
)

onMounted(() => {
  watchReducedMotion()
  setup()
})

onBeforeUnmount(() => {
  teardown()
  detachMotionQuery?.()
})

defineExpose({
  renderFrame,
})
</script>

<template>
  <span
    class="tx-matrix-loader"
    :class="`tx-matrix-loader--${size}`"
    :data-state="state"
    :data-era="era"
    role="status"
    aria-live="polite"
    :aria-label="statusLabel"
  >
    <canvas
      ref="canvasRef"
      class="tx-matrix-loader__canvas"
      aria-hidden="true"
      :style="{ width: `${pixelSize}px`, height: `${pixelSize}px` }"
    />
    <span
      class="tx-matrix-loader__label"
      :class="{ 'tx-matrix-loader__label--sr': !showLabel }"
    >
      {{ statusLabel }}
    </span>
  </span>
</template>

<style lang="scss">
.tx-matrix-loader {
  --tx-matrix-loader-gap: 6px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--tx-matrix-loader-gap);
  vertical-align: middle;

  &--xs { --tx-matrix-loader-gap: 4px; }
  &--sm { --tx-matrix-loader-gap: 5px; }
  &--md { --tx-matrix-loader-gap: 6px; }
  &--lg { --tx-matrix-loader-gap: 8px; }

  &__canvas {
    display: block;
    flex: none;
  }

  &__label {
    color: var(--tx-text-color-regular, #606266);
    font-size: 12px;
    line-height: 1.3;
    white-space: nowrap;
  }

  &__label--sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
