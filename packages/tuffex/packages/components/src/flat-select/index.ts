import type { TxFlatSelectItemProps, TxFlatSelectProps, TxFlatSelectValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlatSelect from './src/TxFlatSelect.vue'
import TxFlatSelectItem from './src/TxFlatSelectItem.vue'

const FlatSelect = withInstall(TxFlatSelect)
const FlatSelectItem = withInstall(TxFlatSelectItem)

export { FlatSelect, FlatSelectItem, TxFlatSelect, TxFlatSelectItem }
export type { TxFlatSelectProps, TxFlatSelectItemProps, TxFlatSelectValue }
export { FLAT_SELECT_KEY } from './src/types'
export type { TxFlatSelectContext } from './src/types'
export type TxFlatSelectInstance = InstanceType<typeof TxFlatSelect>
export type TxFlatSelectItemInstance = InstanceType<typeof TxFlatSelectItem>

export default FlatSelect
