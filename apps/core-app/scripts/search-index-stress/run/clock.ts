export interface Clock {
  now(): number
  /** Resolves (never rejects) after `ms`, or as soon as `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep(ms, signal) {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve()
        return
      }
      const finish = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, Math.max(0, ms))
      signal?.addEventListener('abort', finish, { once: true })
    })
  }
}

export function sleepUntil(clock: Clock, at: number, signal?: AbortSignal): Promise<void> {
  const wait = at - clock.now()
  return wait > 0 ? clock.sleep(wait, signal) : Promise.resolve()
}
