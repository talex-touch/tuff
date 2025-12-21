import TxSkeleton from './src/TxSkeleton.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SkeletonProps } from './src/types.ts'

const Skeleton = withInstall(TxSkeleton)

export { Skeleton, TxSkeleton }
export type { SkeletonProps }
export type TxSkeletonInstance = InstanceType<typeof TxSkeleton>

export default Skeleton
