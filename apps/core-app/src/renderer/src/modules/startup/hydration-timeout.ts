export type HydrationSoftTimeoutResult = 'hydrated' | 'timeout'

export interface HydrationWaitTarget {
  isHydrated(): boolean
  whenHydrated(): Promise<void>
}

type TimeoutHandle = number | ReturnType<typeof setTimeout>
type ScheduleTimeout = (handler: () => void, timeoutMs: number) => TimeoutHandle
type ClearScheduledTimeout = (handle: TimeoutHandle) => void

export interface WaitForHydrationSoftTimeoutOptions {
  timeoutMs: number
  setTimeoutFn?: ScheduleTimeout
  clearTimeoutFn?: ClearScheduledTimeout
  onTimeout?: () => void
}

export async function waitForHydrationSoftTimeout(
  target: HydrationWaitTarget,
  options: WaitForHydrationSoftTimeoutOptions
): Promise<HydrationSoftTimeoutResult> {
  if (target.isHydrated()) {
    return 'hydrated'
  }

  const setTimeoutFn = options.setTimeoutFn ?? globalThis.setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? globalThis.clearTimeout
  let timeoutHandle: TimeoutHandle | null = null

  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutHandle = setTimeoutFn(() => resolve('timeout'), options.timeoutMs)
  })
  const hydrated = target.whenHydrated().then(() => 'hydrated' as const)
  const result = await Promise.race([hydrated, timeout])

  if (result === 'hydrated' && timeoutHandle !== null) {
    clearTimeoutFn(timeoutHandle)
  } else if (result === 'timeout') {
    options.onTimeout?.()
  }

  return result
}
