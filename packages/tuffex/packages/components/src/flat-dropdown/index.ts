import type {
  Placement,
  TxFlatDropdownClass,
  TxFlatDropdownContentSlotProps,
  TxFlatDropdownProps,
  TxFlatDropdownTrigger,
  TxFlatDropdownTriggerSlotProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlatDropdown from './src/TxFlatDropdown.vue'

const FlatDropdown = withInstall(TxFlatDropdown)

export { FlatDropdown, TxFlatDropdown }
export type {
  Placement,
  TxFlatDropdownClass,
  TxFlatDropdownContentSlotProps,
  TxFlatDropdownProps,
  TxFlatDropdownTrigger,
  TxFlatDropdownTriggerSlotProps,
}
export type TxFlatDropdownInstance = InstanceType<typeof TxFlatDropdown>

export default FlatDropdown
