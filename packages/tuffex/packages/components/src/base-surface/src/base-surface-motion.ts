import type { ComputedRef, Ref } from 'vue'
import type { BaseSurfaceProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { clamp, smoothstep01 } from './base-surface-math'

export const SURFACE_MOTION_DURATION_MS = 299
export const REFRACTION_PARAM_BLEND_DURATION_MS = 182
export const REFRACTION_MASK_RELEASE_DELAY_AFTER_FALLBACK_MS = 100
export const REFRACTION_RECOVERY_DURATION_FACTOR = 0.7
export const REFRACTION_MASK_RELEASE_DURATION_MS = Math.round(650 * REFRACTION_RECOVERY_DURATION_FACTOR)
export const REFRACTION_MASK_PEAK_OPACITY = 0.95
export const REFRACTION_MASK_PEAK_RAMP_DURATION_MS = 180
export const REFRACTION_EDGE_REVEAL_DELAY_MS = 60
export const REFRACTION_EDGE_REVEAL_DURATION_MS = 220
export const REFRACTION_MASK_RELEASE_SLOWDOWN = 1.2
export const REFRACTION_MOVING_PARAM_FLOOR = 0.28

interface UseBaseSurfaceMotionOptions {
  props: Readonly<BaseSurfaceProps>
  rootRef: Ref<HTMLElement | null>
  needsFallback: ComputedRef<boolean>
  settleDelayMs: ComputedRef<number>
  refractionRecoveryBlendDurationMs: ComputedRef<number>
  refractionRecoveryTotalDurationMs: ComputedRef<number>
}

export function useBaseSurfaceMotion(options: UseBaseSurfaceMotionOptions) {
  const { props, rootRef, needsFallback, settleDelayMs, refractionRecoveryBlendDurationMs, refractionRecoveryTotalDurationMs } = options

  const autoMoving = ref(false)
  const settling = ref(false)
  const refractionRecovering = ref(false)
  const refractionRecoveryProgress = ref(1)
  const refractionRecoveryElapsed = ref(0)
  const refractionMaskPeakRampProgress = ref(1)
  const refractionEdgeRevealProgress = ref(1)

  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let mutationObserver: MutationObserver | null = null
  let observedElements: HTMLElement[] = []
  let refractionRecoveryRaf: number | null = null
  let refractionMaskPeakRampRaf: number | null = null
  let refractionEdgeRevealRaf: number | null = null
  let refractionEdgeRevealTimer: ReturnType<typeof setTimeout> | null = null

  const isMoving = computed(() => props.moving || autoMoving.value)

  function stopRefractionEdgeReveal(resetProgress = true) {
    if (refractionEdgeRevealTimer != null) {
      clearTimeout(refractionEdgeRevealTimer)
      refractionEdgeRevealTimer = null
    }
    if (refractionEdgeRevealRaf != null) {
      cancelAnimationFrame(refractionEdgeRevealRaf)
      refractionEdgeRevealRaf = null
    }
    if (resetProgress) {
      refractionEdgeRevealProgress.value = 1
    }
  }

  function hideRefractionEdge() {
    stopRefractionEdgeReveal(false)
    refractionEdgeRevealProgress.value = 0
  }

  function startRefractionEdgeReveal() {
    if (props.mode !== 'refraction') {
      refractionEdgeRevealProgress.value = 1
      return
    }
    if (!hasWindow()) {
      refractionEdgeRevealProgress.value = 1
      return
    }

    stopRefractionEdgeReveal(false)
    refractionEdgeRevealProgress.value = 0
    refractionEdgeRevealTimer = setTimeout(() => {
      refractionEdgeRevealTimer = null
      const total = Math.max(80, REFRACTION_EDGE_REVEAL_DURATION_MS)
      let startedAt = 0
      const tick = (timestamp: number) => {
        if (!startedAt) {
          startedAt = timestamp
        }
        const elapsed = timestamp - startedAt
        const progress = clamp(elapsed / total, 0, 1)
        refractionEdgeRevealProgress.value = smoothstep01(progress)
        if (progress >= 1 || isMoving.value || refractionRecovering.value) {
          if (isMoving.value || refractionRecovering.value) {
            refractionEdgeRevealProgress.value = 0
          }
          else {
            refractionEdgeRevealProgress.value = 1
          }
          refractionEdgeRevealRaf = null
          return
        }
        refractionEdgeRevealRaf = requestAnimationFrame(tick)
      }
      refractionEdgeRevealRaf = requestAnimationFrame(tick)
    }, Math.max(0, REFRACTION_EDGE_REVEAL_DELAY_MS))
  }

  function stopRefractionMaskPeakRamp(resetProgress = true) {
    if (refractionMaskPeakRampRaf != null) {
      cancelAnimationFrame(refractionMaskPeakRampRaf)
      refractionMaskPeakRampRaf = null
    }
    if (resetProgress) {
      refractionMaskPeakRampProgress.value = 1
    }
  }

  function startRefractionMaskPeakRamp() {
    if (props.mode !== 'refraction') {
      refractionMaskPeakRampProgress.value = 1
      return
    }
    if (!hasWindow()) {
      refractionMaskPeakRampProgress.value = 1
      return
    }

    stopRefractionMaskPeakRamp(false)
    refractionMaskPeakRampProgress.value = 0

    const total = Math.max(40, REFRACTION_MASK_PEAK_RAMP_DURATION_MS)
    let startedAt = 0

    const tick = (timestamp: number) => {
      if (!startedAt) {
        startedAt = timestamp
      }
      const elapsed = timestamp - startedAt
      const progress = clamp(elapsed / total, 0, 1)
      refractionMaskPeakRampProgress.value = smoothstep01(progress)
      if (progress >= 1 || !isMoving.value) {
        refractionMaskPeakRampProgress.value = 1
        refractionMaskPeakRampRaf = null
        return
      }
      refractionMaskPeakRampRaf = requestAnimationFrame(tick)
    }

    refractionMaskPeakRampRaf = requestAnimationFrame(tick)
  }

  function stopRefractionRecovery(resetProgress = true) {
    if (refractionRecoveryRaf != null) {
      cancelAnimationFrame(refractionRecoveryRaf)
      refractionRecoveryRaf = null
    }
    refractionRecovering.value = false
    refractionRecoveryElapsed.value = 0
    if (resetProgress) {
      refractionRecoveryProgress.value = 1
    }
  }

  function startRefractionRecovery() {
    if (props.mode !== 'refraction') {
      return
    }
    if (isMoving.value) {
      return
    }
    if (refractionRecovering.value) {
      return
    }
    if (!hasWindow()) {
      refractionRecovering.value = false
      refractionRecoveryProgress.value = 1
      refractionRecoveryElapsed.value = 0
      return
    }

    stopRefractionRecovery(false)
    refractionRecovering.value = true
    refractionRecoveryProgress.value = 0
    refractionRecoveryElapsed.value = 0

    const blendTotal = refractionRecoveryBlendDurationMs.value
    const total = refractionRecoveryTotalDurationMs.value
    let startedAt = 0

    const tick = (timestamp: number) => {
      if (!startedAt) {
        startedAt = timestamp
      }

      const elapsed = timestamp - startedAt
      refractionRecoveryElapsed.value = elapsed

      const progress = blendTotal <= 0
        ? 1
        : smoothstep01(elapsed / blendTotal)

      refractionRecoveryProgress.value = clamp(progress, 0, 1)

      if (elapsed >= total) {
        refractionRecovering.value = false
        refractionRecoveryProgress.value = 1
        refractionRecoveryElapsed.value = total
        refractionRecoveryRaf = null
        return
      }
      refractionRecoveryRaf = requestAnimationFrame(tick)
    }

    refractionRecoveryRaf = requestAnimationFrame(tick)
  }

  function startSettleTimer() {
    clearTimeout(settleTimer)
    settling.value = true
    settleTimer = setTimeout(() => {
      settling.value = false
    }, settleDelayMs.value)
  }

  function onTransformStart() {
    autoMoving.value = true
    clearTimeout(settleTimer)
    settling.value = false
    if (props.mode === 'refraction') {
      stopRefractionRecovery(false)
      refractionRecoveryProgress.value = 0
      refractionRecoveryElapsed.value = 0
    }
  }

  function onTransformEnd() {
    autoMoving.value = false
    if (props.mode === 'refraction') {
      startRefractionRecovery()
      return
    }
    startSettleTimer()
  }

  function handleTransitionStart(e: TransitionEvent) {
    if (e.propertyName === 'transform' || e.propertyName === 'translate') {
      onTransformStart()
    }
  }

  function handleTransitionEnd(e: TransitionEvent) {
    if (e.propertyName === 'transform' || e.propertyName === 'translate') {
      onTransformEnd()
    }
  }

  function hasTransformChanged(el: HTMLElement) {
    const transform = el.style.transform || el.style.getPropertyValue('transform')
    return transform && transform !== 'none' && transform !== ''
  }

  function setupAutoDetect() {
    if (!props.autoDetect || !hasWindow() || !rootRef.value) {
      return
    }

    const el = rootRef.value
    const targets: HTMLElement[] = []
    let current: HTMLElement | null = el
    while (current) {
      targets.push(current)
      current = current.parentElement
    }
    observedElements = targets

    for (const target of targets) {
      target.addEventListener('transitionstart', handleTransitionStart as EventListener)
      target.addEventListener('transitionend', handleTransitionEnd as EventListener)
      target.addEventListener('transitioncancel', handleTransitionEnd as EventListener)
    }

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement
          if (hasTransformChanged(target)) {
            onTransformStart()
          }
          else if (autoMoving.value) {
            onTransformEnd()
          }
        }
      }
    })

    for (const target of targets) {
      mutationObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
    }
  }

  function teardownAutoDetect() {
    for (const target of observedElements) {
      target.removeEventListener('transitionstart', handleTransitionStart as EventListener)
      target.removeEventListener('transitionend', handleTransitionEnd as EventListener)
      target.removeEventListener('transitioncancel', handleTransitionEnd as EventListener)
    }
    observedElements = []
    mutationObserver?.disconnect()
    mutationObserver = null
    clearTimeout(settleTimer)
    stopRefractionEdgeReveal()
    stopRefractionMaskPeakRamp()
    stopRefractionRecovery()
  }

  watch(() => props.moving, (newVal, oldVal) => {
    if (props.mode === 'refraction') {
      if (newVal) {
        stopRefractionRecovery(false)
        refractionRecoveryProgress.value = 0
        refractionRecoveryElapsed.value = 0
        return
      }
      if (oldVal && !newVal) {
        startRefractionRecovery()
      }
      return
    }
    if (oldVal && !newVal && needsFallback.value) {
      startSettleTimer()
    }
  })

  watch(isMoving, (moving, prevMoving) => {
    if (props.mode !== 'refraction') {
      stopRefractionMaskPeakRamp()
      stopRefractionEdgeReveal()
      return
    }
    if (moving && !prevMoving) {
      hideRefractionEdge()
      startRefractionMaskPeakRamp()
      return
    }
    if (!moving) {
      stopRefractionMaskPeakRamp()
    }
  }, { flush: 'sync' })

  watch(
    [isMoving, refractionRecovering, () => props.mode],
    ([moving, recovering, mode], [prevMoving, prevRecovering, prevMode]) => {
      if (mode !== 'refraction') {
        stopRefractionEdgeReveal()
        return
      }
      if (moving || recovering) {
        hideRefractionEdge()
        return
      }
      if (prevMode !== 'refraction' || prevMoving || prevRecovering) {
        startRefractionEdgeReveal()
      }
    },
    { flush: 'sync' },
  )

  watch(() => props.mode, (mode) => {
    if (mode !== 'refraction') {
      stopRefractionMaskPeakRamp()
      stopRefractionEdgeReveal()
      stopRefractionRecovery()
      return
    }
    if (isMoving.value) {
      hideRefractionEdge()
      startRefractionMaskPeakRamp()
      stopRefractionRecovery(false)
      refractionRecoveryProgress.value = 0
      refractionRecoveryElapsed.value = 0
      return
    }
    startRefractionEdgeReveal()
    stopRefractionMaskPeakRamp()
    stopRefractionRecovery()
  })

  watch(() => props.autoDetect, (newVal) => {
    teardownAutoDetect()
    if (newVal) {
      setupAutoDetect()
    }
  })

  onMounted(() => {
    setupAutoDetect()
  })

  onBeforeUnmount(() => {
    teardownAutoDetect()
  })

  return {
    isMoving,
    settling,
    refractionRecovering,
    refractionRecoveryProgress,
    refractionRecoveryElapsed,
    refractionMaskPeakRampProgress,
    refractionEdgeRevealProgress,
  }
}
