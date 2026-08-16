// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface AllocationSegment {
  key: string
  /** Full name, used by the detail panel and the accessible name. */
  label: string
  /** Short code for the legend chip, e.g. 'VAN'. Falls back to `label`. */
  short?: string
  /** Share of the whole, 0–100. */
  percent: number
  /**
   * Headline figure for the segment, e.g. '$51,785'. The bar does not paint it —
   * it belongs to the card's hero line, which reads it off the active segment.
   */
  amount?: string
  /** Fill colour. Falls back to the accent-then-greys ladder by position. */
  color?: string
  /** Body copy for the optional detail panel. */
  description?: string
}

export interface AllocationBarProps {
  segments: AllocationSegment[]
  /** Selected segment key. */
  modelValue?: string
  /** Legend chips under the bar. @default true */
  legend?: boolean
  /** Panel echoing the active segment's label and description. @default false */
  detail?: boolean
  /** Accessible name for the segment group. @default 'Allocation segments' */
  ariaLabel?: string
  /** @default `${percent}%` */
  percentFormatter?: (percent: number) => string
}

export interface AllocationBarEmits {
  (e: 'update:modelValue', key: string): void
  (e: 'change', segment: AllocationSegment): void
}
