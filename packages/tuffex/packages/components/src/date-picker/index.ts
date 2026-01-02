import TxDatePicker from './src/TxDatePicker.vue'
import { withInstall } from '../../../utils/withInstall'
import type { DatePickerEmits, DatePickerProps } from './src/types'

const DatePicker = withInstall(TxDatePicker)

export { DatePicker, TxDatePicker }
export type { DatePickerEmits, DatePickerProps }
export type TxDatePickerInstance = InstanceType<typeof TxDatePicker>

export default DatePicker
