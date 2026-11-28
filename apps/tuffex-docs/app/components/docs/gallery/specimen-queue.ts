import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { type InjectionKey, type Ref, readonly, ref } from 'vue'

/** Specimens admitted immediately when first entering view, so the top rows render with zero wait. */
const EAGER_SPECIMENS = 8
/** Maximum specimens admitted per animation frame / yield slice. */
const MAX_SPECIMENS_PER_FRAME = 6
/** Frame time budget (ms) before yielding remaining queued admissions to the browser. */
const FRAME_BUDGET_MS = 10

interface SchedulerWithYield {
  yield?: () => Promise<void>
}

interface ObservedSpecimen {
  admitted: boolean
  intersecting: boolean
  onAdmit: () => void
  onVisibilityChange?: (visible: boolean) => void
}

export interface SpecimenObserveCallbacks {
  onAdmit: () => void
  onVisibilityChange?: (visible: boolean) => void
}

export interface SpecimenQueue {
  /** Shared reactive mirror of `document.hidden` so off-tab timers pause cleanly. */
  readonly documentHidden: Readonly<Ref<boolean>>
  /**
   * Registers a specimen's wrapper element with the gallery's single shared
   * `IntersectionObserver({ rootMargin: '320px 0px', threshold: 0 })`.
   * Specimens are only admitted once intersecting (throttled to 2-3 per frame / yield slice),
   * and `onVisibilityChange` toggles as they enter/leave the viewport margin.
   */
  observe: (element: Element, callbacks: SpecimenObserveCallbacks) => () => void
  /** Legacy fallback for specimens without a measurable wrapper element. */
  admit: (callback: () => void) => () => void
  /** Tears down the shared observer, listeners, and pending frame flushes. */
  dispose: () => void
}

export const SPECIMEN_QUEUE_KEY: InjectionKey<SpecimenQueue> = Symbol('docs-gallery-specimen-queue')

/**
 * Reactive visibility flag provided by `GallerySpecimenGate` to descendant specimens.
 * True only when the specimen has been admitted, intersects the viewport margin,
 * and `document.hidden` is false.
 */
export const SPECIMEN_VISIBLE_KEY: InjectionKey<Readonly<Ref<boolean>>> = Symbol('docs-gallery-specimen-visible')

function yieldToMainThread(): Promise<void> {
  const sched = (globalThis as { scheduler?: SchedulerWithYield }).scheduler
  if (typeof sched?.yield === 'function')
    return sched.yield()

  if (hasWindow() && typeof window.requestAnimationFrame === 'function') {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }

  return new Promise((resolve) => {
    setTimeout(resolve, 16)
  })
}

/**
 * One viewport-gated queue per gallery.
 *
 * Owns ONE shared `IntersectionObserver({ rootMargin: '320px 0px', threshold: 0 })` and ONE
 * `visibilitychange` listener so scrolling through a 70-cell suite mounts only specimens near
 * the viewport in short frame-budgeted slices, and pauses offscreen/hidden timers automatically.
 */
export function createSpecimenQueue(): SpecimenQueue {
  const entries = new Map<Element, ObservedSpecimen>()
  const waiting: Array<() => void> = []
  const waitingByElement = new Map<Element, () => void>()
  const documentHidden = ref(hasDocument() ? document.hidden : false)

  let eagerLeft = EAGER_SPECIMENS
  let flushRunning = false
  let disposed = false
  let observer: IntersectionObserver | null = null

  const onVisibilityChange = () => {
    if (!hasDocument())
      return
    documentHidden.value = document.hidden
  }

  if (hasDocument())
    document.addEventListener('visibilitychange', onVisibilityChange, { passive: true })

  function removeWaiting(callback: () => void) {
    const idx = waiting.indexOf(callback)
    if (idx >= 0)
      waiting.splice(idx, 1)
  }

  async function runFlushLoop() {
    if (flushRunning || disposed || !hasWindow())
      return
    flushRunning = true

    try {
      while (waiting.length > 0) {
        if (disposed)
          break
        const start = typeof performance !== 'undefined' ? performance.now() : 0
        let count = 0

        while (waiting.length > 0 && count < MAX_SPECIMENS_PER_FRAME) {
          if (disposed)
            break
          const next = waiting.shift()
          next?.()
          count += 1
          if (start > 0 && performance.now() - start >= FRAME_BUDGET_MS)
            break
        }

        if (!disposed && waiting.length > 0)
          await yieldToMainThread()
      }
    }
    finally {
      flushRunning = false
      if (!disposed && waiting.length > 0)
        void runFlushLoop()
    }
  }

  function enqueueAdmit(callback: () => void) {
    if (disposed)
      return
    if (eagerLeft > 0) {
      eagerLeft -= 1
      callback()
      return
    }
    waiting.push(callback)
    void runFlushLoop()
  }

  function ensureObserver(): IntersectionObserver | null {
    if (observer || disposed || !hasWindow() || typeof window.IntersectionObserver !== 'function')
      return observer

    observer = new window.IntersectionObserver(
      (records) => {
        if (disposed)
          return

        for (const record of records) {
          const item = entries.get(record.target)
          if (!item)
            continue

          const nextIntersecting = record.isIntersecting
          if (item.intersecting !== nextIntersecting) {
            item.intersecting = nextIntersecting
            item.onVisibilityChange?.(nextIntersecting)
          }

          if (nextIntersecting) {
            if (!item.admitted && !waitingByElement.has(record.target)) {
              const run = () => {
                waitingByElement.delete(record.target)
                if (disposed || item.admitted || !entries.has(record.target))
                  return
                item.admitted = true
                item.onAdmit()
              }
              if (eagerLeft > 0) {
                eagerLeft -= 1
                run()
              }
              else {
                waitingByElement.set(record.target, run)
                waiting.push(run)
                void runFlushLoop()
              }
            }
          }
          else {
            // If the reader scrolled past a specimen before it even mounted, drop it from the queue.
            const pending = waitingByElement.get(record.target)
            if (pending) {
              waitingByElement.delete(record.target)
              removeWaiting(pending)
            }
          }
        }
      },
      {
        rootMargin: '800px 0px',
        threshold: 0,
      },
    )

    return observer
  }

  return {
    documentHidden: readonly(documentHidden),

    observe(element, callbacks) {
      if (disposed)
        return () => {}

      const io = ensureObserver()
      if (!io) {
        // SSR or environment without IntersectionObserver: fall back to queued admission.
        let cancelled = false
        const run = () => {
          if (cancelled || disposed)
            return
          callbacks.onVisibilityChange?.(true)
          callbacks.onAdmit()
        }
        enqueueAdmit(run)
        return () => {
          cancelled = true
          removeWaiting(run)
        }
      }

      const item: ObservedSpecimen = {
        admitted: false,
        intersecting: false,
        onAdmit: callbacks.onAdmit,
        onVisibilityChange: callbacks.onVisibilityChange,
      }
      entries.set(element, item)
      io.observe(element)

      return () => {
        entries.delete(element)
        io.unobserve(element)
        const pending = waitingByElement.get(element)
        if (pending) {
          waitingByElement.delete(element)
          removeWaiting(pending)
        }
      }
    },

    admit(callback) {
      if (disposed)
        return () => {}
      enqueueAdmit(callback)
      return () => {
        removeWaiting(callback)
      }
    },

    dispose() {
      disposed = true
      waiting.length = 0
      waitingByElement.clear()
      entries.clear()
      observer?.disconnect()
      observer = null
      if (hasDocument())
        document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
