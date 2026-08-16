// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type WorkingIndicatorVariant = 'drive' | 'dots' | 'orbit'

export interface WorkingIndicatorProps {
  /** Shimmering status text. @default 'Working' */
  label?: string
  /**
   * `drive` and `dots` share a chevron wavefront on a 650ms cycle — shorter
   * than the sweep, so two fronts are always in flight. `orbit` is a comet
   * lapping the perimeter around an unlit centre.
   * @default 'drive'
   */
  variant?: WorkingIndicatorVariant
  /**
   * Wall-clock start. Omit to count from mount; pass a timestamp to survive a
   * remount — a streaming host re-rendering the row must not reset the clock.
   */
  startedAt?: number
  /** @default true */
  showElapsed?: boolean
  /** Formats the elapsed milliseconds. @default `12.3s` / `2m 3.0s` */
  elapsedFormatter?: (ms: number) => string
  /**
   * Accessible name for the status region. Omit to let the visible label be
   * the announcement — duplicating it here would have it read twice.
   */
  ariaLabel?: string
}
