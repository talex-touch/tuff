// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface SignalMeterProps {
  /** Number of filled bars. Clamped into `[0, max]`. */
  value: number
  /** Total bar count. @default 3 */
  max?: number
  /**
   * Fill colour for the lit bars — any CSS colour. Defaults to `currentColor`
   * so an unstyled meter inherits its container's tone; upstream passes a
   * semantic token per confidence level.
   */
  tone?: string
  /**
   * Accessible name, e.g. `'High confidence'`. Without it the meter is marked
   * `aria-hidden` — three empty spans announced individually are noise, and a
   * meter is always accompanied by its own visible text label upstream.
   */
  label?: string
  /** Bar height in px. @default 10 */
  barHeight?: number
  /** Bar width in px. @default 4 */
  barWidth?: number
}
