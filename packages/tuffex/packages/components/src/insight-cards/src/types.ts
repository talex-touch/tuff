// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface InsightPage {
  key: string
  /** Plain-text lede. Mentions and inline stats go through the `prose` slot. */
  prose?: string
  /** Follow-up pill copy. Omit to hide the pill on that page. */
  suggestion?: string
}

export interface InsightCardsProps {
  pages: InsightPage[]
  /**
   * Current page. Leave undefined to let the component page itself — it still
   * reports every move through `update:activeIndex`.
   */
  activeIndex?: number
  /** @default 'Insights' */
  title?: string
  /** Page count beside the title. @default true */
  showCount?: boolean
  /** Wrap around at both ends. @default true */
  loop?: boolean
  /** @default 'Previous insight' */
  previousLabel?: string
  /** @default 'Next insight' */
  nextLabel?: string
}

export interface InsightCardsEmits {
  (e: 'update:activeIndex', index: number): void
  (e: 'change', page: InsightPage, index: number): void
  (e: 'followUp', page: InsightPage): void
}

export type InsightMetricTone = 'positive' | 'negative' | 'neutral'

export interface InsightMetricProps {
  label: string
  /** Swatch beside the label; omit to drop the dot. */
  color?: string
  /** Signed headline figure. Formatted with a U+2212 minus unless `delta` is set. */
  value?: number
  /** Pre-formatted headline, used verbatim. Wins over `value`. */
  delta?: string
  /** Appended by the default formatter. @default '%' */
  unit?: string
  /** Decimals for the default formatter. @default 2 */
  precision?: number
  /** Mono second line, e.g. '−$2,377.66'. Passed through as written. */
  detail?: string
  /** Overrides the sign→tone mapping. */
  tone?: InsightMetricTone
  /** Replaces the default number formatting entirely. */
  formatter?: (value: number) => string
}
