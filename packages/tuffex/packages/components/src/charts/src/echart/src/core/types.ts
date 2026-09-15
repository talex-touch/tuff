import type { ECharts } from 'echarts/core'
import type { EChartsOption } from 'echarts'

export type EChartThemePreference = 'auto' | 'light' | 'dark'


/** Shape of the params ECharts hands to a pointer event handler. */
export interface EChartEventParams {
  /** Component that fired, e.g. `'series'`, `'legend'`. */
  componentType?: string
  /** Series type, present when `componentType` is `'series'`. */
  seriesType?: string
  seriesIndex?: number
  seriesName?: string
  name?: string
  dataIndex?: number
  data?: unknown
  dataType?: string
  value?: unknown
  color?: string
}

export interface EChartProps {
  /**
   * A complete ECharts option — this is the customization hatch, so anything
   * ECharts supports belongs here. It is painted over the themed defaults, so
   * omit what you do not want to override.
   */
  option: EChartsOption
  /** Chart height: a number of px, or any CSS length. @default 320 */
  height?: number | string
  /** Colour scheme; `auto` follows the surrounding theme. @default 'auto' */
  theme?: EChartThemePreference
  /**
   * How a new option is applied. `replace` swaps the series array, so series
   * removed from the option stop being drawn; `merge` keeps ECharts' own
   * component-merge semantics. @default 'replace'
   */
  update?: 'replace' | 'merge'
  /** Accessible name for the canvas container. */
  ariaLabel?: string
  /** Shows the themed loading mask until the option has data. @default false */
  loading?: boolean
}

export interface EChartEmits {
  /** Fired once the instance exists — the imperative handle for anything the option cannot express. */
  (e: 'ready', instance: ECharts): void
  (e: 'click', params: EChartEventParams): void
  (e: 'dblclick', params: EChartEventParams): void
  (e: 'mouseover', params: EChartEventParams): void
  (e: 'mouseout', params: EChartEventParams): void
  (e: 'legendselectchanged', params: EChartEventParams): void
  (e: 'datazoom', params: EChartEventParams): void
}

/** Options every chart in the ECharts family accepts on top of its own props. */
export interface EChartSharedProps {
  option?: EChartsOption
  height?: number | string
  theme?: EChartThemePreference
  ariaLabel?: string
  loading?: boolean
}
