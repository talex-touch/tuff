import type { BarChartProps, BarChartSeriesInput } from './src/options/bar'
import type { FunnelChartDatum, FunnelChartProps } from './src/options/funnel'
import type { GaugeChartProps } from './src/options/gauge'
import type { HeatmapChartProps } from './src/options/heatmap'
import type { LineChartProps, LineChartSeriesInput } from './src/options/line'
import type { PieChartDatum, PieChartProps } from './src/options/pie'
import type { RadarChartProps, RadarIndicator, RadarSeriesInput } from './src/options/radar'
import type { ScatterChartProps, ScatterSeriesInput } from './src/options/scatter'
import type { TreemapChartProps, TreemapNode } from './src/options/treemap'
import type { EChartProps } from './src/core/types'
import { withInstall } from '../utils/with-install'
import barComponent from './src/TxBarChart.vue'
import echartComponent from './src/TxEChart.vue'
import funnelComponent from './src/TxFunnelChart.vue'
import gaugeComponent from './src/TxGaugeChart.vue'
import heatmapComponent from './src/TxHeatmapChart.vue'
import lineComponent from './src/TxLineChart.vue'
import pieComponent from './src/TxPieChart.vue'
import radarComponent from './src/TxRadarChart.vue'
import scatterComponent from './src/TxScatterChart.vue'
import treemapComponent from './src/TxTreemapChart.vue'

const TxEChart = withInstall(echartComponent)
const TxLineChart = withInstall(lineComponent)
const TxBarChart = withInstall(barComponent)
const TxPieChart = withInstall(pieComponent)
const TxFunnelChart = withInstall(funnelComponent)
const TxRadarChart = withInstall(radarComponent)
const TxGaugeChart = withInstall(gaugeComponent)
const TxScatterChart = withInstall(scatterComponent)
const TxHeatmapChart = withInstall(heatmapComponent)
const TxTreemapChart = withInstall(treemapComponent)

export {
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
}

export type { EChartProps }
export type { BarChartProps, BarChartSeriesInput }
export type { FunnelChartDatum, FunnelChartProps }
export type { GaugeChartProps }
export type { HeatmapChartProps }
export type { LineChartProps, LineChartSeriesInput }
export type { PieChartDatum, PieChartProps }
export type { RadarChartProps, RadarIndicator, RadarSeriesInput }
export type { ScatterChartProps, ScatterSeriesInput }
export type { TreemapChartProps, TreemapNode }

export type TxBarChartInstance = InstanceType<typeof barComponent>
export type TxEChartInstance = InstanceType<typeof echartComponent>
export type TxFunnelChartInstance = InstanceType<typeof funnelComponent>
export type TxGaugeChartInstance = InstanceType<typeof gaugeComponent>
export type TxHeatmapChartInstance = InstanceType<typeof heatmapComponent>
export type TxLineChartInstance = InstanceType<typeof lineComponent>
export type TxPieChartInstance = InstanceType<typeof pieComponent>
export type TxRadarChartInstance = InstanceType<typeof radarComponent>
export type TxScatterChartInstance = InstanceType<typeof scatterComponent>
export type TxTreemapChartInstance = InstanceType<typeof treemapComponent>

export { ECHART_THEME_FALLBACKS, echartThemeOption, readEChartThemeTokens } from './src/core/theme'
export type { EChartMode, EChartThemeTokens } from './src/core/theme'

export {
  axisDefaults,
  decorateChartOption,
  gridDefaults,
  legendDefaults,
  mergeChartOption,
  tooltipDefaults,
  visualMapDefaults,
} from './src/core/shared'
export type { EChartAxisDefaults, EChartGridDefaults, EChartLegendDefaults } from './src/core/shared'

export { loadECharts } from './src/core/loader'
export type { EChartsRuntime } from './src/core/loader'

export type {
  EChartEmits,
  EChartEventParams,
  EChartSharedProps,
  EChartThemePreference,
} from './src/core/types'

export { buildBarChartOption } from './src/options/bar'
export { buildFunnelChartOption } from './src/options/funnel'
export { buildGaugeChartOption } from './src/options/gauge'
export { buildHeatmapChartOption } from './src/options/heatmap'
export { buildLineChartOption } from './src/options/line'
export { buildPieChartOption } from './src/options/pie'
export { buildRadarChartOption } from './src/options/radar'
export { buildScatterChartOption } from './src/options/scatter'
export { buildTreemapChartOption } from './src/options/treemap'

export default TxEChart
