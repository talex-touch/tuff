import type { BandAccessor, NumericAccessor, StringAccessor } from '../../core/types'

export type LineCurve = 'linear' | 'monotone' | 'natural' | 'step'

export interface CartesianSeriesProps<T> {
  /** Raw data rows. Values are read via the `x`/`y` accessors. */
  data: T[]
  /** X accessor: key of the datum or `(d, i) => value`. */
  x: BandAccessor<T>
  /** Y accessor: key of the datum or `(d, i) => number`. */
  y: NumericAccessor<T>
  /**
   * Series color (any CSS color). Defaults to the next categorical palette
   * slot, as a theme-following `var()` reference.
   */
  color?: string
}

export interface LineSeriesProps<T> extends CartesianSeriesProps<T> {
  /** Curve interpolation. @default 'linear' */
  curve?: LineCurve
  /** Stroke width in pixels. @default 2 */
  strokeWidth?: number
  /** Render a dot at each data point. @default false */
  showSymbol?: boolean
  /** Dash the stroke (e.g. incomplete data). @default false */
  dashed?: boolean
}

export interface AreaSeriesProps<T> extends CartesianSeriesProps<T> {
  /** Curve interpolation. @default 'linear' */
  curve?: LineCurve
  /** Stroke width of the top line, 0 to hide it. @default 2 */
  strokeWidth?: number
  /**
   * Vertical gradient fill fading from the series color (40% opacity) to
   * transparent, matching the kumo timeseries look. @default true
   */
  gradient?: boolean
  /** Constant fill opacity used when `gradient` is off. @default 0.2 */
  fillOpacity?: number
}

export interface BarSeriesProps<T> extends CartesianSeriesProps<T> {
  /**
   * Stack key. Series sharing a key stack on top of each other; series
   * without one render side by side.
   */
  stack?: string
  /** Explicit bar width in pixels. Defaults to a width derived from the scale. */
  barWidth?: number
  /** Corner radius of bars. @default 0 */
  radius?: number
}

export interface ScatterSeriesProps<T> extends CartesianSeriesProps<T> {
  /** Dot radius in pixels, constant or per-datum. @default 3 */
  r?: number | NumericAccessor<T>
  /** Fill opacity. @default 0.9 */
  fillOpacity?: number
}

export interface ArcSeriesProps<T> {
  /** Raw data rows, one slice each. */
  data: T[]
  /** Value accessor — drives slice angle. */
  value: NumericAccessor<T>
  /** Optional name accessor, exposed on slice events. */
  name?: StringAccessor<T>
  /** Per-slice color accessor. Defaults to the categorical palette by index. */
  color?: StringAccessor<T>
  /** Inner radius as a fraction of the outer radius. `0` = pie. @default 0.6 */
  innerRadius?: number
  /** Angular gap between slices, in radians. @default 0.015 */
  padAngle?: number
  /** Corner radius of slices in pixels. @default 2 */
  cornerRadius?: number
}

export interface ArcSliceDatum<T> {
  datum: T
  index: number
  name: string | undefined
  value: number
}
