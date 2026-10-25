import './src/style/index.scss'

export { TxAxis } from './src/axis'
export type { AxisPosition, AxisProps, TxAxisInstance } from './src/axis'

export { CHART_DEFAULT_LABELS, TxChart } from './src/chart'
export type { ChartLabels, ChartProps, TxChartInstance } from './src/chart'

export {
  TxChartLegendItem,
} from './src/chart-legend'

export type {
  ChartLegendItemProps,
  ChartLegendItemVariant,
  TxChartLegendItemInstance,
} from './src/chart-legend'

export {
  ANIMATION_THRESHOLD,
  cubicBezier,
  easings,
  ENTER_DURATION,
  prefersReducedMotion,
  STATE_DURATION,
  tween,
  UPDATE_DURATION,
  useEnterProgress,
  useTweenedNumbers,
} from './src/core/animate'

export type {
  Easing,
  EasingName,
  EnterProgressOptions,
  TweenedNumbersOptions,
  TweenOptions,
} from './src/core/animate'

export {
  chartContextKey,
  useChartContext,
} from './src/core/context'

export type { BarLayout, ChartGesture, ChartKeyLayer, ChartPointer, TxChartContext } from './src/core/context'

export type {
  BandAccessor,
  ChartPadding,
  NumericAccessor,
  PlotArea,
  ScaleKind,
  SeriesExtent,
  StringAccessor,
} from './src/core/types'
export * from './src/dither-chart'
export { TxGrid as TxChartGrid } from './src/grid'
export type { GridProps as ChartGridProps, TxGridInstance as TxChartGridInstance } from './src/grid'

export {
  axisDefaults,
  buildBarChartOption,
  buildFunnelChartOption,
  buildGaugeChartOption,
  buildHeatmapChartOption,
  buildLineChartOption,
  buildPieChartOption,
  buildRadarChartOption,
  buildScatterChartOption,
  buildTreemapChartOption,
  decorateChartOption,
  ECHART_THEME_FALLBACKS,
  echartThemeOption,
  gridDefaults,
  HEATMAP_DEFAULT_LABELS,
  heatmapSelection,
  legendDefaults,
  loadECharts,
  mergeChartOption,
  readEChartThemeTokens,
  tooltipDefaults,
  TxBarChart,
  TxEChart,
  TxFunnelChart,
  TxGaugeChart,
  TxHeatmapChart,
  TxLineChart,
  TxPieChart,
  TxRadarChart,
  TxScatterChart,
  TxTreemapChart,
  visualMapDefaults,
} from './src/echart'
export type {
  BarChartProps,
  BarChartSeriesInput,
  EChartAxisDefaults,
  EChartEmits,
  EChartEventParams,
  EChartGridDefaults,
  EChartLegendDefaults,
  EChartMode,
  EChartProps,
  EChartsRuntime,
  EChartSharedProps,
  EChartThemePreference,
  EChartThemeTokens,
  FunnelChartDatum,
  FunnelChartProps,
  GaugeChartProps,
  HeatmapCell,
  HeatmapChartEmits,
  HeatmapChartProps,
  HeatmapLabels,
  HeatmapSelection,
  LineChartProps,
  LineChartSeriesInput,
  PieChartDatum,
  PieChartProps,
  RadarChartProps,
  RadarIndicator,
  RadarSeriesInput,
  ScatterChartProps,
  ScatterSeriesInput,
  TreemapChartProps,
  TreemapNode,
  TxBarChartInstance,
  TxEChartInstance,
  TxFunnelChartInstance,
  TxGaugeChartInstance,
  TxHeatmapChartInstance,
  TxLineChartInstance,
  TxPieChartInstance,
  TxRadarChartInstance,
  TxScatterChartInstance,
  TxTreemapChartInstance,
} from './src/echart'

export {
  aggregateSeeds,
  LEARNING_CURVE_DEFAULT_LABELS,
  smoothEma,
  TxLearningCurve,
} from './src/learning-curve'
export type {
  CurvePoint,
  LearningCurveLabels,
  LearningCurveProps,
  LearningCurveRun,
  RunCurve,
  TxLearningCurveInstance,
} from './src/learning-curve'

export {
  DEFAULT_MAP_SCALE_VARS,
  MAP_DEFAULT_LABELS,
  MERCATOR_MAX_LAT,
  projectedAspect,
  rampColor,
  rampGradient,
  TxBubbleMap,
  TxChoroplethMap,
} from './src/maps'
export type {
  BubbleMapProps,
  ChoroplethMapProps,
  MapAccessor,
  MapBaseProps,
  MapGeoJson,
  MapLabels,
  MapStyle,
  RoamState,
} from './src/maps'
export * from './src/mono-chart'

export {
  CHART_DARK_COLORS,
  CHART_LIGHT_COLORS,
  ChartPalette,
} from './src/palette'
export type {
  ChartSemanticColorName,
  ChartSequentialPaletteName,
  MapColors,
} from './src/palette'

export {
  computeSankeyLayout,
  offsetSankeyLayout,
  resolveEdgeInset,
  SANKEY_DEFAULT_LABELS,
  TxSankeyChart,
} from './src/sankey'
export type {
  PositionedSankeyLink,
  PositionedSankeyNode,
  SankeyChartProps,
  SankeyLabels,
  SankeyLayoutOptions,
  SankeyLayoutResult,
  SankeyLinkData,
  SankeyNodeData,
  SankeyTooltipParams,
  TxSankeyChartInstance,
} from './src/sankey'

export {
  TxArcSeries,
  TxAreaSeries,
  TxBarSeries,
  TxLineSeries,
  TxScatterSeries,
} from './src/series'
export type {
  ArcSeriesProps,
  ArcSliceDatum,
  AreaSeriesProps,
  BarSeriesProps,
  CartesianSeriesProps,
  LineCurve,
  LineSeriesProps,
  ScatterSeriesProps,
} from './src/series'

export {
  clusterTimeseriesMarkers,
  formatTimestamp,
  getApproximateMarkerClusterInterval,
  splitIncompleteSegments,
  TIMESERIES_DEFAULT_LABELS,
  TxTimeseriesChart,
  TxTimeseriesSkeleton,
} from './src/timeseries'
export type {
  IncompleteSegments,
  TimeseriesChartLabels,
  TimeseriesChartProps,
  TimeseriesData,
  TimeseriesMarker,
  TimeseriesMarkerCluster,
  TimeseriesThreshold,
  TimeseriesTooltipRow,
  TxTimeseriesChartInstance,
} from './src/timeseries'

export { placeTooltip, TxChartTooltip } from './src/tooltip'
export type {
  ChartTooltipProps,
  TooltipPlacement,
  TooltipPlacementInput,
  TooltipRow,
  TxChartTooltipInstance,
} from './src/tooltip'
