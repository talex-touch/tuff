import type { Clock } from './clock'

export interface RateLimiter {
  /** Resolves when the caller may issue one query; slots are handed out in call order. */
  acquire(signal?: AbortSignal): Promise<void>
  readonly issued: number
  readonly waitedMs: number
}

export function createRateLimiter(qps: number, clock: Clock): RateLimiter {
  if (!(qps > 0)) throw new RangeError(`qps must be positive, got ${qps}`)
  const spacingMs = Number.isFinite(qps) ? 1000 / qps : 0
  let nextFree = 0
  let issued = 0
  let waitedMs = 0
  return {
    async acquire(signal) {
      const now = clock.now()
      const slot = Math.max(now, nextFree)
      nextFree = slot + spacingMs
      issued += 1
      const wait = slot - now
      if (wait > 0) {
        waitedMs += wait
        await clock.sleep(wait, signal)
      }
    },
    get issued() {
      return issued
    },
    get waitedMs() {
      return waitedMs
    }
  }
}
