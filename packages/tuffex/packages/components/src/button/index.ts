import component from './src/button.vue'
import splitButtonComponent from './src/split-button.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ButtonProps, ButtonEmits } from './src/types'
import type { SplitButtonProps, SplitButtonEmits } from './src/split-button'

const TxButton = withInstall(component)
const TxSplitButton = withInstall(splitButtonComponent)

export {
  TxButton,
  TxSplitButton,
}

export type TxButtonProps = ButtonProps
export type TxButtonEmits = ButtonEmits
export type TxButtonInstance = InstanceType<typeof component>
export type TxSplitButtonProps = SplitButtonProps
export type TxSplitButtonEmits = SplitButtonEmits
export type TxSplitButtonInstance = InstanceType<typeof splitButtonComponent>

export default TxButton
