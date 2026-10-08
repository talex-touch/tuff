import { withInstall } from '../../../utils/withInstall'
import component from './src/TxMotionToggle.vue'
const TxMotionToggle = withInstall(component)
export { TxMotionToggle }
export { MOTION_TOGGLE_VARIANTS } from './src/types'
export type { MotionToggleProps, MotionToggleVariant, MotionToggleValue, MotionToggleOption, MotionToggleActivation } from './src/types'
export type TxMotionToggleInstance = InstanceType<typeof component>
export default TxMotionToggle
