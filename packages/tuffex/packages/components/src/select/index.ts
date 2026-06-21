import type {
  TxSelectItemProps,
  TxSelectModelValue,
  TxSelectOption,
  TxSelectOptionGroup,
  TxSelectOptionLike,
  TxSelectProps,
  TxSelectStatus,
  TxSelectValue,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSelect from './src/TxSelect.vue'
import TxSelectItem from './src/TxSelectItem.vue'

const TuffSelect = withInstall(TxSelect)
const TuffSelectItem = withInstall(TxSelectItem)

export { TuffSelect, TuffSelectItem, TxSelect, TxSelectItem }
export type {
  TxSelectItemProps,
  TxSelectModelValue,
  TxSelectOption,
  TxSelectOptionGroup,
  TxSelectOptionLike,
  TxSelectProps,
  TxSelectStatus,
  TxSelectValue,
}
export { SELECT_KEY } from './src/types'
export type { TxSelectContext } from './src/types'
export type TxSelectInstance = InstanceType<typeof TxSelect>
export type TxSelectItemInstance = InstanceType<typeof TxSelectItem>

export default TuffSelect
