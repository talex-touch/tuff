import { withInstall } from '../../../utils/withInstall'
import TxMotionMetric from './src/TxMotionMetric.vue'
/** Caller-driven Amicro metrics, dashboards and native filtering. @public */
const MotionMetric = withInstall(TxMotionMetric)
export { MotionMetric, TxMotionMetric }
export { MOTION_METRIC_CATALOG, MOTION_METRIC_COMPOSITES, MOTION_METRIC_DEFAULT_LABELS, MOTION_METRIC_INTERACTIONS, MOTION_METRIC_VARIANTS } from './src/types'
export { MOTION_METRIC_SOURCE_MAP } from './src/source-map'
export type { MotionMetricCell, MotionMetricData, MotionMetricEmits, MotionMetricGroup, MotionMetricInteraction, MotionMetricLabels, MotionMetricMessage, MotionMetricPeriod, MotionMetricPoint, MotionMetricProfile, MotionMetricProps, MotionMetricReadout, MotionMetricSeries, MotionMetricStep, MotionMetricTone, MotionMetricVariant } from './src/types'
export type TxMotionMetricInstance = InstanceType<typeof TxMotionMetric>
export default MotionMetric
