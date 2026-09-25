import { hasWindow } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted } from 'vue'

function prefersReducedMotion(): boolean {
  return hasWindow()
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * Calls `step` every `intervalMs` for as long as the specimen is mounted,
 * the first time after `firstDelayMs` so the cell opens on its resting state.
 *
 * The timer belongs to the specimen, not the gallery: the cell's reset button
 * remounts the specimen, and with it the loop starts over from the top. A
 * gallery-level timer kept running through a reset and the cell never replayed.
 *
 * Nothing runs for readers who ask for reduced motion, so each caller's
 * resting state has to show the component on its own.
 */
export function useGalleryLoop(step: () => void, intervalMs: number, firstDelayMs = intervalMs): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  onMounted(() => {
    if (prefersReducedMotion())
      return
    const tick = () => {
      step()
      timer = setTimeout(tick, intervalMs)
    }
    timer = setTimeout(tick, firstDelayMs)
  })

  onBeforeUnmount(() => clearTimeout(timer))
}

export { prefersReducedMotion }
