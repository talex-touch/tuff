<!-- Vue port of VoiceRing / VoiceOrb (https://github.com/Jakubantalik/Libraries.dev — MIT © 2026 Jakub Antalik). -->
<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AnalyserLease } from './audio'
import type { OrbGlow, OrbTint } from './engine/paint'
import type { VoiceInput } from './engine/types'
import type { VoiceRingBoundsTarget, VoiceRingProps } from './types'
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import { acquireAnalyser } from './audio'
import { ACCENT_COLORS, EMOTION_COLORS, GlowFollower } from './emotion'
import { bendFrame, bendRadius, bendReach } from './engine/bend'
import { EdgeBounce, LEAN_DEFAULTS, leanFrame, leanReach } from './engine/lean'
import { paintFrame } from './engine/paint'
import { PRESETS, resolvePreset } from './presets'
import { useVoiceRingTheme } from './theme'
import { VOICE_RING_DEFAULT_LABELS } from './types'
import { VoiceFollower } from './voice'

defineOptions({ name: 'TxVoiceRing' })

const HOVER_BEND = 0.55
const FRAME_MS = 1000 / 62
const ORB_TYPE = { ring: 'aura', mono: 'aura-mono' } as const

function parseTint(color: string | undefined): OrbTint | undefined {
  if (!color) return undefined
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) h = h.replace(/./g, c => c + c)
    const n = Number.parseInt(h, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const fn = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (fn) return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) }
  return undefined
}

function resolveBoundsElement(bounds: VoiceRingBoundsTarget): Element | null {
  if (!bounds) return null
  if (typeof (bounds as Element).getBoundingClientRect === 'function') return bounds as Element
  if ('value' in bounds) return bounds.value
  if ('current' in bounds) return bounds.current
  return null
}

const props = withDefaults(defineProps<VoiceRingProps>(), {
  type: 'ring',
  state: 'listening',
  size: 160,
  stream: null,
  analyser: null,
  level: undefined,
  sensitivity: 0.85,
  threshold: 0.04,
  attack: undefined,
  release: 0.32,
  idle: 0.1,
  calm: 0.4,
  voiceSpeed: undefined,
  emotion: null,
  emotionColors: undefined,
  saturation: 2,
  accent: null,
  gradientAngle: 99,
  gradientSpin: 12,
  neutral: 1,
  colorBrightness: 1.02,
  colorHue: 0,
  gradientStart: 0.1,
  gradientWidth: 0.6,
  direction: undefined,
  directionMove: undefined,
  directionPull: undefined,
  directionDeform: undefined,
  directionSquash: undefined,
  directionLens: undefined,
  directionStretch: undefined,
  directionSplit: undefined,
  directionBlur: undefined,
  directionBounce: undefined,
  directionMargin: undefined,
  directionBounds: undefined,
  hoverBend: false,
  theme: 'auto',
  speed: 1,
  paused: false,
  color: undefined,
  dots: 1,
  dotSize: undefined,
  opts: undefined,
  frame: undefined,
  ariaLabel: undefined,
  labels: undefined,
  onLevel: undefined,
})

const emit = defineEmits<{
  level: [value: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const dark = useVoiceRingTheme(() => props.theme, canvasRef)
const reduced = useReducedMotion()

const orbType = computed(() => ORB_TYPE[props.type === 'mono' ? 'mono' : 'ring'])
const resolvedLabels = computed(() => ({ ...VOICE_RING_DEFAULT_LABELS, ...props.labels }))
const computedAriaLabel = computed(() => props.ariaLabel ?? resolvedLabels.value[props.state])
const presetMeta = computed(() => PRESETS[orbType.value])
const directionMargin = computed(() => props.directionMargin ?? presetMeta.value.margin ?? 32)
const dotSize = computed(() => props.dotSize ?? presetMeta.value.dotSize ?? 1)
const hasSource = computed(() => Boolean(props.stream || props.analyser || props.level != null || props.state === 'processing'))
const optsKey = computed(() => (props.opts ? JSON.stringify(props.opts) : ''))

const leanConfig = computed(() => {
  const typeLean = presetMeta.value.lean ?? {}
  return {
    move: props.directionMove ?? typeLean.move ?? LEAN_DEFAULTS.move,
    pull: props.directionPull ?? typeLean.pull ?? LEAN_DEFAULTS.pull,
    deform: props.directionDeform ?? typeLean.deform ?? LEAN_DEFAULTS.deform,
    squash: props.directionSquash ?? typeLean.squash ?? LEAN_DEFAULTS.squash,
    lens: props.directionLens ?? typeLean.lens ?? LEAN_DEFAULTS.lens,
    stretch: props.directionStretch ?? typeLean.stretch ?? LEAN_DEFAULTS.stretch,
    split: props.directionSplit ?? typeLean.split ?? LEAN_DEFAULTS.split,
    blur: props.directionBlur ?? typeLean.blur ?? LEAN_DEFAULTS.blur,
    bounce: props.directionBounce ?? typeLean.bounce ?? LEAN_DEFAULTS.bounce,
  }
})

const reach = computed(() => (props.direction == null ? 0 : leanReach(leanConfig.value, props.size)))
const room = ref<[number, number]>([Infinity, Infinity])
const leftBound = computed(() => Math.min(reach.value, room.value[0]))
const rightBound = computed(() => Math.min(reach.value, room.value[1]))
const padL = computed(() => (reach.value ? leftBound.value + directionMargin.value : 0))
const padR = computed(() => (reach.value ? rightBound.value + directionMargin.value : 0))

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${props.size + padL.value + padR.value}px`,
  height: `${props.size}px`,
  marginLeft: `${-padL.value}px`,
  marginRight: `${-padR.value}px`,
}))

const bendStrength = computed(() =>
  props.hoverBend === true
    ? HOVER_BEND
    : typeof props.hoverBend === 'number'
      ? Math.max(0, Math.min(1, props.hoverBend))
      : 0,
)

// Persistent envelope followers so prop changes never cut the voice mid-sentence.
const follower = new VoiceFollower()
const glower = new GlowFollower()
const pointer = { x: 0, y: 0, over: false }

let ownAnalyser: AnalyserNode | null = null
let analyserLease: AnalyserLease | null = null

function releaseAnalyser(): void {
  ownAnalyser = null
  analyserLease?.release()
  analyserLease = null
}

watch(
  () => props.stream,
  (stream) => {
    releaseAnalyser()
    if (!stream || typeof window === 'undefined') return
    analyserLease = acquireAnalyser(stream)
    ownAnalyser = analyserLease?.analyser ?? null
  },
  { immediate: true },
)

// Pointer listener for hoverBend (desktop fine pointers only, disabled under reduced motion).
let cleanupPointer: (() => void) | null = null
function bindPointer(): void {
  cleanupPointer?.()
  cleanupPointer = null
  pointer.over = false
  const canvas = canvasRef.value
  if (bendStrength.value <= 0 || reduced.value || !canvas || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const r = canvas.getBoundingClientRect()
    const totalW = props.size + padL.value + padR.value
    const k = totalW / (r.width || 1)
    pointer.x = (e.clientX - r.left) * k - padL.value
    pointer.y = (e.clientY - r.top) * k
    pointer.over = true
  }
  const onLeave = () => {
    pointer.over = false
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  cleanupPointer = () => {
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    pointer.over = false
  }
}

let cleanupLoop: (() => void) | null = null
let mounted = false

function readLiveColors() {
  const sat = props.saturation
  return {
    saturation: Math.min(1, sat),
    vivid: Math.max(0, Math.min(1, sat - 1)),
    brightness: props.colorBrightness,
    hue: props.colorHue,
    start: props.gradientStart,
    width: props.gradientWidth,
    accent: props.accent ? ACCENT_COLORS[props.accent] : null,
    angle: props.gradientAngle,
    spin: props.gradientSpin,
    neutral: props.neutral,
    size: props.size,
  }
}

function startLoop(): void {
  cleanupLoop?.()
  cleanupLoop = null
  const canvas = canvasRef.value
  if (!mounted || !canvas || typeof window === 'undefined') return

  const size = props.size
  const currentPadL = padL.value
  const currentPadR = padR.value
  const currentLeft = leftBound.value
  const currentRight = rightBound.value
  const currentMargin = directionMargin.value
  const currentReach = reach.value
  const isDark = dark.value
  const isReduced = reduced.value
  const isPaused = props.paused
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  canvas.width = Math.round((size + currentPadL + currentPadR) * dpr)
  canvas.height = Math.round(size * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const preset = resolvePreset(orbType.value, size, props.dots, dotSize.value)
  const opts = props.opts ? { ...preset.opts, ...props.opts } : preset.opts
  const frameFn = props.frame ?? preset.frame
  const tint = parseTint(props.color)

  const bounce = new EdgeBounce()
  let press = 0
  let bend = 0
  let bx = size / 2
  let by = size / 2

  const draw = (voice: VoiceInput, glow: OrbGlow, dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, currentPadL * dpr, 0)
    ctx.clearRect(-currentPadL, 0, size + currentPadL + currentPadR, size)
    const hit = isPaused || isReduced ? 0 : bounce.step(press, dt)
    let frame = leanFrame(frameFn(size, follower.t, voice, opts), voice.pan, size, leanConfig.value, [currentLeft, currentRight], hit)
    press = frame.contact?.press ?? 0

    const strength = bendStrength.value
    if (strength > 0) {
      const R = bendRadius(frame, size)
      const quiet = props.state === 'idle' || props.state === 'processing'
      const near = pointer.over && quiet && !isPaused && !isReduced
        ? bendReach(Math.hypot(pointer.x - size / 2, pointer.y - size / 2) - R, R)
        : 0
      bend += (near - bend) * (1 - Math.exp(-dt / 0.14))
      const follow = bend < 0.01 ? 1 : 1 - Math.exp(-dt / 0.05)
      bx += (pointer.x - bx) * follow
      by += (pointer.y - by) * follow
      if (bend > 0.002) frame = bendFrame(frame, size, { x: bx, y: by, amount: bend * strength })
    }

    const c = readLiveColors()
    const e = glow.amount
    const base = c.accent
    const hue = base
      ? { r: base.r + (glow.r - base.r) * e, g: base.g + (glow.g - base.g) * e, b: base.b + (glow.b - base.b) * e }
      : { r: glow.r, g: glow.g, b: glow.b }
    const colors = {
      ...c,
      accent: hue,
      saturation: c.saturation * (base ? 1 : e),
      angle: c.angle + c.spin * follower.clock,
    }
    paintFrame(ctx, frame, isDark, tint, frame.light || frame.tube ? glow : undefined, colors)
  }

  let lastMeasure = -Infinity
  const measure = (now: number) => {
    if (!currentReach || now - lastMeasure < 500) return
    lastMeasure = now
    const box = canvas.getBoundingClientRect().left + currentPadL
    const boundsEl = resolveBoundsElement(props.directionBounds)
    const within = boundsEl?.getBoundingClientRect()
    const lo = within ? within.left : 0
    const hi = within ? within.right : document.documentElement.clientWidth
    const next: [number, number] = [
      Math.max(0, Math.floor(box - lo - currentMargin)),
      Math.max(0, Math.floor(hi - box - size - currentMargin)),
    ]
    if (Math.abs(room.value[0] - next[0]) > 1 || Math.abs(room.value[1] - next[1]) > 1) {
      room.value = next
    }
  }

  let lastStep = 0
  const step = (now: number) => {
    measure(now)
    const dt = lastStep ? Math.min(0.05, (now - lastStep) / 1000) : 1 / 60
    lastStep = now
    const hears = props.state === 'listening' || props.state === 'speaking'
    const node = ownAnalyser ?? props.analyser ?? null
    if (!hears) follower.readSilence()
    else if (node) follower.readAnalyser(node, props.sensitivity * preset.gain, dt)
    else if (props.level != null) {
      follower.readLevel(typeof props.level === 'function' ? props.level() : props.level, props.sensitivity * preset.gain)
    }
    else follower.readSilence()

    const attack = props.attack ?? presetMeta.value.attack ?? 0.06
    const voiceSpeed = props.voiceSpeed ?? presetMeta.value.voiceSpeed ?? 1
    const voice = follower.step(
      dt,
      {
        sensitivity: props.sensitivity,
        threshold: props.threshold,
        attack,
        release: props.release,
        idle: props.idle,
        driveGain: preset.driveGain * voiceSpeed,
        calm: props.calm,
        rate: preset.speed * props.speed,
        processing: props.state === 'processing',
        direction: typeof props.direction === 'function' ? props.direction() : (props.direction ?? 0),
      },
      isReduced,
    )
    props.onLevel?.(voice.level)
    emit('level', voice.level)

    const emotionTint = props.emotion ? (props.emotionColors?.[props.emotion] ?? EMOTION_COLORS[props.emotion]) : null
    const glow = glower.step(dt, emotionTint, follower.clock, size, isPaused || isReduced)
    draw(voice, glow, dt)
  }

  step(performance.now())
  if (isPaused || (isReduced && !hasSource.value)) return

  let raf = 0
  let running = false
  let lastPaint = 0
  const loop = (now: number) => {
    if (!running) return
    raf = requestAnimationFrame(loop)
    if (now - lastPaint < FRAME_MS) return
    lastPaint = now
    step(now)
  }
  const start = () => {
    if (running) return
    running = true
    lastStep = 0
    raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    running = false
    cancelAnimationFrame(raf)
  }

  let visible = true
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting)
        if (visible && document.visibilityState !== 'hidden') start()
        else stop()
      })
    : null
  io?.observe(canvas)
  const onVis = () => {
    if (document.visibilityState === 'hidden') stop()
    else if (visible) start()
  }
  document.addEventListener('visibilitychange', onVis)
  if (!io) start()

  cleanupLoop = () => {
    stop()
    io?.disconnect()
    document.removeEventListener('visibilitychange', onVis)
  }
}

watch(
  () => [
    orbType.value,
    props.size,
    reach.value,
    leftBound.value,
    rightBound.value,
    padL.value,
    padR.value,
    directionMargin.value,
    dark.value,
    props.speed,
    props.paused,
    reduced.value,
    hasSource.value,
    props.color,
    props.dots,
    dotSize.value,
    optsKey.value,
    props.frame,
    props.paused || reduced.value ? props.emotion : null,
    props.paused || reduced.value
      ? `${props.saturation}|${props.accent}|${props.gradientAngle}|${props.gradientSpin}|${props.neutral}|${props.colorBrightness}|${props.colorHue}|${props.gradientStart}|${props.gradientWidth}`
      : null,
  ],
  () => {
    bindPointer()
    startLoop()
  },
  { flush: 'post' },
)

watch(() => [bendStrength.value, reduced.value, props.size, padL.value, padR.value], bindPointer, { flush: 'post' })

onMounted(() => {
  mounted = true
  bindPointer()
  startLoop()
})

function teardown(): void {
  mounted = false
  cleanupLoop?.()
  cleanupLoop = null
  cleanupPointer?.()
  cleanupPointer = null
  releaseAnalyser()
}

onDeactivated(teardown)
onBeforeUnmount(teardown)

defineExpose({
  canvas: canvasRef,
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="tx-voice-ring"
    role="img"
    :aria-label="computedAriaLabel"
    :data-voice-ring-type="type"
    :data-voice-ring-state="state"
    :style="canvasStyle"
  />
</template>

<style lang="scss">
.tx-voice-ring {
  display: block;
  flex-shrink: 0;
}
</style>
