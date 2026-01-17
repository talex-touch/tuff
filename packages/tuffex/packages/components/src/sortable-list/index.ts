import type { SortableListEmits, SortableListItem, SortableListProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSortableList from './src/TxSortableList.vue'

const SortableList = withInstall(TxSortableList)

export { SortableList, TxSortableList }
export type { SortableListEmits, SortableListItem, SortableListProps }
export type TxSortableListInstance = InstanceType<typeof TxSortableList>

export default SortableList
