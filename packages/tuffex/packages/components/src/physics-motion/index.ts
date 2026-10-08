import { withInstall } from '../../../utils/withInstall'
import TxPhysicsMotion from './src/TxPhysicsMotion.vue'

/** Independently retained Amicro geometry, choreography and replay controls. @public */
const PhysicsMotion = withInstall(TxPhysicsMotion)
export { PhysicsMotion, TxPhysicsMotion }
export { PHYSICS_MOTION_SOURCES } from './src/scenes'
export { PHYSICS_MOTION_DEFAULT_LABELS, PHYSICS_MOTION_VARIANTS } from './src/types'
export type { PhysicsMotionEmits, PhysicsMotionLabels, PhysicsMotionProps, PhysicsMotionSource, PhysicsMotionTrigger, PhysicsMotionVariant } from './src/types'
export type TxPhysicsMotionInstance = InstanceType<typeof TxPhysicsMotion>
export default PhysicsMotion
