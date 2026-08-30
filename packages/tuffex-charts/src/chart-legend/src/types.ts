export type ChartLegendItemVariant = 'small' | 'large'

export interface ChartLegendItemProps {
  /**
   * Layout variant.
   * - `small` — dot, name and value on one row; suited for multi-series legends.
   * - `large` — stacked layout with a large value; suited for single-metric cards.
   */
  variant?: ChartLegendItemVariant
  /** Series name shown as the label. Required unless `loading`. */
  name?: string
  /**
   * Color for the series indicator dot. Any CSS color, including a
   * `var(--tx-chart-categorical-N)` reference. Required unless `loading`.
   */
  color?: string
  /** Formatted value string to display. Required unless `loading`. */
  value?: string
  /** Optional unit label shown after the value (e.g. `"ms"`, `"%"`). Large variant only. */
  unit?: string
  /** When `true`, renders the item at 50% opacity to indicate a deselected state. */
  inactive?: boolean
  /** When `true`, renders skeleton placeholders instead of content. */
  loading?: boolean
}
