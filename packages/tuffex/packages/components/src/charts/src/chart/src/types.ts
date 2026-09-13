import type { ChartPadding, ScaleKind } from '../../core/types'

export interface ChartProps {
  /**
   * Chart height in pixels. Ignored when `aspectRatio` is set.
   * @default 350
   */
  height?: number
  /**
   * Container aspect ratio as width / height (e.g. `1.7` or `'16 / 9'`).
   * When set, height derives from the rendered width via CSS `aspect-ratio`.
   */
  aspectRatio?: number | string
  /**
   * Explicit chart width in pixels. When omitted the chart measures its
   * container (ResizeObserver). Useful for SSR and tests.
   */
  width?: number
  /** Uniform or per-side inner padding reserved for axes and labels. @default 24 */
  padding?: number | Partial<ChartPadding>
  /** Kind of x scale shared by all series. @default 'linear' */
  xType?: ScaleKind
  /**
   * Explicit x domain. Continuous scales take `[min, max]`; band scales take
   * the ordered band values. Omit to derive from the mounted series.
   */
  xDomain?: Array<string | number>
  /** Explicit y domain `[min, max]`. Omit to derive from the mounted series. */
  yDomain?: [number, number]
  /** Extend the derived y domain to rounded bounds. @default true */
  yNice?: boolean
  /**
   * Accessible description announced for the chart. See the W3C guidance on
   * complex images for writing a meaningful one.
   */
  ariaDescription?: string
}
