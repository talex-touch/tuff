import type { RowSkeletonProps, SkeletonProps, SkeletonVariant } from './src/types'
import type { UseDeferredLoadingOptions } from './src/use-deferred-loading'
import { withInstall } from '../../../utils/withInstall'
import TxCardSkeleton from './src/TxCardSkeleton.vue'
import TxListItemSkeleton from './src/TxListItemSkeleton.vue'
import TxRowSkeleton from './src/TxRowSkeleton.vue'
import TxSkeleton from './src/TxSkeleton.vue'
import { useDeferredLoading } from './src/use-deferred-loading'

const Skeleton = withInstall(TxSkeleton)
const CardSkeleton = withInstall(TxCardSkeleton)
const ListItemSkeleton = withInstall(TxListItemSkeleton)
const RowSkeleton = withInstall(TxRowSkeleton)

export {
  CardSkeleton,
  ListItemSkeleton,
  RowSkeleton,
  Skeleton,
  TxCardSkeleton,
  TxListItemSkeleton,
  TxRowSkeleton,
  TxSkeleton,
  useDeferredLoading,
}
export type { RowSkeletonProps, SkeletonProps, SkeletonVariant, UseDeferredLoadingOptions }
export type TxSkeletonInstance = InstanceType<typeof TxSkeleton>
export type TxRowSkeletonInstance = InstanceType<typeof TxRowSkeleton>

export default Skeleton
