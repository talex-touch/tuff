import type { Scheduler } from '../index'
import type { FakeWsServer } from './fake-cdp-server'
import type { NetGauge } from './net-gauge'

interface Timer {
  fn: () => void
  ms: number
  next: number
  active: boolean
}

/**
 * Time that only moves when a test says so. Sockets and files still use real I/O; `settle` gives
 * the network part of that a chance to land between steps.
 */
export class ManualClock implements Scheduler {
  time: number
  /** Servers whose deliberately held requests `settle` does not wait for. */
  readonly servers: FakeWsServer[] = []
  private readonly timers: Timer[] = []

  constructor(
    private readonly gauge: NetGauge,
    start = Date.UTC(2026, 9, 30, 12, 0, 0)
  ) {
    this.time = start
  }

  now = (): number => this.time

  every(fn: () => void, ms: number): () => void {
    const timer: Timer = { fn, ms, next: this.time + ms, active: true }
    this.timers.push(timer)
    return () => {
      timer.active = false
    }
  }

  /** Runs due timers in order, moving `time` to each one's due time. */
  advance(ms: number): void {
    const target = this.time + ms
    for (;;) {
      let due: Timer | undefined
      for (const timer of this.timers) {
        if (timer.active && timer.next <= target && (!due || timer.next < due.next)) due = timer
      }
      if (!due) break
      this.time = due.next
      due.next += due.ms
      due.fn()
    }
    this.time = target
  }

  /** Advance in `stepMs` steps, letting the network settle after each. */
  async run(ms: number, stepMs = 100): Promise<void> {
    for (let done = 0; done < ms; done += stepMs) {
      this.advance(Math.min(stepMs, ms - done))
      await this.settle()
    }
  }

  /** Waits until everything on the wire has landed, except requests a server is holding on purpose. */
  async settle(): Promise<void> {
    let quiet = 0
    for (let turns = 0; turns < 2_000 && quiet < 3; turns++) {
      await turn()
      const held = this.servers.reduce((sum, server) => sum + server.pendingHeld, 0)
      if (this.gauge.inflight() <= held) quiet++
      else quiet = 0
    }
  }
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Polls `condition` between event-loop turns; throws if it is still false after ~2 s of real time. */
export async function until(condition: () => boolean, what = 'condition'): Promise<void> {
  const deadline = performance.now() + 2_000
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await turn()
  }
}
