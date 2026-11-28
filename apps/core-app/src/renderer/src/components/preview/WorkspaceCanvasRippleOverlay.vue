<script lang="ts" name="WorkspaceCanvasRippleOverlay" setup>
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Whether the AI synthesis dot + ASCII ripple field is active. */
    active: boolean
    /** Surface theme used to calibrate saturation, lightness, and alpha contrast. */
    theme?: 'light' | 'dark'
  }>(),
  {
    theme: 'dark'
  }
)

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const CELL_SPACING = 16
const TARGET_FRAME_MS = 32 // ~30fps: silky smooth ripples with low laptop CPU cost
const SOFT_ASCII_GLYPHS = ['.', ':', '·', '-', '~', '+', '*', '×', '/', '\\', '^', '=', '°']
const PEAK_ASCII_GLYPHS = [
  '+',
  '*',
  '×',
  '/',
  '\\',
  '=',
  '~',
  ':',
  '^',
  '°',
  '%',
  '#',
  '0',
  '1',
  'a',
  'e',
  'i',
  'o',
  'x'
]

let rafId = 0
let lastRenderMs = 0
let startTimeMs = 0
let resizeObserver: ResizeObserver | null = null
let canvasWidth = 0
let canvasHeight = 0
let canvasDpr = 1

function isReducedMotion(): boolean {
  return (
    hasWindow() &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function fract(value: number): number {
  return value - Math.floor(value)
}

function syncCanvasSize(): boolean {
  const host = rootRef.value
  const canvas = canvasRef.value
  if (!host || !canvas) return false
  const rect = host.getBoundingClientRect()
  const nextW = Math.max(0, Math.round(rect.width))
  const nextH = Math.max(0, Math.round(rect.height))
  if (nextW === 0 || nextH === 0) return false

  const nextDpr = hasWindow() ? Math.min(2, window.devicePixelRatio || 1) : 1
  if (nextW === canvasWidth && nextH === canvasHeight && nextDpr === canvasDpr) {
    return true
  }
  canvasWidth = nextW
  canvasHeight = nextH
  canvasDpr = nextDpr
  canvas.width = Math.max(1, Math.round(nextW * nextDpr))
  canvas.height = Math.max(1, Math.round(nextH * nextDpr))
  return true
}

function drawFrame(elapsedSec: number): void {
  const canvas = canvasRef.value
  if (!canvas || !syncCanvasSize()) return

  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    return
  }
  if (!ctx) return

  const width = canvasWidth
  const height = canvasHeight
  const isDark = props.theme === 'dark'

  ctx.save()
  ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  // Soft bottom-up chromatic mist anchoring the rising wave origin.
  const mist = ctx.createLinearGradient(0, height, 0, height * 0.25)
  const hueShift = (elapsedSec * 28) % 360
  const mistHueA = (205 + hueShift) % 360
  const mistHueB = (285 + hueShift) % 360
  if (isDark) {
    mist.addColorStop(0, `hsla(${mistHueA}, 92%, 62%, 0.16)`)
    mist.addColorStop(0.38, `hsla(${mistHueB}, 86%, 60%, 0.07)`)
    mist.addColorStop(1, 'hsla(240, 80%, 60%, 0)')
  } else {
    mist.addColorStop(0, `hsla(${mistHueA}, 85%, 56%, 0.12)`)
    mist.addColorStop(0.4, `hsla(${mistHueB}, 80%, 58%, 0.05)`)
    mist.addColorStop(1, 'hsla(240, 80%, 60%, 0)')
  }
  ctx.fillStyle = mist
  ctx.fillRect(0, 0, width, height)

  ctx.font = '500 10.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const cols = Math.ceil(width / CELL_SPACING)
  const rows = Math.ceil(height / CELL_SPACING)
  const halfStep = CELL_SPACING * 0.5
  const invW = 1 / Math.max(width, 1)
  const invH = 1 / Math.max(height, 1)
  const normSpanX = 1 / Math.max(width * 0.62, 1)

  for (let row = 0; row < rows; row += 1) {
    const y = row * CELL_SPACING + halfStep
    const ny = y * invH // 0 = top, 1 = bottom
    const dy = (height * 1.05 - y) * invH // 0 near bottom -> 1.05 near top
    const bottomBias = Math.pow(Math.max(0, Math.min(1, ny)), 1.25)
    const verticalReach = 0.34 + 0.66 * bottomBias

    for (let col = 0; col < cols; col += 1) {
      const x = col * CELL_SPACING + halfStep
      const nx = x * invW
      const dx = (x - width * 0.5) * normSpanX
      const dist = Math.hypot(dx * 0.56, dy)

      // Gentle fluid horizontal warp so wave fronts feel organic rather than rigid bars.
      const warp =
        Math.sin(nx * 5.2 + elapsedSec * 0.95) * 0.032 +
        Math.cos(nx * 9.4 - elapsedSec * 0.65) * 0.016

      // Two overlapping bottom-up rising ripple trains.
      const p1 = (((dist + warp - elapsedSec * 0.44) % 0.5) + 0.5) % 0.5
      const wave1 = Math.exp(-Math.pow((p1 - 0.13) / 0.09, 2))

      const p2 = (((dist - warp * 0.75 - elapsedSec * 0.28 + 0.25) % 0.66) + 0.66) % 0.66
      const wave2 = Math.exp(-Math.pow((p2 - 0.16) / 0.115, 2)) * 0.7

      // Launch ignition surge: immediately sweeps from bottom capsule upward at t=0..1.5s.
      let ignitionWave = 0
      if (elapsedSec < 1.55) {
        const ignitionFront = elapsedSec * 0.92
        const ignitionDecay = Math.max(0, 1 - elapsedSec / 1.55)
        ignitionWave =
          Math.exp(-Math.pow((dist + warp * 0.5 - ignitionFront) / 0.12, 2)) * ignitionDecay * 1.15
      }

      const ripple = Math.min(1, wave1 + wave2 * 0.72 + ignitionWave)

      // Deterministic per-cell sparkle hash for organic shimmer without harsh flicker.
      const hash = fract(Math.sin(col * 127.1 + row * 311.7) * 43758.5453)
      const twinkle = 0.7 + 0.3 * Math.sin(elapsedSec * (1.7 + hash * 2.5) + hash * 6.28318)

      const rawEnergy =
        (0.07 + bottomBias * 0.26 + ripple * (0.68 + bottomBias * 0.34)) * verticalReach * twinkle
      const energy = Math.min(1, rawEnergy)
      if (energy < 0.07) continue

      // Flowing spectrum gradient across x, rising y, and time (cyan -> blue -> violet -> magenta -> coral -> mint).
      const rawHue = (192 + nx * 145 + (1 - ny) * 88 - elapsedSec * 44 + ripple * 38) % 360
      const hue = rawHue < 0 ? rawHue + 360 : rawHue

      const alpha = isDark ? Math.min(0.84, energy * 0.86) : Math.min(0.62, energy * 0.66)
      const sat = isDark ? 92 : 82
      const light = isDark ? Math.round(60 + ripple * 20) : Math.round(43 + (1 - ripple) * 8)

      ctx.fillStyle = `hsla(${hue.toFixed(1)}, ${sat}%, ${light}%, ${alpha.toFixed(3)})`

      // Interweave circular dots with mutating ASCII characters along active wave crests.
      const useAscii =
        (ripple > 0.36 && hash > 0.42) || (bottomBias > 0.62 && energy > 0.28 && hash > 0.64)

      if (useAscii) {
        const pool = ripple > 0.62 ? PEAK_ASCII_GLYPHS : SOFT_ASCII_GLYPHS
        const cadence = Math.floor(elapsedSec * (3.2 + hash * 4.5) + hash * 31 + ripple * 4)
        const glyph = pool[((cadence % pool.length) + pool.length) % pool.length]!
        ctx.fillText(glyph, x, y)
      } else {
        const radius = 0.85 + energy * 1.65
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ctx.restore()
}

function stopLoop(): void {
  if (rafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId)
  }
  rafId = 0
}

function tick(nowMs: number): void {
  rafId = 0
  if (!props.active) return
  if (hasDocument() && document.hidden) return

  if (nowMs - lastRenderMs >= TARGET_FRAME_MS) {
    lastRenderMs = nowMs
    drawFrame((nowMs - startTimeMs) / 1000)
  }

  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(tick)
  }
}

function startLoop(): void {
  stopLoop()
  if (!props.active) return
  startTimeMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
  lastRenderMs = 0

  if (isReducedMotion()) {
    drawFrame(1.4)
    return
  }

  drawFrame(0)
  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(tick)
  }
}

function onVisibilityChange(): void {
  if (hasDocument() && document.hidden) {
    stopLoop()
  } else if (props.active) {
    startLoop()
  }
}

watch(
  () => [props.active, props.theme] as const,
  ([active]) => {
    if (active) {
      startLoop()
    } else {
      stopLoop()
    }
  }
)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (props.active) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        drawFrame(Math.max(0, (now - startTimeMs) / 1000))
      }
    })
    resizeObserver.observe(rootRef.value)
  }
  if (hasDocument()) {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (props.active) {
    startLoop()
  }
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (hasDocument()) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})
</script>

<template>
  <Transition name="canvas-ripple">
    <div
      v-show="active"
      ref="rootRef"
      class="WorkspaceCanvasRippleOverlay"
      :class="`is-${theme}`"
      :data-theme="theme"
      :data-active="active ? 'true' : 'false'"
      aria-hidden="true"
      data-testid="file-viewer-canvas-ripple"
    >
      <div class="WorkspaceCanvasRippleOverlay-Aura" />
      <canvas ref="canvasRef" class="WorkspaceCanvasRippleOverlay-Canvas" />
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.WorkspaceCanvasRippleOverlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.WorkspaceCanvasRippleOverlay-Aura {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      95% 55% at 50% 106%,
      rgba(56, 189, 248, 0.22) 0%,
      rgba(168, 85, 247, 0.14) 36%,
      rgba(244, 63, 94, 0.08) 62%,
      transparent 88%
    ),
    radial-gradient(70% 42% at 22% 100%, rgba(52, 211, 153, 0.16) 0%, transparent 72%),
    radial-gradient(70% 42% at 78% 100%, rgba(251, 146, 60, 0.15) 0%, transparent 72%);

  .WorkspaceCanvasRippleOverlay.is-light & {
    opacity: 0.72;
  }

  @media (prefers-reduced-motion: no-preference) {
    animation: canvas-ripple-aura-breathe 4.4s ease-in-out infinite;
  }
}

.WorkspaceCanvasRippleOverlay-Canvas {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: no-preference) {
  .canvas-ripple-enter-active {
    transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .canvas-ripple-leave-active {
    transition: opacity 380ms cubic-bezier(0.4, 0, 1, 1);
  }
}

.canvas-ripple-enter-from,
.canvas-ripple-leave-to {
  opacity: 0;
}

@keyframes canvas-ripple-aura-breathe {
  0%,
  100% {
    opacity: 0.85;
    transform: translateY(0) scale(1);
  }

  50% {
    opacity: 1;
    transform: translateY(-4px) scale(1.03);
  }
}
</style>
