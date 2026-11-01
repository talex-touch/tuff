export interface LeadingTrailingThrottleOptions {
  intervalMs: number
  /** Runs when a window closes on triggers it held back, and opens the next window. */
  onTrailing: () => void
  /** Called when `onTrailing` throws; it runs on a timer, where nothing else would catch it. */
  onError?: (error: unknown) => void
}

/**
 * Lets the first trigger through and holds back the rest of its window, then runs `onTrailing`
 * once if anything was held.
 *
 * A leading-edge throttle alone drops whatever lands inside the window, so the last change of a
 * burst stays unseen until some later trigger happens to fall outside it. The trailing run closes
 * that gap without lifting the bound: it opens a window of its own, so a steady stream still
 * yields one run per `intervalMs` rather than one per trigger.
 */
export class LeadingTrailingThrottle {
  private timer: ReturnType<typeof setTimeout> | null = null
  private held = false
  private disposed = false

  constructor(private readonly options: LeadingTrailingThrottleOptions) {}

  /** True on the leading edge, where the caller acts now; false when held for the trailing run. */
  trigger(): boolean {
    if (this.disposed) return false
    if (this.timer !== null) {
      this.held = true
      return false
    }
    this.open()
    return true
  }

  /** Drops the open window and whatever it held; later triggers are ignored. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.held = false
  }

  private open(): void {
    const timer = setTimeout(() => {
      if (this.timer === timer) this.timer = null
      this.close()
    }, this.options.intervalMs)
    timer.unref?.()
    this.timer = timer
  }

  private close(): void {
    if (!this.held || this.disposed) return
    this.held = false
    this.open()
    try {
      this.options.onTrailing()
    } catch (error) {
      this.options.onError?.(error)
    }
  }
}
