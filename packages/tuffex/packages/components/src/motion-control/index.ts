import { withInstall } from '../../../utils/withInstall'
import TxMotionControl from './src/TxMotionControl.vue'

/**
 * Source-mapped Amicro UIkit controls composed with TuffEx semantic primitives.
 * @example <TxMotionControl v-model="saved" variant="yui-save-pill" />
 * @public
 */
const MotionControl = withInstall(TxMotionControl)
export { MotionControl, TxMotionControl }
export { MOTION_CONTROL_SOURCES } from './src/catalog'
export type { MotionControlSource } from './src/catalog'
export { MOTION_CONTROL_DEFAULT_LABELS, MOTION_CONTROL_VARIANTS } from './src/types'
export type { MotionControlEmits, MotionControlItem, MotionControlLabels, MotionControlProps, MotionControlStatus, MotionControlValue, MotionControlVariant } from './src/types'
export type TxMotionControlInstance = InstanceType<typeof TxMotionControl>
export default MotionControl
