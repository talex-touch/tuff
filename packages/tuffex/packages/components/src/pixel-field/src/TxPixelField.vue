<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { PixelFieldHandle, PixelFieldParticle, PixelFieldProps } from './types'
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { createFrameLoop } from '../../../../utils/frame-loop'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { createPixelFieldRuntime, renderPixelFieldFrame } from './engine'
import { buildPaletteLut, resolvePixelFieldPalette } from './palettes'
import { buildPixelFieldParticles, loadImageBitmap, rasterizeTextBitmap } from './presets'
import { PIXEL_FIELD_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxPixelField' })

const props = withDefaults(defineProps<PixelFieldProps>(), {
  preset: 'leaf',
  src: undefined,
  text: undefined,
  palette: 'emerald',
  stage: 'adaptive',
  pixelSize: 3,
  gap: 1.6,
  density: 1,
  speed: 1,
  animated: true,
  paused: false,
  interactive: true,
  interaction: 'coalesce',
  pointerRadius: 96,
  pointerStrength: 1,
  parallax: 1,
  rippleOnClick: true,
  aspectRatio: undefined,
  radius: 20,
  ariaLabel: undefined,
  labels: undefined,
})

const emit = defineEmits<{
  pulse: [payload: { nx: number, ny: number }]
}>()

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const activity = useMotionActivity(rootRef, () => props.animated && !props.paused)

const hostDark = ref(true)
const width = ref(320)
const height = ref(360)
const particleCount = ref(0)
const customBitmap = shallowRef<{ data: Uint8ClampedArray, width: number, height: number } | null>(null)

const isDark = computed(() => props.stage === 'obsidian' || hostDark.value)
const resolvedPalette = computed(() => resolvePixelFieldPalette(props.palette, isDark.value))
const lut = computed(() => buildPaletteLut(resolvedPalette.value, isDark.value))
const resolvedLabels = computed(() => ({ ...PIXEL_FIELD_DEFAULT_LABELS, ...props.labels }))
const computedAriaLabel = computed(() => props.ariaLabel ?? resolvedLabels.value.stage)

const rootStyle = computed<CSSProperties>(() => {
  const radiusValue = typeof props.radius === 'number' ? `${props.radius}px` : props.radius
  const style: CSSProperties = {
    '--tx-pixel-field-radius': radiusValue,
  } as CSSProperties
  if (props.aspectRatio !== undefined) {
    style.aspectRatio = String(props.aspectRatio)
  }
  if (props.stage === 'obsidian' && resolvedPalette.value.backdrop) {
    style['--tx-pixel-field-obsidian-bg' as keyof CSSProperties] = resolvedPalette.value.backdrop as never
  }
  return style
})

let particles: PixelFieldParticle[] = []
const runtime = createPixelFieldRuntime()
const pointer = { x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, inside: false }
let lastPointerTime = 0
let dpr = 1
let mounted = false
let bitmapRequest = 0
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined
let colorSchemeMq: MediaQueryList | undefined

const frames = createFrameLoop(onFrame, { firstStep: 0, maxStep: 0.05 })

function detectHostDark(): void {
  if (typeof window === 'undefined') return
  let node: Element | null = rootRef.value
  while (node) {
    const attr = node.getAttribute('data-theme')
    if (attr === 'dark') {
      hostDark.value = true
      return
    }
    if (attr === 'light') {
      hostDark.value = false
      return
    }
    if (node.classList.contains('dark')) {
      hostDark.value = true
      return
    }
    if (node.classList.contains('light')) {
      hostDark.value = false
      return
    }
    node = node.parentElement
  }
  hostDark.value = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
}

function paintOnce(dt = 0): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  renderPixelFieldFrame(ctx, particles, lut.value, runtime, pointer, {
    width: width.value,
    height: height.value,
    dpr,
    pixelSize: Math.max(1.5, props.pixelSize),
    speed: Math.max(0.1, Math.min(3, props.speed)),
    interactive: props.interactive,
    interaction: props.interaction,
    pointerRadius: Math.max(24, props.pointerRadius),
    pointerStrength: Math.max(0, Math.min(2, props.pointerStrength)),
    parallax: Math.max(0, Math.min(2, props.parallax)),
    dark: isDark.value,
    reduced: activity.reduced.value || !props.animated || props.paused,
  }, dt)
}

function rebuild(): void {
  particles = buildPixelFieldParticles({
    preset: props.preset,
    width: width.value,
    height: height.value,
    pixelSize: Math.max(1.5, props.pixelSize),
    gap: Math.max(0.5, props.gap),
    density: props.density,
    bitmap: customBitmap.value,
  })
  particleCount.value = particles.length
  paintOnce(0)
}

function resizeCanvas(): void {
  const root = rootRef.value
  const canvas = canvasRef.value
  if (!root || !canvas || typeof window === 'undefined') return
  dpr = Math.min(2, window.devicePixelRatio || 1)
  const nextW = Math.max(80, Math.round(root.clientWidth || width.value))
  const nextH = Math.max(80, Math.round(root.clientHeight || height.value))
  const sizeChanged = nextW !== width.value || nextH !== height.value
  width.value = nextW
  height.value = nextH
  const backingW = Math.max(1, Math.round(nextW * dpr))
  const backingH = Math.max(1, Math.round(nextH * dpr))
  if (canvas.width !== backingW) canvas.width = backingW
  if (canvas.height !== backingH) canvas.height = backingH
  if (sizeChanged || particles.length === 0) {
    if (sizeChanged && props.text && !props.src) {
      void refreshBitmap()
    }
    else {
      rebuild()
    }
  }
  else {
    paintOnce(0)
  }
}

async function refreshBitmap(): Promise<void> {
  const reqId = ++bitmapRequest
  if (props.src && props.src.trim()) {
    const bmp = await loadImageBitmap(props.src)
    if (reqId !== bitmapRequest) return
    customBitmap.value = bmp
  }
  else if (props.text && props.text.trim()) {
    customBitmap.value = rasterizeTextBitmap(props.text, 160, width.value / Math.max(1, height.value))
  }
  else {
    customBitmap.value = null
  }
  if (mounted) rebuild()
}

function onFrame(dt: number): boolean {
  if (!mounted || !activity.active.value) return false
  pointer.vx *= Math.exp(-dt * 12)
  pointer.vy *= Math.exp(-dt * 12)
  paintOnce(dt)
  return true
}

function syncLoop(): void {
  if (!mounted) return
  if (activity.active.value) {
    frames.start()
  }
  else {
    frames.stop()
    paintOnce(0)
  }
}

function updatePointer(event: PointerEvent): void {
  if (!props.interactive || !rootRef.value) return
  const rect = rootRef.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const now = performance.now()
  const dt = lastPointerTime > 0 ? Math.max(0.008, (now - lastPointerTime) / 1000) : 1 / 60
  if (pointer.inside) {
    pointer.vx = Math.max(-1800, Math.min(1800, (x - pointer.x) / dt))
    pointer.vy = Math.max(-1800, Math.min(1800, (y - pointer.y) / dt))
  }
  pointer.x = x
  pointer.y = y
  pointer.nx = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1))
  pointer.ny = Math.max(-1, Math.min(1, (y / rect.height) * 2 - 1))
  pointer.inside = true
  lastPointerTime = now
}

function onPointerLeave(): void {
  pointer.inside = false
  pointer.vx = 0
  pointer.vy = 0
  lastPointerTime = 0
}

function pulse(nx = 0.5, ny = 0.5): void {
  const clampedNx = Math.max(0, Math.min(1, nx))
  const clampedNy = Math.max(0, Math.min(1, ny))
  runtime.pulses.push({
    x: clampedNx * width.value,
    y: clampedNy * height.value,
    age: 0,
    maxAge: 0.95,
    maxRadius: Math.hypot(width.value, height.value) * 0.85,
  })
  emit('pulse', { nx: clampedNx, ny: clampedNy })
  if (!activity.active.value) paintOnce(0)
}

function onClick(event: MouseEvent): void {
  if (!props.interactive || !props.rippleOnClick || !rootRef.value) return
  const rect = rootRef.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  pulse((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)
}

function bindObservers(): void {
  if (typeof window === 'undefined' || !rootRef.value) return
  detectHostDark()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(rootRef.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      detectHostDark()
      paintOnce(0)
    })
    for (let node: Element | null = rootRef.value; node; node = node.parentElement) {
      themeObserver.observe(node, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    }
  }
  if (typeof window.matchMedia === 'function') {
    colorSchemeMq = window.matchMedia('(prefers-color-scheme: dark)')
    colorSchemeMq.addEventListener('change', detectHostDark)
  }
}

function unbindObservers(): void {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  themeObserver?.disconnect()
  themeObserver = undefined
  colorSchemeMq?.removeEventListener('change', detectHostDark)
  colorSchemeMq = undefined
}

watch(() => [props.src, props.text], () => {
  void refreshBitmap()
})

watch(() => [props.preset, props.pixelSize, props.gap, props.density], () => {
  if (mounted) rebuild()
})

watch(() => [props.palette, props.stage, isDark.value], () => {
  if (mounted) paintOnce(0)
}, { deep: true })

watch([() => activity.active.value, () => activity.reduced.value], syncLoop, { flush: 'post' })

onMounted(() => {
  mounted = true
  bindObservers()
  resizeCanvas()
  if (props.src || props.text) {
    void refreshBitmap()
  }
  syncLoop()
})

function teardown(): void {
  mounted = false
  frames.stop()
  unbindObservers()
}

onDeactivated(teardown)
onBeforeUnmount(teardown)

const handle: PixelFieldHandle = {
  pulse,
  rebuild,
  get count() {
    return particleCount.value
  },
}

defineExpose(handle)
</script>

<template>
  <div
    ref="rootRef"
    class="tx-pixel-field"
    :class="[`tx-pixel-field--${stage}`, { 'is-interactive': interactive }]"
    :style="rootStyle"
    :data-preset="preset"
    :data-stage="stage"
    :data-interaction="interaction"
    :data-motion-active="activity.active.value"
    @pointerenter="updatePointer"
    @pointermove="updatePointer"
    @pointerleave="onPointerLeave"
    @click="onClick"
  >
    <canvas
      ref="canvasRef"
      class="tx-pixel-field__canvas"
      role="img"
      :aria-label="computedAriaLabel"
    />
    <div v-if="$slots.default" class="tx-pixel-field__overlay">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-pixel-field {
  position: relative;
  display: block;
  width: 100%;
  min-height: 220px;
  overflow: hidden;
  border-radius: var(--tx-pixel-field-radius, 20px);
  background: var(--tx-pixel-field-bg, var(--tx-bg-color-overlay, var(--tx-bg-color, #fff)));
  box-shadow: inset 0 0 0 1px var(--tx-pixel-field-border, var(--tx-border-color, #dcdfe6));
  color: var(--tx-text-color-primary, #303133);
  isolation: isolate;
}

.tx-pixel-field--obsidian {
  background: var(--tx-pixel-field-obsidian-bg, var(--tx-bg-color-page, #040506));
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 14%, transparent),
    0 18px 40px -24px color-mix(in srgb, var(--tx-text-color-primary, #000) 55%, transparent);
  color: var(--tx-color-on-primary, #fff);
}

.tx-pixel-field__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.tx-pixel-field__overlay {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: inherit;
  box-sizing: border-box;
}
</style>
