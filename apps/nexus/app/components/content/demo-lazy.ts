export interface DemoActivationRequest {
  demo?: string
  isActive: boolean
}

/**
 * Demos run on their own once their turn in the activation queue comes up, so
 * any activation request is honoured as long as there is a demo that is not
 * running yet.
 */
export function shouldActivateDemo(request: DemoActivationRequest) {
  return Boolean(request.demo) && !request.isActive
}

/**
 * Longest a queued demo waits for an idle slot. A page that never goes idle
 * still mounts every demo instead of leaving the rest on their placeholders.
 */
export const DEMO_ACTIVATION_IDLE_TIMEOUT_MS = 600

type DemoActivation = () => void

export interface DemoActivationScheduler {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  setTimeout: (callback: () => void, ms: number) => unknown
}

const pendingActivations: DemoActivation[] = []
let flushScheduled = false

function scheduleActivationFlush(scheduler: DemoActivationScheduler) {
  if (flushScheduled || !pendingActivations.length)
    return

  flushScheduled = true
  const flush = () => {
    flushScheduled = false
    pendingActivations.shift()?.()
    scheduleActivationFlush(scheduler)
  }

  if (typeof scheduler.requestIdleCallback === 'function') {
    scheduler.requestIdleCallback(flush, { timeout: DEMO_ACTIVATION_IDLE_TIMEOUT_MS })
    return
  }
  scheduler.setTimeout(flush, 0)
}

/**
 * Demos do not wait to be scrolled to. Every demo on the page joins one queue
 * in mount (document) order, and the queue starts one per idle slot, so a page
 * of heavy demos does not land as a single long task.
 *
 * Returns a cancel for a wrapper that unmounts before its turn.
 */
export function queueDemoActivation(activate: DemoActivation, scheduler: DemoActivationScheduler = window) {
  pendingActivations.push(activate)
  scheduleActivationFlush(scheduler)

  return () => {
    const index = pendingActivations.indexOf(activate)
    if (index >= 0)
      pendingActivations.splice(index, 1)
  }
}

/**
 * Longest a loader download waits for an idle slot. Downloads run one at a time, so a longer wait
 * costs little, and the activation queue is never held up by them.
 */
export const DEMO_PREFETCH_IDLE_TIMEOUT_MS = 2000

/** Where requestIdleCallback is missing, the next download starts this long after the last one. */
const DEMO_PREFETCH_FALLBACK_DELAY_MS = 200

type DemoPrefetch = () => Promise<unknown>

const pendingPrefetches: DemoPrefetch[] = []
let prefetchInFlight = false
let prefetchFlushScheduled = false

function schedulePrefetchFlush(scheduler: DemoActivationScheduler) {
  if (prefetchFlushScheduled || prefetchInFlight || !pendingPrefetches.length)
    return

  prefetchFlushScheduled = true
  const flush = () => {
    prefetchFlushScheduled = false
    const prefetch = pendingPrefetches.shift()
    if (!prefetch)
      return

    prefetchInFlight = true
    prefetch()
      .catch(() => {})
      .finally(() => {
        prefetchInFlight = false
        schedulePrefetchFlush(scheduler)
      })
  }

  if (typeof scheduler.requestIdleCallback === 'function') {
    scheduler.requestIdleCallback(flush, { timeout: DEMO_PREFETCH_IDLE_TIMEOUT_MS })
    return
  }
  scheduler.setTimeout(flush, DEMO_PREFETCH_FALLBACK_DELAY_MS)
}

/**
 * Fetches a demo's loader ahead of its activation: one download at a time, in mount order, and only
 * while the page is idle. Returns a cancel for a wrapper that unmounts before its turn.
 */
export function queueDemoPrefetch(prefetch: DemoPrefetch, scheduler: DemoActivationScheduler = window) {
  pendingPrefetches.push(prefetch)
  schedulePrefetchFlush(scheduler)

  return () => {
    const index = pendingPrefetches.indexOf(prefetch)
    if (index >= 0)
      pendingPrefetches.splice(index, 1)
  }
}
