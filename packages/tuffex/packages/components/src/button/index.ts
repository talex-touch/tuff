import component from './src/button.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ButtonProps, ButtonEmits } from './src/types'

const TxButton = withInstall(component)

export {
  TxButton
}

export type TxButtonProps = ButtonProps
export type TxButtonEmits = ButtonEmits
export type TxButtonInstance = InstanceType<typeof component>

export default TxButton