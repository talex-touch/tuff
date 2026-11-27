<script setup lang="ts">
import type { MatrixLoaderBlendLayer } from './engine/renderer'
import type { MatrixLoaderProps, MatrixLoaderState } from './types'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { easeInOutCubic } from './engine/math'
import { renderMatrixLoaderFrame, resolveInkRgba } from './engine/renderer'
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
    return Math.max(1, Math.round(props.displaySize))
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

let prevLayers: MatrixLoaderBlendLayer[] = []
let morphStartMs = 0
let lastPaintedSec: number | null = null

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
  if (!hasDocument())
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
  const [ir, ig, ib, inkAlpha] = resolveInkRgba(props.color, dark)
  const inkRgb: readonly [number, number, number] = [ir, ig, ib]
  const nowMs = typeof performance !== 'undefined' ? performance.now() : 0
  const tSec = typeof explicitSec === 'number' && Number.isFinite(explicitSec)
    ? explicitSec
    : (nowMs / 1000) * effectiveSpeed.value
  lastPaintedSec = tSec

  const dur = Math.max(0, props.transitionDuration)
  let morphMix = 1
  if (prevLayers.length > 0 && dur > 0 && !reduced.value && !props.paused && props.time === undefined) {
    morphMix = Math.min(1, Math.max(0, (nowMs - morphStartMs) / dur))
    if (morphMix >= 1)
      prevLayers = []
  }
  else {
    prevLayers = []
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
      inkAlpha,
      prevLayers: prevLayers.length > 0 ? prevLayers : undefined,
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

  // Paused: preserve the last painted phase on redraws, or paint one initial frame on mount.
  if (props.paused) {
    renderFrame(lastPaintedSec ?? undefined)
    return
  }

  const loop = (): void => {
    renderFrame()
    if (running)
      raf = requestAnimationFrame(loop)
  }

  const start = (): void => {
    if (running || props.paused || reduced.value || props.time !== undefined)
      return
    running = true
    raf = requestAnimationFrame(loop)
  }

  // Paint immediately before IO fires.
  renderFrame()

  let visible = true
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(([entry]) => {
      if (observer !== io)
        return
      visible = !!entry?.isIntersecting
      if (visible && document.visibilityState !== 'hidden')
        start()
      else
        stopLoop()
    })
    io = observer
    observer.observe(canvas)
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden')
      stopLoop()
    else if (visible)
      start()
  }
  if (hasDocument()) {
    document.addEventListener('visibilitychange', onVisibility)
    detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility)
  }
  if (!io)
    start()
}

watch(
  () => props.state,
  (next, prev) => {
    const dur = Math.max(0, props.transitionDuration)
    if (prev && next !== prev && dur > 0 && !reduced.value && !props.paused && props.time === undefined) {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : 0
      if (prevLayers.length > 0) {
        const rawProgress = Math.min(1, Math.max(0, (nowMs - morphStartMs) / dur))
        const curMix = easeInOutCubic(rawProgress)
        const merged = new Map<MatrixLoaderState, number>()
        for (const layer of prevLayers) {
          const w = layer.weight * (1 - curMix)
          if (w > 0.004)
            merged.set(layer.state, (merged.get(layer.state) ?? 0) + w)
        }
        if (curMix > 0.004)
          merged.set(prev, (merged.get(prev) ?? 0) + curMix)
        prevLayers = Array.from(merged, ([state, weight]) => ({ state, weight }))
      }
      else {
        prevLayers = [{ state: prev, weight: 1 }]
      }
      morphStartMs = nowMs
    }
    else {
      prevLayers = []
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
