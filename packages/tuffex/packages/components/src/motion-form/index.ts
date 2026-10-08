import { withInstall } from '../../../utils/withInstall'
import component from './src/TxMotionForm.vue'

export const TxMotionForm = withInstall(component)
export { MOTION_FORM_DEFAULT_LABELS, MOTION_FORM_VARIANTS } from './src/types'
export type {
  MotionFormEmits,
  MotionFormLabels,
  MotionFormOption,
  MotionFormProps,
  MotionFormSlots,
  MotionFormStatus,
  MotionFormValue,
  MotionFormVariant,
} from './src/types'
export type TxMotionFormInstance = InstanceType<typeof component>
export default TxMotionForm
