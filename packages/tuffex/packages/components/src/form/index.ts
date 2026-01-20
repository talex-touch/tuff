import type {
  FormEmits,
  FormItemEmits,
  FormItemProps,
  FormLabelPosition,
  FormProps,
  FormRule,
  FormRules,
  FormSize,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxForm from './src/TxForm.vue'
import TxFormItem from './src/TxFormItem.vue'

const Form = withInstall(TxForm)
const FormItem = withInstall(TxFormItem)

export { Form, FormItem, TxForm, TxFormItem }
export type {
  FormEmits,
  FormItemEmits,
  FormItemProps,
  FormLabelPosition,
  FormProps,
  FormRule,
  FormRules,
  FormSize,
}
export type TxFormInstance = InstanceType<typeof TxForm>
export type TxFormItemInstance = InstanceType<typeof TxFormItem>

export default Form
