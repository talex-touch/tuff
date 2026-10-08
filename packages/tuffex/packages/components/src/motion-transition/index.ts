import { withInstall } from '../../../utils/withInstall'
import TxMotionTransitionComponent from './src/TxMotionTransition.vue'

const MotionTransition = withInstall(TxMotionTransitionComponent)

export { MotionTransition, TxMotionTransitionComponent as TxMotionTransition }
export { MOTION_TRANSITION_VARIANTS } from './src/types'
export type {
  MotionTransitionCompletion,
  MotionTransitionEmits,
  MotionTransitionInstance,
  MotionTransitionKey,
  MotionTransitionMode,
  MotionTransitionPhase,
  MotionTransitionProps,
  MotionTransitionReason,
  MotionTransitionSlotProps,
  MotionTransitionStatus,
  MotionTransitionVariant,
} from './src/types'
export type TxMotionTransitionInstance = InstanceType<typeof TxMotionTransitionComponent>

export default MotionTransition
