import type { VirtualListEmits, VirtualListItemKey, VirtualListKey, VirtualListProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxVirtualList from './src/TxVirtualList.vue'

const VirtualList = withInstall(TxVirtualList)

export { TxVirtualList, VirtualList }
export type { VirtualListEmits, VirtualListItemKey, VirtualListKey, VirtualListProps }
export interface TxVirtualListInstance {
  scrollToIndex: (index: number) => void
  scrollToTop: () => void
  scrollToBottom: () => void
}

export default VirtualList
