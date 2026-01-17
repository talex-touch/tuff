import type {
  PickerColumn,
  PickerEmits,
  PickerOption,
  PickerProps,
  PickerValue,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxPicker from './src/TxPicker.vue'

const Picker = withInstall(TxPicker)

export { Picker, TxPicker }
export type { PickerColumn, PickerEmits, PickerOption, PickerProps, PickerValue }
export type TxPickerInstance = InstanceType<typeof TxPicker>

export default Picker
