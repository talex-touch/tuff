import type {
  DatePickerEmits,
  DatePickerMode,
  DatePickerPanelView,
  DatePickerPreset,
  DatePickerProps,
  DatePickerValue,
  DatePickerVariant,
  DateRangeValue,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDatePicker from './src/TxDatePicker.vue'

const DatePicker = withInstall(TxDatePicker)

export { DatePicker, TxDatePicker }
export type {
  DatePickerEmits,
  DatePickerMode,
  DatePickerPanelView,
  DatePickerPreset,
  DatePickerProps,
  DatePickerValue,
  DatePickerVariant,
  DateRangeValue,
}
export type TxDatePickerInstance = InstanceType<typeof TxDatePicker>

export default DatePicker
