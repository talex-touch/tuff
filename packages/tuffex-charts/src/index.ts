import './style/index.scss'

export { TxAxis } from './axis'
export type { AxisPosition, AxisProps, TxAxisInstance } from './axis'

export { TxChart } from './chart'
export type { ChartProps, TxChartInstance } from './chart'

export {
  TxChartLegendItem,
} from './chart-legend'

export type {
  ChartLegendItemProps,
  ChartLegendItemVariant,
  TxChartLegendItemInstance,
} from './chart-legend'

export {
  chartContextKey,
  useChartContext,
} from './core/context'

export type { BarLayout, ChartPointer, TxChartContext } from './core/context'

export type {
  BandAccessor,
  ChartPadding,
  NumericAccessor,
  PlotArea,
  ScaleKind,
  SeriesExtent,
  StringAccessor,
} from './core/types'
export { TxGrid } from './grid'
export type { GridProps, TxGridInstance } from './grid'

export {
  CHART_DARK_COLORS,
  CHART_LIGHT_COLORS,
  ChartPalette,
} from './palette'
export type {
  ChartSemanticColorName,
  ChartSequentialPaletteName,
  MapColors,
} from './palette'

export {
  TxArcSeries,
  TxAreaSeries,
  TxBarSeries,
  TxLineSeries,
  TxScatterSeries,
} from './series'
export type {
  ArcSeriesProps,
  ArcSliceDatum,
  AreaSeriesProps,
  BarSeriesProps,
  CartesianSeriesProps,
  LineCurve,
  LineSeriesProps,
  ScatterSeriesProps,
} from './series'

export {
  clusterTimeseriesMarkers,
  formatTimestamp,
  getApproximateMarkerClusterInterval,
  splitIncompleteSegments,
  TxTimeseriesChart,
  TxTimeseriesSkeleton,
} from './timeseries'
export type {
  IncompleteSegments,
  TimeseriesChartProps,
  TimeseriesData,
  TimeseriesMarker,
  TimeseriesMarkerCluster,
  TimeseriesThreshold,
  TimeseriesTooltipRow,
  TxTimeseriesChartInstance,
} from './timeseries'

export { placeTooltip, TxChartTooltip } from './tooltip'
export type {
  ChartTooltipProps,
  TooltipPlacement,
  TooltipPlacementInput,
  TooltipRow,
  TxChartTooltipInstance,
} from './tooltip'
