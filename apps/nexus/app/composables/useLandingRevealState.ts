import type { Ref } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'
import { useState } from '#imports'
import { onBeforeUnmount } from 'vue'

interface LandingRevealTimings {
  mask: number
  content: number
  interactive: number
  header: number
}

const DEFAULT_TIMINGS: LandingRevealTimings = {
  mask: 0,
  content: 980,
  interactive: 1460,
  header: 2100,
}

function isClient() {
  return hasWindow()
}

function schedule(timers: Ref<number[]>, delay: number, callback: () => void) {
  if (!isClient())
    return

  const id = window.setTimeout(() => {
    try {
      callback()
    }
    finally {
      const next = timers.value.filter(timerId => timerId !== id)
      timers.value = next
    }
  }, delay)

  timers.value = [...timers.value, id]
}

function clearTimers(timers: Ref<number[]>) {
  if (!isClient())
    return

  timers.value.forEach(timerId => window.clearTimeout(timerId))
  timers.value = []
}

export function useLandingRevealState() {
  const sequenceStarted = useState('landing-reveal-sequence-started', () => false)
  const maskScale = useState('landing-reveal-mask-scale', () => 0.9)
  const maskOpacity = useState('landing-reveal-mask-opacity', () => 0.92)
  const contentVisible = useState('landing-reveal-content-visible', () => false)
  const interactiveReady = useState('landing-reveal-interactive-ready', () => false)
  const headerVisible = useState('landing-reveal-header-visible', () => false)
  const timers = useState('landing-reveal-timers', () => [] as number[])

  const setHeaderVisibility = (visible: boolean) => {
    headerVisible.value = visible
  }

  const resetSequence = (options: { preserveHeader?: boolean } = {}) => {
    clearTimers(timers)
    sequenceStarted.value = false
    maskScale.value = 0.9
    maskOpacity.value = 0.92
    contentVisible.value = false
    interactiveReady.value = false
    if (!options.preserveHeader)
      headerVisible.value = false
  }

  const beginSequence = (timings: Partial<LandingRevealTimings> = {}) => {
    if (sequenceStarted.value)
      return

    sequenceStarted.value = true
    maskScale.value = 0.9
    maskOpacity.value = 0.92
    contentVisible.value = false
    interactiveReady.value = false
    headerVisible.value = false

    if (!isClient())
      return

    const merged: LandingRevealTimings = {
      ...DEFAULT_TIMINGS,
      ...timings,
    }

    // Slight delay so layout paints before we apply transitions
    window.requestAnimationFrame(() => {
      schedule(timers, merged.mask, () => {
        maskScale.value = 1.4
        maskOpacity.value = 0.82
      })

      schedule(timers, merged.content, () => {
        contentVisible.value = true
        maskOpacity.value = 0.72
      })

      schedule(timers, merged.interactive, () => {
        interactiveReady.value = true
        maskScale.value = 1
        maskOpacity.value = 0.8
      })

      schedule(timers, merged.header, () => {
        headerVisible.value = true
      })
    })
  }

  onBeforeUnmount(() => {
    if (!sequenceStarted.value || headerVisible.value)
      return
    clearTimers(timers)
  })

  return {
    beginSequence,
    resetSequence,
    sequenceStarted,
    maskScale,
    maskOpacity,
    contentVisible,
    interactiveReady,
    headerVisible,
    setHeaderVisibility,
  }
}
