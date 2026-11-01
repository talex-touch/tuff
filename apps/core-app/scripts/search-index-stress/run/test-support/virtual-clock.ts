import type { Clock } from '../clock'

interface Timer {
  due: number
  order: number
  resolve: () => void
}

export interface VirtualClock extends Clock {
  /** Moves time forward, firing every timer that falls due on the way. */
  advance(ms: number): Promise<void>
  /** Drives time forward timer by timer until `promise` settles; fails if nothing can wake it. */
  runUntil<T>(promise: Promise<T>, maxVirtualMs?: number): Promise<T>
  pendingTimers(): number
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export function createVirtualClock(start = 1_000_000): VirtualClock {
  let current = start
  let order = 0
  const timers: Timer[] = []

  const takeEarliest = (limit: number): Timer | null => {
    let best = -1
    for (let i = 0; i < timers.length; i += 1) {
      const t = timers[i]
      if (t.due > limit) continue
      if (
        best < 0 ||
        t.due < timers[best].due ||
        (t.due === timers[best].due && t.order < timers[best].order)
      ) {
        best = i
      }
    }
    return best < 0 ? null : timers.splice(best, 1)[0]
  }

  const clock: VirtualClock = {
    now: () => current,
    sleep(ms, signal) {
      return new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve()
          return
        }
        const timer: Timer = {
          due: current + Math.max(0, ms),
          order: (order += 1),
          resolve: () => finish()
        }
        const finish = (): void => {
          const index = timers.indexOf(timer)
          if (index >= 0) timers.splice(index, 1)
          signal?.removeEventListener('abort', finish)
          resolve()
        }
        timers.push(timer)
        signal?.addEventListener('abort', finish, { once: true })
      })
    },
    async advance(ms) {
      const target = current + ms
      await settle()
      for (;;) {
        const timer = takeEarliest(target)
        if (!timer) break
        current = Math.max(current, timer.due)
        timer.resolve()
        await settle()
      }
      current = target
      await settle()
    },
    async runUntil(promise, maxVirtualMs = 24 * 3_600_000) {
      let settled = false
      let failed = false
      let value: unknown
      promise.then(
        (v) => {
          settled = true
          value = v
        },
        (e) => {
          settled = true
          failed = true
          value = e
        }
      )
      const limit = current + maxVirtualMs
      for (;;) {
        await settle()
        if (settled) break
        const timer = takeEarliest(Number.POSITIVE_INFINITY)
        if (!timer)
          throw new Error('virtual clock deadlock: promise pending and no timer scheduled')
        if (timer.due > limit) throw new Error(`virtual clock exceeded ${maxVirtualMs} ms`)
        current = Math.max(current, timer.due)
        timer.resolve()
      }
      if (failed) throw value
      return value as never
    },
    pendingTimers: () => timers.length
  }
  return clock
}
