import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'

/** Deferrals in a row before a capture is let through whatever the gates say. */
export const CLIPBOARD_DEFER_MAX_ROUNDS = 3
/** Lands the retry just past the end of a gate's window instead of on its last millisecond. */
export const CLIPBOARD_DEFER_GRACE_MS = 100

/** When the clipboard change behind a deferred capture was noticed. */
export interface ClipboardDeferralSignal {
  /** Epoch ms. */
  at: number
  /** A native-watch change signal (the content changed then) rather than a CoreBox baseline. */
  isChange: boolean
}

export interface ClipboardDeferredRetry {
  source: ClipboardCaptureSource
  /** Deferrals this capture has already used up. */
  round: number
  /** The replay is stamped with this instead of with the time it runs. */
  signal: ClipboardDeferralSignal
}

/** Polls come around again by themselves; a change signal and the CoreBox baseline do not. */
export function isDeferrableClipboardSource(source: ClipboardCaptureSource): boolean {
  return source === 'native-watch' || source === 'corebox-show-baseline'
}

export function createDeferralSignal(
  source: ClipboardCaptureSource,
  now: number = Date.now()
): ClipboardDeferralSignal {
  return { at: now, isChange: source === 'native-watch' }
}

/**
 * The capture reads whatever is on the clipboard when the replay runs, so the change that counts
 * is the latest native-watch signal; with only baselines the content was already there, and the
 * first one is the nearest to when a plain capture would have been stamped.
 */
export function mergeDeferralSignals(
  a: ClipboardDeferralSignal,
  b: ClipboardDeferralSignal
): ClipboardDeferralSignal {
  if (a.isChange && b.isChange) return b.at > a.at ? b : a
  if (a.isChange) return a
  if (b.isChange) return b
  return b.at < a.at ? b : a
}

export class ClipboardDeferredCapture {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: ClipboardDeferredRetry | null = null

  constructor(private readonly run: (retry: ClipboardDeferredRetry) => void) {}

  /**
   * Returns false once `round` has used the cap, so the caller lets the capture through. A retry
   * that defers again passes its own `signal` on; a fresh signal leaves it out.
   */
  defer(
    source: ClipboardCaptureSource,
    round: number,
    delayMs: number,
    signal: ClipboardDeferralSignal = createDeferralSignal(source)
  ): boolean {
    if (round >= CLIPBOARD_DEFER_MAX_ROUNDS) return false
    if (this.pending) {
      this.pending = {
        source:
          this.pending.source === 'corebox-show-baseline' || source === 'corebox-show-baseline'
            ? 'corebox-show-baseline'
            : source,
        round: Math.max(this.pending.round, round + 1),
        signal: mergeDeferralSignals(this.pending.signal, signal)
      }
      return true
    }
    this.pending = { source, round: round + 1, signal }
    this.timer = setTimeout(
      () => {
        const retry = this.pending
        this.timer = null
        this.pending = null
        if (retry) this.run(retry)
      },
      Math.max(0, delayMs)
    )
    this.timer.unref()
    return true
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }
}
