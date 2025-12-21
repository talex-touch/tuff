import TxLayoutSkeleton from './src/TxLayoutSkeleton.vue'
import { withInstall } from '../../../utils/withInstall'

const LayoutSkeleton = withInstall(TxLayoutSkeleton)

export { LayoutSkeleton, TxLayoutSkeleton }
export type TxLayoutSkeletonInstance = InstanceType<typeof TxLayoutSkeleton>

export default LayoutSkeleton
