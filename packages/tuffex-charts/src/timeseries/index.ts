import type {
  TimeseriesChartProps,
  TimeseriesData,
  TimeseriesMarker,
  TimeseriesMarkerCluster,
  TimeseriesThreshold,
} from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxTimeseriesChart.vue'
import skeleton from './src/TxTimeseriesSkeleton.vue'

const TxTimeseriesChart = withInstall(component)
const TxTimeseriesSkeleton = withInstall(skeleton)

export { TxTimeseriesChart, TxTimeseriesSkeleton }
export { BRUSH_MIN_DRAG_PX, brushRange, brushRect } from './src/brush'
export { formatTimestamp } from './src/format'
export { splitIncompleteSegments } from './src/incomplete'
export type { IncompleteSegments } from './src/incomplete'
export { clusterTimeseriesMarkers, getApproximateMarkerClusterInterval } from './src/markers'
export { findNearest, getAllTooltipRowsAtTimestamp, limitTooltipRows } from './src/tooltip-data'
export type { TimeseriesTooltipRow } from './src/tooltip-data'
export type {
  TimeseriesChartProps,
  TimeseriesData,
  TimeseriesMarker,
  TimeseriesMarkerCluster,
  TimeseriesThreshold,
}
export type TxTimeseriesChartInstance = InstanceType<typeof component>

export default TxTimeseriesChart
