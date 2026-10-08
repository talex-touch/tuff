import { withInstall } from '../utils/with-install'
import MonoChart from './src/TxMonoChart.vue'

export const TxMonoChart = withInstall(MonoChart)
export { MONO_CHART_VARIANTS } from './src/types'
export { loadGitHubActivity } from './src/activity-source'
export type {
  MonoChartAccent,
  MonoChartActivityLoader,
  MonoChartCandle,
  MonoChartContribution,
  MonoChartCurve,
  MonoChartData,
  MonoChartEmits,
  MonoChartHit,
  MonoChartItem,
  MonoChartLabels,
  MonoChartLayout,
  MonoChartMatrixRow,
  MonoChartPeriod,
  MonoChartPoint,
  MonoChartProps,
  MonoChartRange,
  MonoChartRepo,
  MonoChartScatterPoint,
  MonoChartSeries,
  MonoChartSeriesMode,
  MonoChartTreeNode,
  MonoChartVariant,
  MonoChartWaterfall,
} from './src/types'
export type TxMonoChartInstance = InstanceType<typeof MonoChart>
