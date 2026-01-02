import TxPicker from './src/TxPicker.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  PickerColumn,
  PickerEmits,
  PickerOption,
  PickerProps,
  PickerValue,
} from './src/types'

const Picker = withInstall(TxPicker)

export { Picker, TxPicker }
export type { PickerColumn, PickerEmits, PickerOption, PickerProps, PickerValue }
export type TxPickerInstance = InstanceType<typeof TxPicker>

export default Picker
