import type { SkeletonProps } from './src/types.ts'
import { withInstall } from '../../../utils/withInstall'
import TxCardSkeleton from './src/TxCardSkeleton.vue'
import TxListItemSkeleton from './src/TxListItemSkeleton.vue'
import TxSkeleton from './src/TxSkeleton.vue'

const Skeleton = withInstall(TxSkeleton)
const CardSkeleton = withInstall(TxCardSkeleton)
const ListItemSkeleton = withInstall(TxListItemSkeleton)

export { CardSkeleton, ListItemSkeleton, Skeleton, TxCardSkeleton, TxListItemSkeleton, TxSkeleton }
export type { SkeletonProps }
export type TxSkeletonInstance = InstanceType<typeof TxSkeleton>

export default Skeleton
