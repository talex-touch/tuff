<script setup lang="ts">
import type { TxRadioGroupProps, TxRadioValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRefs, watch } from 'vue'
import { TxGlassSurface } from '../../glass-surface'

defineOptions({ name: 'TxRadioGroup' })

const props = withDefaults(defineProps<TxRadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  type: 'button',
  glass: false,
  blur: false,
  stiffness: 110,
  damping: 12,
  blurAmount: 1,
  elastic: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: TxRadioValue): void
  (e: 'change', v: TxRadioValue): void
}>()

const { disabled, type, glass } = toRefs(props)

const resolvedDirection = computed(() => {
  if (type.value === 'button') {
    return 'row'
  }
  if (type.value === 'standard') {
    return props.direction ?? 'row'
  }
  return props.direction ?? 'column'
})

const model = computed({
  get: () => props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const groupRef = ref<HTMLElement | null>(null)

const indicatorVisible = ref(false)
const targetRect = ref({ width: 0, height: 0, x: 0, y: 0 })
const currentRect = ref({ width: 0, height: 0, x: 0, y: 0 })
const velocity = ref({ x: 0, y: 0, w: 0, h: 0 })
const impact = ref(0)
const impactAxis = ref<'x' | 'y'>('x')

const isDragging = ref(false)
const isAnimating = ref(false)

const motionPhase = ref<'idle' | 'emerge' | 'sink'>('idle')
let motionPhaseTimer: ReturnType<typeof setTimeout> | null = null

let indicatorRaf: number | null = null

let motionRaf: number | null = null
let motionLastTs: number | null = null

let lastPointer = { x: 0, y: 0, ts: 0 }
let lastPointerVelocity = { x: 0, y: 0 }
const dragLockY = ref<number | null>(null)

const motionActive = computed(() => isDragging.value || isAnimating.value)

const overscan = 0

const stiffnessIdle = computed(() => props.stiffness ?? 150)
const dampingIdle = computed(() => props.damping ?? 8)
const stiffnessDrag = 112
const dampingDrag = 9.0

const isDarkMode = ref(false)
let cleanupDarkMode: (() => void) | undefined

/**
 * Sync prefers-color-scheme and return cleanup handler.
 */
function updateDarkMode(): (() => void) | undefined {
  if (typeof window === 'undefined') {
    return
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDarkMode.value = mediaQuery.matches
  const handler = (e: MediaQueryListEvent) => {
    isDarkMode.value = e.matches
  }
  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}

const outlineStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  if (motionActive.value) {
    return { opacity: '0' }
  }

  const { width, height, x, y } = currentRect.value
  return {
    opacity: '1',
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  }
})

const glassWrapStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  const { width, height, x, y } = currentRect.value
  const v = velocity.value
  const speed = Math.hypot(v.x, v.y)
  const imp = impact.value

  let stretchX = 1
  let stretchY = 1

  if (motionActive.value && speed > 3) {
    const dragBoost = isDragging.value ? 1.8 : 1.0
    const stretch = Math.min(speed / 100, 0.6) * dragBoost
    stretchX = 1 - stretch * 0.35
    stretchY = 1 + stretch * 0.6
  }

  if (imp > 0.01) {
    const squash = imp * 0.7
    if (impactAxis.value === 'x') {
      stretchX = stretchX * (1 + squash * 0.5)
      stretchY = stretchY * (1 - squash * 0.4)
    }
    else {
      stretchY = stretchY * (1 + squash * 0.5)
      stretchX = stretchX * (1 - squash * 0.4)
    }
  }

  const phaseScale = glassPhaseScale.value
  const baseScale = activeScale.value
  let scaleX = baseScale * phaseScale * stretchX
  let scaleY = baseScale * phaseScale * stretchY

  scaleX = Math.max(0, Math.min(2, scaleX))
  scaleY = Math.max(0, Math.min(2, scaleY))

  return {
    opacity: `${glassOpacity.value}`,
    width: `${width}px`,
    height: `${height}px`,
    filter: glassFilter.value,
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
  }
})

const glassInnerStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  const v = velocity.value
  const speed = Math.hypot(v.x, v.y)

  let scaleX = 1
  let scaleY = 1

  if (motionActive.value && speed > 50) {
    const stretch = Math.min(speed / 400, 0.3)
    scaleX = 1 + stretch * 0.5
    scaleY = 1 - stretch * 0.25
  }

  if (impact.value > 0.01) {
    const squash = impact.value * 0.6
    if (impactAxis.value === 'x') {
      scaleX = scaleX * (1 - squash * 0.5)
      scaleY = scaleY * (1 + squash * 0.7)
    }
    else {
      scaleY = scaleY * (1 - squash * 0.5)
      scaleX = scaleX * (1 + squash * 0.7)
    }
  }

  scaleX = Math.max(0.5, Math.min(1.6, scaleX))
  scaleY = Math.max(0.5, Math.min(1.6, scaleY))

  return {
    opacity: '1',
    width: '100%',
    height: '100%',
    transform: `scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
  }
})

const glassRadius = computed(() => 18)

const glassLook = computed(() => {
  if (isDarkMode.value) {
    return {
      brightness: 8,
      opacity: 0.6,
      backgroundOpacity: 0.06,
      saturation: 1.05,
    }
  }

  return {
    brightness: 100,
    opacity: 0.85,
    backgroundOpacity: 0.02,
    saturation: 1.15,
  }
})

const glassOpacity = computed(() => {
  if (!motionActive.value && motionPhase.value === 'idle') {
    return 0
  }
  if (motionPhase.value === 'emerge') {
    return 0.75
  }
  if (motionPhase.value === 'sink') {
    return 0.18
  }
  return 1
})

const glassPhaseScale = computed(() => {
  if (!motionActive.value) {
    return 1.0
  }
  if (motionPhase.value === 'emerge') {
    return 1.08
  }
  if (motionPhase.value === 'sink') {
    return 0.97
  }
  return 1.0
})

const activeScale = computed(() => {
  if (!indicatorVisible.value) {
    return 1
  }
  if (isDragging.value) {
    return 1.08
  }
  if (motionPhase.value === 'emerge') {
    return 1.06
  }
  if (motionActive.value) {
    return 1.03
  }
  return 1
})

const glassFilter = computed(() => {
  const shadow = 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.08))'
  if (isDarkMode.value) {
    return motionActive.value ? `${shadow} brightness(0.98)` : shadow
  }

  return motionActive.value ? `${shadow} brightness(1.02)` : shadow
})

const blurWrapStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  const { width, height, x, y } = currentRect.value
  const v = velocity.value
  const speed = Math.hypot(v.x, v.y)
  const imp = impact.value

  let stretchX = 1
  let stretchY = 1

  if (props.elastic && motionActive.value && speed > 3) {
    const dragBoost = isDragging.value ? 1.8 : 1.0
    const stretch = Math.min(speed / 100, 0.6) * dragBoost
    stretchX = 1 - stretch * 0.35
    stretchY = 1 + stretch * 0.6
  }

  if (props.elastic && imp > 0.01) {
    const squash = imp * 0.7
    if (impactAxis.value === 'x') {
      stretchX = stretchX * (1 + squash * 0.5)
      stretchY = stretchY * (1 - squash * 0.4)
    }
    else {
      stretchY = stretchY * (1 + squash * 0.5)
      stretchX = stretchX * (1 - squash * 0.4)
    }
  }

  const phaseScale = glassPhaseScale.value
  const baseScale = activeScale.value
  let scaleX = baseScale * phaseScale * stretchX
  let scaleY = baseScale * phaseScale * stretchY

  scaleX = Math.max(0, Math.min(2, scaleX))
  scaleY = Math.max(0, Math.min(2, scaleY))

  const blurOpacity = motionActive.value ? 1 : 0

  const blurPx = motionActive.value ? props.blurAmount : 0

  return {
    opacity: `${blurOpacity}`,
    width: `${width}px`,
    height: `${height}px`,
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
  }
})

const plainIndicatorStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  const { width, height, x, y } = currentRect.value
  const v = velocity.value
  const speed = Math.hypot(v.x, v.y)
  const imp = impact.value

  let stretchX = 1
  let stretchY = 1

  if (props.elastic && motionActive.value && speed > 3) {
    const dragBoost = isDragging.value ? 1.8 : 1.0
    const stretch = Math.min(speed / 100, 0.6) * dragBoost
    stretchX = 1 - stretch * 0.35
    stretchY = 1 + stretch * 0.6
  }

  if (props.elastic && imp > 0.01) {
    const squash = imp * 0.7
    if (impactAxis.value === 'x') {
      stretchX = stretchX * (1 + squash * 0.5)
      stretchY = stretchY * (1 - squash * 0.4)
    }
    else {
      stretchY = stretchY * (1 + squash * 0.5)
      stretchX = stretchX * (1 - squash * 0.4)
    }
  }

  const phaseScale = props.elastic ? glassPhaseScale.value : 1
  const baseScale = activeScale.value
  let scaleX = baseScale * phaseScale * stretchX
  let scaleY = baseScale * phaseScale * stretchY

  scaleX = Math.max(0, Math.min(2, scaleX))
  scaleY = Math.max(0, Math.min(2, scaleY))

  const baseOpacity = (props.glass || props.blur) && motionActive.value ? '0' : '1'

  return {
    opacity: baseOpacity,
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
  }
})

const hitStyle = computed<Record<string, string>>(() => {
  if (!indicatorVisible.value) {
    return { opacity: '0' }
  }

  const { width, height, x, y } = currentRect.value
  return {
    opacity: '0',
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${x}px, ${y}px, 0) scale(1.08)`,
  }
})

/**
 * Stop and reset animation loop.
 */
function stopMotion() {
  if (motionRaf != null)
    cancelAnimationFrame(motionRaf)
  motionRaf = null
  motionLastTs = null
  isAnimating.value = false
}

function cancelMotionRaf() {
  if (motionRaf != null)
    cancelAnimationFrame(motionRaf)
  motionRaf = null
  motionLastTs = null
}

function setMotionPhase(next: 'idle' | 'emerge' | 'sink', ttl = 0) {
  motionPhase.value = next
  if (motionPhaseTimer != null) {
    clearTimeout(motionPhaseTimer)
    motionPhaseTimer = null
  }
  if (ttl > 0) {
    motionPhaseTimer = setTimeout(() => {
      motionPhase.value = 'idle'
      motionPhaseTimer = null
    }, ttl)
  }
}

function startMotion() {
  if (motionRaf != null) {
    return
  }
  isAnimating.value = true
  if (!isDragging.value)
    setMotionPhase('emerge', 170)
  motionRaf = requestAnimationFrame(stepMotion)
}

/**
 * Advance indicator motion each frame.
 */
function stepMotion(ts: number) {
  if (motionLastTs == null)
    motionLastTs = ts
  const dt = Math.min((ts - motionLastTs) / 1000, 0.024)
  motionLastTs = ts

  const t = targetRect.value
  const c = currentRect.value
  const v = velocity.value

  const dx = t.x - c.x
  const dy = t.y - c.y
  const dw = t.width - c.width
  const dh = t.height - c.height

  if (isDragging.value) {
    v.x *= Math.exp(-dt * 6)
    v.y *= Math.exp(-dt * 6)
    v.w += (dw * stiffnessDrag * 1.12 - v.w * dampingDrag) * dt
    v.h += (dh * stiffnessDrag * 1.12 - v.h * dampingDrag) * dt
    velocity.value = { ...v }
    impact.value *= Math.exp(-dt * 7.4)
    motionRaf = requestAnimationFrame(stepMotion)
    return
  }

  if (!props.elastic) {
    const follow = 34
    const alpha = 1 - Math.exp(-follow * dt)

    const nx = c.x + dx * alpha
    const ny = c.y + dy * alpha
    const nw = c.width + dw * alpha
    const nh = c.height + dh * alpha

    currentRect.value = { x: nx, y: ny, width: nw, height: nh }
    velocity.value = {
      x: (nx - c.x) / Math.max(dt, 0.001),
      y: (ny - c.y) / Math.max(dt, 0.001),
      w: (nw - c.width) / Math.max(dt, 0.001),
      h: (nh - c.height) / Math.max(dt, 0.001),
    }
    impact.value = 0

    const settled
      = Math.abs(t.x - nx) < 0.35
        && Math.abs(t.y - ny) < 0.35
        && Math.abs(t.width - nw) < 0.35
        && Math.abs(t.height - nh) < 0.35

    if (settled) {
      currentRect.value = { ...t }
      velocity.value = { x: 0, y: 0, w: 0, h: 0 }
      cancelMotionRaf()
      setMotionPhase('sink', 18)
      setTimeout(() => {
        isAnimating.value = false
      }, 18)
      return
    }

    motionRaf = requestAnimationFrame(stepMotion)
    return
  }

  const prevDx = dx + v.x * dt
  const prevDy = dy + v.y * dt

  const phaseStiffnessScale = motionPhase.value === 'emerge' ? 0.62 : 1
  const springStiffness = stiffnessIdle.value * phaseStiffnessScale
  const springDamping = dampingIdle.value

  v.x += (dx * springStiffness - v.x * springDamping) * dt
  v.y += (dy * springStiffness - v.y * springDamping) * dt
  v.w += (dw * springStiffness * 1.12 - v.w * springDamping) * dt
  v.h += (dh * springStiffness * 1.12 - v.h * springDamping) * dt

  const nx = c.x + v.x * dt
  const ny = c.y + v.y * dt
  const nw = c.width + v.w * dt
  const nh = c.height + v.h * dt

  const nextDx = t.x - nx
  const nextDy = t.y - ny

  if ((prevDx > 0 && nextDx < 0) || (prevDx < 0 && nextDx > 0) || (prevDy > 0 && nextDy < 0) || (prevDy < 0 && nextDy > 0)) {
    const speed = Math.hypot(v.x, v.y)
    if (speed > 30) {
      impactAxis.value = Math.abs(v.x) >= Math.abs(v.y) ? 'x' : 'y'
      impact.value = Math.min(1, Math.max(impact.value, speed / 300))
    }
  }

  impact.value *= Math.exp(-dt * 4)

  currentRect.value = { x: nx, y: ny, width: nw, height: nh }
  velocity.value = { ...v }

  const settled
    = Math.abs(nextDx) < 0.25
      && Math.abs(nextDy) < 0.25
      && Math.abs(dw) < 0.25
      && Math.abs(dh) < 0.25
      && Math.abs(v.x) < 8
      && Math.abs(v.y) < 8
      && Math.abs(v.w) < 8
      && Math.abs(v.h) < 8

  if (settled) {
    currentRect.value = { ...t }
    velocity.value = { x: 0, y: 0, w: 0, h: 0 }
    impact.value = 0
    cancelMotionRaf()
    setMotionPhase('sink', 32)
    setTimeout(() => {
      isAnimating.value = false
    }, 32)
    return
  }

  motionRaf = requestAnimationFrame(stepMotion)
}

/**
 * Sync target rect with currently checked button.
 */
function updateIndicator() {
  if (type.value !== 'button') {
    return
  }
  const root = groupRef.value
  if (!root) {
    return
  }

  const checked = root.querySelector<HTMLElement>('.tx-radio.tx-radio--button.is-checked')
  if (!checked) {
    indicatorVisible.value = false
    return
  }

  const rootRect = root.getBoundingClientRect()
  const rect = checked.getBoundingClientRect()
  const left = rect.left - rootRect.left
  const top = rect.top - rootRect.top

  indicatorVisible.value = true
  const next = {
    width: rect.width + overscan * 2,
    height: rect.height + overscan * 2,
    x: left - overscan,
    y: top - overscan,
  }
  targetRect.value = next
  if (!motionActive.value && currentRect.value.width === 0 && currentRect.value.height === 0) {
    currentRect.value = next
  }
  startMotion()
}

function queueUpdateIndicator() {
  if (indicatorRaf != null)
    cancelAnimationFrame(indicatorRaf)
  indicatorRaf = requestAnimationFrame(() => {
    indicatorRaf = null
    updateIndicator()
  })
}

/**
 * Track pointer drag motion.
 */
function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) {
    return
  }
  const now = performance.now()
  const dt = Math.max((now - lastPointer.ts) / 1000, 0.001)
  lastPointerVelocity = {
    x: (e.clientX - lastPointer.x) / dt,
    y: (e.clientY - lastPointer.y) / dt,
  }
  lastPointer = { x: e.clientX, y: e.clientY, ts: now }

  const root = groupRef.value
  if (!root) {
    return
  }
  const r = root.getBoundingClientRect()
  const width = currentRect.value.width || targetRect.value.width || 0
  const height = currentRect.value.height || targetRect.value.height || 0

  const maxX = Math.max(0, r.width - width)
  const unclampedX = e.clientX - r.left - width / 2
  const px = Math.min(Math.max(unclampedX, 0), maxX)
  const baseY = dragLockY.value ?? (currentRect.value.y || targetRect.value.y || 0)
  const py = Math.min(Math.max(baseY, 0), Math.max(0, r.height - height))
  const next = { x: px, y: py, width: Math.max(0, width), height: Math.max(0, height) }
  targetRect.value = next

  currentRect.value = {
    ...currentRect.value,
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
  }

  velocity.value = {
    ...velocity.value,
    x: lastPointerVelocity.x,
    y: 0,
  }

  if ((px === 0 || px === maxX) && Math.abs(lastPointerVelocity.x) > 520) {
    impactAxis.value = 'x'
    impact.value = Math.max(impact.value, 0.92)
  }
}

function endDrag() {
  if (!isDragging.value) {
    return
  }
  isDragging.value = false
  dragLockY.value = null

  const root = groupRef.value
  if (root) {
    const currentX = currentRect.value.x + currentRect.value.width / 2
    const radios = root.querySelectorAll<HTMLButtonElement>('button.tx-radio.tx-radio--button:not([disabled])')
    let closest: HTMLButtonElement | null = null
    let minDist = Infinity
    const rootRect = root.getBoundingClientRect()
    for (const radio of radios) {
      const rect = radio.getBoundingClientRect()
      const centerX = rect.left - rootRect.left + rect.width / 2
      const dist = Math.abs(centerX - currentX)
      if (dist < minDist) {
        minDist = dist
        closest = radio
      }
    }
    if (closest && closest.getAttribute('aria-checked') !== 'true') {
      closest.click()
    }
  }

  const v = velocity.value
  velocity.value = {
    ...v,
    x: v.x + lastPointerVelocity.x * 0.14,
    y: v.y,
  }

  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  queueUpdateIndicator()
  startMotion()
}

function onPointerUp() {
  endDrag()
}

function onPointerDown(e: PointerEvent) {
  if (type.value !== 'button') {
    return
  }
  if (disabled.value) {
    return
  }
  if (e.button !== 0) {
    return
  }
  if (!indicatorVisible.value) {
    return
  }

  const target = e.currentTarget as HTMLElement | null
  if (!target) {
    return
  }

  target.setPointerCapture?.(e.pointerId)
  isDragging.value = true
  dragLockY.value = currentRect.value.y || targetRect.value.y || 0
  setMotionPhase('emerge', 110)

  const now = performance.now()
  lastPointer = { x: e.clientX, y: e.clientY, ts: now }
  lastPointerVelocity = { x: 0, y: 0 }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  startMotion()
}

const ctx = {
  model,
  disabled: computed(() => disabled.value),
  type: computed(() => type.value),
}

provide('tx-radio-group', ctx)

onMounted(async () => {
  cleanupDarkMode = updateDarkMode()
  await nextTick()
  queueUpdateIndicator()
  window.addEventListener('resize', queueUpdateIndicator)
})

onBeforeUnmount(() => {
  if (indicatorRaf != null)
    cancelAnimationFrame(indicatorRaf)
  window.removeEventListener('resize', queueUpdateIndicator)
  stopMotion()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  if (motionPhaseTimer != null)
    clearTimeout(motionPhaseTimer)
  cleanupDarkMode?.()
})

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    queueUpdateIndicator()
  },
  { flush: 'post' },
)

watch(
  type,
  async () => {
    await nextTick()
    queueUpdateIndicator()
  },
  { flush: 'post' },
)
</script>

<template>
  <div
    ref="groupRef"
    class="tx-radio-group"
    role="radiogroup"
    :aria-disabled="disabled"
    :class="[`tx-radio-group--${type}`, `tx-radio-group--dir-${resolvedDirection}`, { 'is-motion': motionActive }]"
  >
    <span v-if="type === 'button'" class="tx-radio-group__indicator-outline" :style="outlineStyle" aria-hidden="true" />

    <TxGlassSurface
      v-if="type === 'button' && glass && indicatorVisible"
      class="tx-radio-group__indicator-glass-wrap"
      :class="{ 'is-active': motionActive, 'is-sink': motionPhase === 'sink', 'is-emerge': motionPhase === 'emerge' }"
      :style="glassWrapStyle"
      :width="currentRect.width || 1"
      :height="currentRect.height || 1"
      :border-radius="glassRadius"
      :border-width="8"
      :brightness="glassLook.brightness"
      :opacity="glassLook.opacity"
      :blur="2"
      :displace="0.25"
      :background-opacity="glassLook.backgroundOpacity"
      :saturation="glassLook.saturation"
      :distortion-scale="2"
      :red-offset="0"
      :green-offset="4"
      :blue-offset="8"
      aria-hidden="true"
    >
      <div class="tx-radio-group__indicator-glass-inner" :style="glassInnerStyle" />
    </TxGlassSurface>

    <span
      v-if="type === 'button' && blur && !glass && indicatorVisible"
      class="tx-radio-group__indicator-blur"
      :class="{ 'is-active': motionActive }"
      :style="blurWrapStyle"
      aria-hidden="true"
    />

    <span
      v-if="type === 'button' && indicatorVisible"
      class="tx-radio-group__indicator-plain"
      :class="{ 'is-active': motionActive }"
      :style="plainIndicatorStyle"
      aria-hidden="true"
    />

    <span
      v-if="type === 'button' && indicatorVisible"
      class="tx-radio-group__indicator-hit"
      :class="{ 'is-dragging': isDragging }"
      :style="hitStyle"
      aria-hidden="true"
      @pointerdown="onPointerDown"
    />
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-radio-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  touch-action: none;

  &--button {
    padding: 3px;
    gap: 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  }

  &--standard {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
  }

  &--card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 0;
    border: none;
    background: transparent;
  }
}

.tx-radio-group--standard.tx-radio-group--dir-row,
.tx-radio-group--card.tx-radio-group--dir-row {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.tx-radio-group__indicator-outline {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0));
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 55%, transparent);
  // box-shadow:
  //   0 10px 18px rgba(15, 23, 42, 0.08),
  //   inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transition: opacity 40ms ease;
  pointer-events: none;
  z-index: 0;
}

.tx-radio-group__indicator-glass-wrap {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 10;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 80%, transparent);
  will-change: transform, opacity;
  transition: opacity 40ms ease, filter 40ms ease;
  opacity: 0;
}

.tx-radio-group__indicator-glass-wrap.is-active {
  opacity: 1;
}

.tx-radio-group__indicator-glass-inner {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  transition: transform 120ms ease;
  background:
    radial-gradient(ellipse 80% 60% at 20% 15%, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 55%),
    radial-gradient(ellipse 50% 40% at 75% 80%, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0) 50%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 60%);
}

.tx-radio-group__indicator-blur {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
  will-change: transform, opacity, backdrop-filter;
  transition: opacity 40ms ease, box-shadow 40ms ease, backdrop-filter 55ms ease, -webkit-backdrop-filter 55ms ease;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 40%, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tx-radio-group__indicator-blur.is-active {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.tx-radio-group__indicator-plain {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  pointer-events: none;
  z-index: 0;
  will-change: transform, opacity;
  transition: opacity 40ms ease, box-shadow 40ms ease;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 50%, transparent);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.17);
}

// .tx-radio-group__indicator-plain.is-active {
//   box-shadow:
//     0 10px 20px rgba(15, 23, 42, 0.12),
//     inset 0 1px 0 rgba(255, 255, 255, 0.75);
// }

.tx-radio-group__indicator-hit {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  cursor: grab;
  z-index: 2;
}

.tx-radio-group__indicator-hit.is-dragging {
  pointer-events: none;
}

.tx-radio-group__indicator-hit:active {
  cursor: grabbing;
}

.tx-radio-group--button :deep(.tx-radio) {
  position: relative;
  z-index: 1;
}
</style>
