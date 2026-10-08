import { withInstall } from '../../../utils/withInstall'
import TxMotionDock from './src/TxMotionDock.vue'

/** Caller-owned, adjacent-magnifying spring dock with pointer and keyboard reorder. @public */
const MotionDock = withInstall(TxMotionDock)
export { MotionDock, TxMotionDock }
export { MOTION_DOCK_DEFAULT_LABELS } from './src/types'
export type { MotionDockEmits, MotionDockId, MotionDockItem, MotionDockLabels, MotionDockProps, MotionDockReorder } from './src/types'
export type TxMotionDockInstance = InstanceType<typeof TxMotionDock>
export default MotionDock
