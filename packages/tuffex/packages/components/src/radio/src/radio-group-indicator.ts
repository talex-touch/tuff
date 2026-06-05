import type { ComputedRef, Ref } from 'vue'
import type { TxRadioGroupProps, TxRadioType } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'

type IndicatorRect = {
  width: number
  height: number
  x: number
  y: number
}

type IndicatorVelocity = {
  x: number
  y: number
  w: number
  h: number
}

type MotionPhase = 'idle' | 'emerge' | 'sink'

interface UseRadioGroupIndicatorOptions {
  props: Readonly<TxRadioGroupProps>
  groupRef: Ref<HTMLElement | null>
  type: Ref<TxRadioType>
  disabled: Ref<boolean>
  modelValue: ComputedRef<unknown>
  commitPendingModelValue: () => void
}

const overscan = 0
const stiffnessDrag = 112
const dampingDrag = 9.0

function hiddenStyle(): Record<string, string> {
  return { opacity: '0' }
}

export function useRadioGroupIndicator(options: UseRadioGroupIndicatorOptions) {
  const { props, groupRef, type, disabled, modelValue, commitPendingModelValue } = options

  const indicatorVisible = ref(false)
  const targetRect = ref<IndicatorRect>({ width: 0, height: 0, x: 0, y: 0 })
  const currentRect = ref<IndicatorRect>({ width: 0, height: 0, x: 0, y: 0 })
  const velocity = ref<IndicatorVelocity>({ x: 0, y: 0, w: 0, h: 0 })
  const impact = ref(0)
  const impactAxis = ref<'x' | 'y'>('x')

  const isDragging = ref(false)
  const isAnimating = ref(false)
  const motionPhase = ref<MotionPhase>('idle')
  const dragLockY = ref<number | null>(null)
  const isDarkMode = ref(false)

  let motionPhaseTimer: ReturnType<typeof setTimeout> | null = null
  let indicatorRaf: number | null = null
  let motionRaf: number | null = null
  let motionLastTs: number | null = null
  let lastPointer = { x: 0, y: 0, ts: 0 }
  let lastPointerVelocity = { x: 0, y: 0 }
  let cleanupDarkMode: (() => void) | undefined

  const motionActive = computed(() => isDragging.value || isAnimating.value)
  const stiffnessIdle = computed(() => props.stiffness ?? 150)
  const dampingIdle = computed(() => props.damping ?? 8)

  function updateDarkMode(): (() => void) | undefined {
    if (!hasWindow()) {
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

  function getElasticScale(enableElastic: boolean) {
    const v = velocity.value
    const speed = Math.hypot(v.x, v.y)
    const imp = impact.value

    let stretchX = 1
    let stretchY = 1

    if (enableElastic && motionActive.value && speed > 3) {
      const dragBoost = isDragging.value ? 1.8 : 1.0
      const stretch = Math.min(speed / 100, 0.6) * dragBoost
      stretchX = 1 - stretch * 0.35
      stretchY = 1 + stretch * 0.6
    }

    if (enableElastic && imp > 0.01) {
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

    const phaseScale = enableElastic ? glassPhaseScale.value : 1
    const baseScale = activeScale.value
    return {
      scaleX: Math.max(0, Math.min(2, baseScale * phaseScale * stretchX)),
      scaleY: Math.max(0, Math.min(2, baseScale * phaseScale * stretchY)),
    }
  }

  const outlineStyle = computed<Record<string, string>>(() => {
    if (!indicatorVisible.value || motionActive.value) {
      return hiddenStyle()
    }

    const { width, height, x, y } = currentRect.value
    return {
      opacity: '1',
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate3d(${x}px, ${y}px, 0)`,
    }
  })

  const glassOpacity = computed(() => {
    if (!indicatorVisible.value || !motionActive.value) {
      return 0
    }
    if (motionPhase.value === 'emerge') {
      return 0.95
    }
    if (motionPhase.value === 'sink') {
      return 0.28
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

  const glassWrapStyle = computed<Record<string, string>>(() => {
    if (!indicatorVisible.value) {
      return hiddenStyle()
    }

    const { width, height, x, y } = currentRect.value
    const { scaleX, scaleY } = getElasticScale(true)

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
      return hiddenStyle()
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

  const blurWrapStyle = computed<Record<string, string>>(() => {
    if (!indicatorVisible.value) {
      return hiddenStyle()
    }

    const { width, height, x, y } = currentRect.value
    const { scaleX, scaleY } = getElasticScale(props.elastic ?? true)
    const blurEnabled = motionActive.value
    const blurOpacity = blurEnabled ? 1 : 0
    const blurPx = blurEnabled ? props.blurAmount : 0

    return {
      opacity: `${blurOpacity}`,
      width: `${width}px`,
      height: `${height}px`,
      backdropFilter: blurEnabled ? `blur(${blurPx}px)` : 'none',
      WebkitBackdropFilter: blurEnabled ? `blur(${blurPx}px)` : 'none',
      transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
    }
  })

  const plainIndicatorStyle = computed<Record<string, string>>(() => {
    if (!indicatorVisible.value) {
      return hiddenStyle()
    }

    const { width, height, x, y } = currentRect.value
    const { scaleX, scaleY } = getElasticScale(props.elastic ?? true)

    return {
      opacity: '1',
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
    }
  })

  const hitStyle = computed<Record<string, string>>(() => {
    if (!indicatorVisible.value) {
      return hiddenStyle()
    }

    const { width, height, x, y } = currentRect.value
    return {
      opacity: '0',
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate3d(${x}px, ${y}px, 0) scale(1.08)`,
    }
  })

  function cancelMotionRaf() {
    if (motionRaf != null)
      cancelAnimationFrame(motionRaf)
    motionRaf = null
    motionLastTs = null
  }

  function stopMotion() {
    cancelMotionRaf()
    isAnimating.value = false
  }

  function setMotionPhase(next: MotionPhase, ttl = 0) {
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

  function settleMotion(ms: number) {
    commitPendingModelValue()
    cancelMotionRaf()
    setMotionPhase('sink', ms)
    setTimeout(() => {
      isAnimating.value = false
    }, ms)
  }

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
        settleMotion(18)
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
      settleMotion(32)
      return
    }

    motionRaf = requestAnimationFrame(stepMotion)
  }

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

  function onPointerUp() {
    endDrag()
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

  function getEnabledRadios(): HTMLButtonElement[] {
    const root = groupRef.value
    if (!root) {
      return []
    }
    return Array.from(root.querySelectorAll<HTMLButtonElement>('button.tx-radio[role="radio"]:not([disabled])'))
  }

  function resolveKeyboardTargetIndex(key: string, currentIndex: number, count: number): number {
    if (count <= 0) {
      return -1
    }
    if (key === 'Home') {
      return 0
    }
    if (key === 'End') {
      return count - 1
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      return currentIndex >= 0 ? (currentIndex + 1) % count : 0
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      return currentIndex >= 0 ? (currentIndex - 1 + count) % count : count - 1
    }
    return -1
  }

  function onKeydown(e: KeyboardEvent) {
    if (disabled.value) {
      return
    }

    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      return
    }

    const radios = getEnabledRadios()
    if (radios.length <= 0) {
      return
    }

    e.preventDefault()
    const activeElement = document.activeElement
    const currentIndex = radios.findIndex((radio) => {
      return radio.getAttribute('aria-checked') === 'true' || radio === activeElement
    })
    const nextIndex = resolveKeyboardTargetIndex(e.key, currentIndex, radios.length)
    const next = nextIndex >= 0 ? radios[nextIndex] : undefined
    if (!next) {
      return
    }

    next.focus()
    next.click()
  }

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
    modelValue,
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

  return {
    indicatorVisible,
    currentRect,
    isDragging,
    motionPhase,
    motionActive,
    outlineStyle,
    glassWrapStyle,
    glassInnerStyle,
    glassRadius,
    glassLook,
    blurWrapStyle,
    plainIndicatorStyle,
    hitStyle,
    onPointerDown,
    onKeydown,
  }
}
