import { hasWindow } from '@talex-touch/utils/env'
import type { InjectionKey } from 'vue'

/** Specimens admitted at once, so the first rows of a suite mount with the page. */
const EAGER_SPECIMENS = 4
/** Specimens admitted per idle slot, in document order. */
const SPECIMENS_PER_SLOT = 4
/** Longest an admission waits for an idle slot before it runs regardless. */
const IDLE_TIMEOUT_MS = 500
/** Slot delay where requestIdleCallback is missing (Safari): one frame, so a band never blocks input. */
const FALLBACK_SLOT_MS = 16

export interface SpecimenQueue {
  /**
   * Runs `callback` when the specimen's turn comes: at once for the first few, then a band per idle
   * slot in document order. Returns a cancel for a specimen that unmounts before its turn.
   */
  admit: (callback: () => void) => () => void
}

export const SPECIMEN_QUEUE_KEY: InjectionKey<SpecimenQueue> = Symbol('docs-gallery-specimen-queue')

/**
 * One queue per gallery. Without it a suite page mounts all of its specimens in one flush, and that
 * flush is the long task the page waits behind.
 */
export function createSpecimenQueue(): SpecimenQueue {
  const waiting: Array<() => void> = []
  let eagerLeft = EAGER_SPECIMENS
  let slotScheduled = false

  function runSlot() {
    slotScheduled = false
    for (let count = 0; count < SPECIMENS_PER_SLOT && waiting.length; count += 1)
      waiting.shift()?.()
    scheduleSlot()
  }

  function scheduleSlot() {
    // Server renders have no idle slots: their specimens keep the placeholder that the markup
    // shows until the client mounts them.
    if (slotScheduled || !waiting.length || !hasWindow())
      return
    slotScheduled = true
    if (typeof window.requestIdleCallback === 'function')
      window.requestIdleCallback(runSlot, { timeout: IDLE_TIMEOUT_MS })
    else
      window.setTimeout(runSlot, FALLBACK_SLOT_MS)
  }

  return {
    admit(callback) {
      if (eagerLeft > 0) {
        eagerLeft -= 1
        callback()
        return () => {}
      }
      waiting.push(callback)
      scheduleSlot()
      return () => {
        const index = waiting.indexOf(callback)
        if (index >= 0)
          waiting.splice(index, 1)
      }
    },
  }
}
