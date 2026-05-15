export const DEMO_LAZY_ROOT_MARGIN = '96px 0px'
export const DEMO_LAZY_ACTIVATION_DELAY_MS = 160
export const DEMO_LAZY_IDLE_TIMEOUT_MS = 600

export interface DemoIntersectionSnapshot {
  isIntersecting: boolean
  intersectionRatio: number
}

export function shouldActivateDemo(
  isActive: boolean,
  entry: DemoIntersectionSnapshot,
) {
  return isActive || entry.isIntersecting || entry.intersectionRatio > 0
}

export interface DemoActivationScheduler {
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  requestIdleCallback?: Window['requestIdleCallback']
  cancelIdleCallback?: Window['cancelIdleCallback']
}

export interface DemoActivationTask {
  cancel: () => void
}

export function scheduleDemoActivation(
  callback: () => void,
  scheduler: DemoActivationScheduler = globalThis,
): DemoActivationTask {
  let cancelled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleId: number | null = null

  const run = () => {
    if (cancelled)
      return

    cancelled = true
    callback()
  }

  if (scheduler.requestIdleCallback && scheduler.cancelIdleCallback) {
    idleId = scheduler.requestIdleCallback(run, { timeout: DEMO_LAZY_IDLE_TIMEOUT_MS })
  }
  else {
    timeoutId = scheduler.setTimeout(run, DEMO_LAZY_ACTIVATION_DELAY_MS)
  }

  return {
    cancel() {
      if (cancelled)
        return

      cancelled = true
      if (idleId !== null && scheduler.cancelIdleCallback) {
        scheduler.cancelIdleCallback(idleId)
        idleId = null
      }
      if (timeoutId !== null) {
        scheduler.clearTimeout(timeoutId)
        timeoutId = null
      }
    },
  }
}
