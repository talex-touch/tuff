/**
 * Adaptive batch size scheduler inspired by TCP AIMD congestion control.
 *
 * The algorithm mirrors TCP's congestion window (cwnd):
 * - **Slow start**: window doubles each round while below ssthresh
 * - **Congestion avoidance**: window grows linearly (+1) above ssthresh
 * - **Multiplicative decrease**: on "congestion" (duration > target), window
 *   is halved and ssthresh is updated
 *
 * This keeps SQLite transaction durations close to `targetMs`, preventing
 * event-loop stalls while maximising throughput on capable hardware.
 */

export interface AdaptiveBatchConfig {
  /** Initial batch size (default 5) */
  initialSize?: number
  /** Minimum batch size (default 2) */
  minSize?: number
  /** Maximum batch size (default 80) */
  maxSize?: number
  /** Target transaction duration in ms (default 500) */
  targetMs?: number
  /** Initial slow-start threshold (default 30) */
  ssthresh?: number
}

const DEFAULTS: Required<AdaptiveBatchConfig> = {
  initialSize: 5,
  minSize: 2,
  maxSize: 80,
  targetMs: 500,
  ssthresh: 30
}

export class AdaptiveBatchScheduler {
  private windowSize: number
  private ssthresh: number
  private readonly config: Required<AdaptiveBatchConfig>

  constructor(config: AdaptiveBatchConfig = {}) {
    this.config = { ...DEFAULTS, ...config }
    this.windowSize = this.config.initialSize
    this.ssthresh = this.config.ssthresh
  }

  /** Current recommended batch size (always an integer). */
  get currentSize(): number {
    return Math.round(this.windowSize)
  }

  /**
   * Record a completed transaction's wall-clock duration and adjust the
   * window accordingly.
   */
  recordDuration(durationMs: number): void {
    const { minSize, maxSize, targetMs } = this.config

    if (durationMs <= targetMs) {
      // Good — increase window
      if (this.windowSize < this.ssthresh) {
        // Slow start: exponential growth (double)
        this.windowSize *= 2
      } else {
        // Congestion avoidance: linear growth
        this.windowSize += 1
      }
    } else {
      // Congestion detected — multiplicative decrease
      this.ssthresh = Math.max(Math.floor(this.windowSize / 2), minSize)
      this.windowSize = Math.max(this.windowSize / 2, minSize)
    }

    // Clamp
    this.windowSize = Math.max(minSize, Math.min(maxSize, this.windowSize))
  }

  /** Reset to initial state (e.g. for a brand-new indexing round). */
  reset(): void {
    this.windowSize = this.config.initialSize
    this.ssthresh = this.config.ssthresh
  }
}
