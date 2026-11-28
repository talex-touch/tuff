import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { type ComputedRef, computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SPECIMEN_VISIBLE_KEY } from './specimen-queue'

function prefersReducedMotion(): boolean {
  return hasWindow()
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * Reactive visibility signal for gallery specimens.
 * Automatically tracks both the enclosing `GallerySpecimenGate`'s viewport intersection
 * and `document.hidden`, pausing animations whenever the specimen is offscreen or hidden.
 */
export function useGalleryVisible(): ComputedRef<boolean> {
  const injectedVisible = inject(SPECIMEN_VISIBLE_KEY, null)
  const localHidden = ref(hasDocument() ? document.hidden : false)

  if (!injectedVisible && hasDocument()) {
    const syncHidden = () => {
      localHidden.value = document.hidden
    }
    onMounted(() => {
      localHidden.value = document.hidden
      document.addEventListener('visibilitychange', syncHidden, { passive: true })
    })
    onBeforeUnmount(() => {
      document.removeEventListener('visibilitychange', syncHidden)
    })
  }

  return computed(() => {
    if (injectedVisible)
      return injectedVisible.value
    return !localHidden.value
  })
}

/**
 * Calls `step` every `intervalMs` while the specimen is mounted AND visible
 * (in viewport + tab active), starting after `firstDelayMs` so the cell opens
 * on its resting state.
 *
 * Automatically pauses when scrolled offscreen or when `document.hidden` is true,
 * and never runs for readers who prefer reduced motion.
 */
export function useGalleryLoop(step: () => void, intervalMs: number, firstDelayMs = intervalMs): void {
  const visible = useGalleryVisible()
  const mounted = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let hasStartedOnce = false

  function stop() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function start() {
    if (timer !== undefined || !mounted.value || !visible.value || prefersReducedMotion())
      return

    const initialDelay = hasStartedOnce ? intervalMs : firstDelayMs
    hasStartedOnce = true

    const tick = () => {
      timer = undefined
      if (!mounted.value || !visible.value || prefersReducedMotion())
        return
      step()
      if (mounted.value && visible.value)
        timer = setTimeout(tick, intervalMs)
    }

    timer = setTimeout(tick, initialDelay)
  }

  watch(visible, (next) => {
    if (next)
      start()
    else
      stop()
  })

  onMounted(() => {
    mounted.value = true
    if (visible.value)
      start()
  })

  onBeforeUnmount(() => {
    mounted.value = false
    stop()
  })
}

export { prefersReducedMotion }
