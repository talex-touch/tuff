import type { ComputedRef, Ref } from 'vue'
import type { TxRadioGroupProps, TxRadioType } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { useJellyIndicator } from '../../../../utils/use-jelly-indicator'

interface UseRadioGroupIndicatorOptions {
  props: Readonly<TxRadioGroupProps>
  groupRef: Ref<HTMLElement | null>
  type: Ref<TxRadioType>
  disabled: Ref<boolean>
  modelValue: ComputedRef<unknown>
  commitPendingModelValue: () => void
}

const overscan = 0

function hiddenStyle(): Record<string, string> {
  return { opacity: '0' }
}

export function useRadioGroupIndicator(options: UseRadioGroupIndicatorOptions) {
  const { props, groupRef, type, disabled, modelValue, commitPendingModelValue } = options

  // The motion is the shared jelly indicator, which was lifted out of this
  // file; what stays here is Radio's own measuring, its layers and the drag.
  // The group always passes defaulted props (110 / 12, the `JELLY` spring), so
  // the engine's own fallbacks never fire.
  const engine = useJellyIndicator({
    axis: 'x',
    elastic: () => props.elastic ?? true,
    stiffness: () => props.stiffness,
    damping: () => props.damping,
    onSettle: commitPendingModelValue,
  })

  const indicatorVisible = engine.visible
  const currentRect = engine.rect
  const isDragging = engine.dragging
  const motionPhase = engine.phase
  const motionActive = engine.moving

  const dragLockY = ref<number | null>(null)
  const isDarkMode = ref(false)

  let indicatorRaf: number | null = null
  let pendingAnimate = false
  let lastPointer = { x: 0, y: 0, ts: 0 }
  let lastPointerVelocity = { x: 0, y: 0 }
  let cleanupDarkMode: (() => void) | undefined

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
    // Glass always deforms, even with `elastic` off: it only shows while moving.
    const { scaleX, scaleY } = engine.scaleFor(true)

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

    const v = engine.velocity.value
    const speed = Math.hypot(v.x, v.y)
    const impact = engine.impact.value

    let scaleX = 1
    let scaleY = 1

    if (motionActive.value && speed > 50) {
      const stretch = Math.min(speed / 400, 0.3)
      scaleX = 1 + stretch * 0.5
      scaleY = 1 - stretch * 0.25
    }

    if (impact > 0.01) {
      const squash = impact * 0.6
      if (engine.impactAxis.value === 'x') {
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
    const { scaleX, scaleY } = engine.scale.value
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
    const { scaleX, scaleY } = engine.scale.value

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

  function updateIndicator(animate: boolean) {
    if (type.value !== 'button') {
      return
    }
    const root = groupRef.value
    if (!root) {
      return
    }

    const checked = root.querySelector<HTMLElement>('.tx-radio.tx-radio--button.is-checked')
    if (!checked) {
      engine.moveTo(null)
      return
    }

    // The indicator is absolutely positioned inside the group's *padding* box,
    // but both rects here are border boxes. The group's 1px border would
    // otherwise push the indicator 1px down and right of the button it covers.
    const rootRect = root.getBoundingClientRect()
    const rect = checked.getBoundingClientRect()
    const left = rect.left - rootRect.left - root.clientLeft
    const top = rect.top - rootRect.top - root.clientTop

    engine.moveTo({
      width: rect.width + overscan * 2,
      height: rect.height + overscan * 2,
      x: left - overscan,
      y: top - overscan,
    }, { animate })
  }

  // A selection travels; a mount, a resize or a type switch lands in place.
  // Requests coalesce into one frame, and travel wins if any of them asked for it.
  function queueUpdateIndicator(animate: boolean) {
    pendingAnimate = pendingAnimate || animate
    if (indicatorRaf != null)
      cancelAnimationFrame(indicatorRaf)
    indicatorRaf = requestAnimationFrame(() => {
      indicatorRaf = null
      const shouldAnimate = pendingAnimate
      pendingAnimate = false
      updateIndicator(shouldAnimate)
    })
  }

  function onResize() {
    queueUpdateIndicator(false)
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
    const target = engine.target.value
    const width = currentRect.value.width || target.width || 0
    const height = currentRect.value.height || target.height || 0

    // Padding-box coordinates, like `updateIndicator`: the origin sits inside
    // the border and the travel is the client box, not the border box.
    const maxX = Math.max(0, root.clientWidth - width)
    const unclampedX = e.clientX - (r.left + root.clientLeft) - width / 2
    const px = Math.min(Math.max(unclampedX, 0), maxX)
    const baseY = dragLockY.value ?? (currentRect.value.y || target.y || 0)
    const py = Math.min(Math.max(baseY, 0), Math.max(0, root.clientHeight - height))

    engine.drag(
      { x: px, y: py, width: Math.max(0, width), height: Math.max(0, height) },
      { x: lastPointerVelocity.x, y: 0 },
      { atEdge: px === 0 || px === maxX },
    )
  }

  function onPointerUp() {
    endDrag()
  }

  function removeDragListeners() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }

  function endDrag() {
    if (!isDragging.value) {
      return
    }
    dragLockY.value = null
    engine.release({ x: lastPointerVelocity.x, y: 0 })

    const root = groupRef.value
    if (root) {
      const currentX = currentRect.value.x + currentRect.value.width / 2
      const radios = root.querySelectorAll<HTMLButtonElement>('button.tx-radio.tx-radio--button:not([disabled])')
      let closest: HTMLButtonElement | null = null
      let minDist = Infinity
      const rootRect = root.getBoundingClientRect()
      for (const radio of radios) {
        const rect = radio.getBoundingClientRect()
        // Same padding-box origin as the indicator's own x.
        const centerX = rect.left - rootRect.left - root.clientLeft + rect.width / 2
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

    removeDragListeners()
    queueUpdateIndicator(true)
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
    dragLockY.value = currentRect.value.y || engine.target.value.y || 0
    engine.grab()

    const now = performance.now()
    lastPointer = { x: e.clientX, y: e.clientY, ts: now }
    lastPointerVelocity = { x: 0, y: 0 }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
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
    queueUpdateIndicator(false)
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    if (indicatorRaf != null)
      cancelAnimationFrame(indicatorRaf)
    window.removeEventListener('resize', onResize)
    removeDragListeners()
    cleanupDarkMode?.()
  })

  watch(
    modelValue,
    async () => {
      await nextTick()
      queueUpdateIndicator(true)
    },
    { flush: 'post' },
  )

  watch(
    type,
    async () => {
      await nextTick()
      queueUpdateIndicator(false)
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
