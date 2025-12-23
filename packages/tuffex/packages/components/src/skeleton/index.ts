import TxSkeleton from './src/TxSkeleton.vue'
import TxCardSkeleton from './src/TxCardSkeleton.vue'
import TxListItemSkeleton from './src/TxListItemSkeleton.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SkeletonProps } from './src/types.ts'

const Skeleton = withInstall(TxSkeleton)
const CardSkeleton = withInstall(TxCardSkeleton)
const ListItemSkeleton = withInstall(TxListItemSkeleton)

export { Skeleton, TxSkeleton, CardSkeleton, TxCardSkeleton, ListItemSkeleton, TxListItemSkeleton }
export type { SkeletonProps }
export type TxSkeletonInstance = InstanceType<typeof TxSkeleton>

export default Skeleton
