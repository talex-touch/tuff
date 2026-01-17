import { withInstall } from '../../../utils/withInstall'
import TxLayoutSkeleton from './src/TxLayoutSkeleton.vue'

const LayoutSkeleton = withInstall(TxLayoutSkeleton)

export { LayoutSkeleton, TxLayoutSkeleton }
export type TxLayoutSkeletonInstance = InstanceType<typeof TxLayoutSkeleton>

export default LayoutSkeleton
