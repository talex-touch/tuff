/**
 * Shared shapes of the insights-page kit (`InsightsHeader`, `InsightsNotice`, `InsightsHeroMetric`,
 * `InsightsMetricCard`, `InsightsMenu`). The kit owns no copy: every string arrives from the page.
 */

/**
 * A notice's tone. `error` interrupts (`role="alert"`); `warning` and `info` are announced
 * politely (`role="status"`). `info` borrows the shell's neutral info ramp on purpose: it marks a
 * fact, and a hue of its own would compete with the two tones that ask for action.
 */
export type InsightsNoticeTone = 'error' | 'warning' | 'info'

/** One row of the ⋯ menu. Rendered as a native button; `key` is what `select` reports. */
export interface InsightsMenuItem {
  key: string
  /** An icon class, e.g. `i-ri-settings-3-line`. Decorative: the label names the action. */
  icon: string
  label: string
  disabled?: boolean
  /** The irreversible kind of item: drawn in the danger ink. */
  danger?: boolean
  /** Draws a separator above this item, fencing it off from the ones before it. */
  separatorBefore?: boolean
  /** Becomes the item button's `data-testid`. */
  testId?: string
}
