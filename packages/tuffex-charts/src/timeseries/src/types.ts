/** A single data series rendered on a `TxTimeseriesChart`. */
export interface TimeseriesData {
  /** Display name shown in tooltips and legends. */
  name: string
  /** Array of `[timestamp_ms, value]` tuples ordered by time. */
  data: Array<[number, number]>
  /**
   * Series color. Optional (kumo requires it): defaults to the categorical
   * palette by series position.
   */
  color?: string
}

/** Vertical reference marker on the time axis. */
export interface TimeseriesMarker {
  /** Unix timestamp in milliseconds. */
  timestamp: number
  /** Short label shown on/near the marker. */
  label?: string
  /** Optional longer tooltip/body text. */
  description?: string
  /** Optional marker color. Defaults to the neutral chart text color. */
  color?: string
  /** Optional line style. Defaults to dashed. */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
}

/** A cluster of markers close enough on the axis to render as one line. */
export interface TimeseriesMarkerCluster {
  timestamp: number
  label?: string
  color?: string
  lineStyle?: TimeseriesMarker['lineStyle']
  markers: TimeseriesMarker[]
}

/** Horizontal threshold line on the value axis. */
export interface TimeseriesThreshold {
  /** Y-axis value where the threshold line is rendered. */
  value: number
  /** Optional label shown near the threshold line. */
  label?: string
  /** Threshold line and label color. */
  color: string
}

export interface TimeseriesChartProps {
  /** Visual style of each series. @default 'line' */
  type?: 'line' | 'bar'
  /** Time series to display. */
  data: TimeseriesData[]
  /** Vertical reference markers rendered on the time axis. */
  markers?: TimeseriesMarker[]
  /** Horizontal threshold lines rendered on the value axis. */
  thresholds?: TimeseriesThreshold[]
  /** Label for the x (time) axis. */
  xAxisName?: string
  /** Number of ticks on the x axis. @default 5 */
  xAxisTickCount?: number
  /** Custom x tick formatter (receives the timestamp in ms). */
  xAxisTickFormat?: (value: number) => string
  /** Label for the y (value) axis. */
  yAxisName?: string
  /** Number of ticks on the y axis. @default 5 */
  yAxisTickCount?: number
  /** Custom y tick formatter. */
  yAxisTickFormat?: (value: number) => string
  /** Custom formatter for tooltip values. Defaults to the raw value. */
  tooltipValueFormat?: (value: number) => string
  /**
   * `all` shows every series at the hovered timestamp; `single` shows only
   * the series whose value is closest to the cursor. @default 'all'
   */
  tooltipMode?: 'all' | 'single'
  /** Max series rows in the tooltip (`all` mode); the rest fold into "+N more". @default 10 */
  tooltipMaxItems?: number
  /** Tooltip cursor tracking — see `TxChartTooltip`. @default 'both' */
  tooltipFollowCursor?: 'both' | 'x'
  /** Marks data outside `[before, after]` as incomplete (dashed, line type only). */
  incomplete?: { before?: number, after?: number }
  /** Vertical gradient fill under line series. @default false */
  gradient?: boolean
  /** Renders a skeleton instead of the chart. @default false */
  loading?: boolean
  /** Chart height in pixels. @default 350 */
  height?: number
  /**
   * Explicit chart width in pixels. When omitted the chart measures its
   * container. Useful for SSR and tests.
   */
  width?: number
  /** Accessible description announced for the chart. */
  ariaDescription?: string
  /**
   * Name of a series to emphasize: every other series dims to 30% opacity.
   * Drive it from legend hover (the kumo legend-highlight behavior).
   */
  highlightedSeries?: string | null
  /** Label for a multi-marker cluster. @default n => `${n} changes` */
  clusterLabel?: (count: number) => string
  /** Formatter for tooltip timestamps. Defaults to a compact locale format. */
  timestampFormat?: (ts: number) => string
}
