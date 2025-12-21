import TxSortableList from './src/TxSortableList.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SortableListEmits, SortableListItem, SortableListProps } from './src/types'

const SortableList = withInstall(TxSortableList)

export { SortableList, TxSortableList }
export type { SortableListProps, SortableListEmits, SortableListItem }
export type TxSortableListInstance = InstanceType<typeof TxSortableList>

export default SortableList
