import type { TxIconButtonProps } from './src/icon-button'
import type { SplitButtonEmits, SplitButtonProps } from './src/split-button'
import type { ButtonEmits, ButtonProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/button.vue'
import copyButtonComponent from './src/copy-button.vue'
import iconButtonComponent from './src/icon-button.vue'
import splitButtonComponent from './src/split-button.vue'
import './src/style/index.scss'

const TxButton = withInstall(component)
const TxSplitButton = withInstall(splitButtonComponent)
const TxIconButton = withInstall(iconButtonComponent)
const TxCopyButton = withInstall(copyButtonComponent)

export {
  TxButton,
  TxCopyButton,
  TxIconButton,
  TxSplitButton,
}

export type { TxIconButtonProps }
export type TxButtonProps = ButtonProps
export type TxButtonEmits = ButtonEmits
export type TxButtonInstance = InstanceType<typeof component>
export type TxSplitButtonProps = SplitButtonProps
export type TxSplitButtonEmits = SplitButtonEmits
export type TxSplitButtonInstance = InstanceType<typeof splitButtonComponent>
export type TxIconButtonInstance = InstanceType<typeof iconButtonComponent>
export type TxCopyButtonInstance = InstanceType<typeof copyButtonComponent>

export default TxButton
