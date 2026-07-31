import type { SortableListEmits, SortableListItem, SortableListProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSortableList from './src/TxSortableList.vue'

const SortableList = withInstall(TxSortableList)

export { SortableList, TxSortableList }
export type { SortableListEmits, SortableListItem, SortableListProps }
// TxSortableList is a generic SFC (breaks `InstanceType<typeof …>`) and exposes
// no instance methods via defineExpose, so its public ref surface is empty.
export type TxSortableListInstance = Record<string, never>

export default SortableList
