export interface TooltipRow {
  /** Series name. */
  name: string
  /** Indicator dot color. */
  color: string
  /** Pre-formatted value string. */
  value: string
}

export interface ChartTooltipProps {
  /**
   * Visibility: `'auto'` shows the tooltip whenever the pointer is inside the
   * chart; pass a boolean for controlled mode. (Tri-state on purpose — an
   * absent Boolean prop is cast to `false` by Vue, which would never be
   * distinguishable from "controlled closed".)
   * @default 'auto'
   */
  open?: boolean | 'auto'
  /** Cursor tracking mode — see `placeTooltip`. @default 'both' */
  follow?: 'both' | 'x'
  /** Gap between the pointer and the tooltip. @default 12 */
  offset?: number
  /** Top position (px) when `follow` is `'x'`. @default 0 */
  fixedY?: number
  /** Title line (e.g. a formatted timestamp). */
  title?: string
  /** Rows rendered by the default content. */
  rows?: TooltipRow[]
  /** Rows hidden by a cap, shown as a "+N more" footer. @default 0 */
  hiddenCount?: number
  /** Formatter for the hidden-rows footer. @default n => `+${n} more` */
  moreLabel?: (count: number) => string
}
