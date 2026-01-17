import type { DatePickerEmits, DatePickerProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDatePicker from './src/TxDatePicker.vue'

const DatePicker = withInstall(TxDatePicker)

export { DatePicker, TxDatePicker }
export type { DatePickerEmits, DatePickerProps }
export type TxDatePickerInstance = InstanceType<typeof TxDatePicker>

export default DatePicker
