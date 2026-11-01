import type { BreachKind } from '../../eval-types'
import type { Episodes } from '../episodes'
import type { Level } from '../thresholds'

const SETTLE_SLACK_MS = 300

/**
 * A stall is seen twice: live, as a probe that has gone unanswered and keeps ageing, and afterwards,
 * as the exact figure the target reports once it runs again. Both feed one episode, so the breach
 * ends up with the real peak and is counted once.
 */
export class BlockTracker {
  private settledAt: number

  constructor(
    private readonly episodes: Episodes,
    private readonly key: string,
    private readonly kind: BreachKind,
    private readonly now: () => number
  ) {
    this.settledAt = now()
  }

  /** How long the target has been unresponsive right now; 0 closes the episode. */
  live(ms: number, limits: Level, context: string): void {
    this.episodes.observe(this.key, this.kind, ms, limits, { unit: 'ms', context })
  }

  /** The exact worst block since the previous call, read from the target itself. */
  settle(worstMs: number, limits: Level, context: string): void {
    const since = this.settledAt - SETTLE_SLACK_MS
    this.settledAt = this.now()
    if (worstMs < limits.warn) return
    if (this.episodes.lastSeenAt(this.key) >= since) {
      this.episodes.correctPeak(this.key, worstMs, limits)
      return
    }
    this.episodes.observe(this.key, this.kind, worstMs, limits, { unit: 'ms', context })
    this.episodes.observe(this.key, this.kind, 0, limits)
  }

  /** Forgets the key's open episode, e.g. when the page it belonged to went away. */
  release(limits: Level): void {
    this.episodes.observe(this.key, this.kind, 0, limits)
  }
}
