import '../style/index.scss'
import type { LearningCurveLabels, LearningCurveProps, LearningCurveRun } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxLearningCurve.vue'

const TxLearningCurve = withInstall(component)

export { TxLearningCurve }
export { aggregateSeeds, smoothEma } from './src/smoothing'
export type { CurvePoint, RunCurve } from './src/smoothing'
export { LEARNING_CURVE_DEFAULT_LABELS } from './src/types'
export type { LearningCurveLabels, LearningCurveProps, LearningCurveRun }
export type TxLearningCurveInstance = InstanceType<typeof component>

export default TxLearningCurve
