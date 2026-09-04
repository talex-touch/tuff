/** Accessor for a numeric value on a datum: a key of `T`, or a function of the datum. */
export type NumericAccessor<T> = keyof T | ((d: T, index: number) => number)

/** Accessor for a string value on a datum: a key of `T`, or a function of the datum. */
export type StringAccessor<T> = keyof T | ((d: T, index: number) => string)

/** Accessor for a band/category value on the x axis. */
export type BandAccessor<T> = keyof T | ((d: T, index: number) => string | number)

/** Kind of x scale a chart uses. */
export type ScaleKind = 'linear' | 'time' | 'band'

/** The drawable region of a chart, in SVG pixel coordinates. */
export interface PlotArea {
  x: number
  y: number
  width: number
  height: number
}

/** Per-side chart padding. */
export interface ChartPadding {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Data extent a series reports to its chart so axis domains can be derived
 * automatically. Continuous series fill `x`/`y`; band series fill `xBand`.
 */
export interface SeriesExtent {
  x?: [number, number] | null
  xBand?: Array<string | number>
  y?: [number, number] | null
}
