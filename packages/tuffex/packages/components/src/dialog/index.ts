import { withInstall } from '../../../utils/withInstall'
import TxBlowDialog from './src/TxBlowDialog.vue'
import TxBottomDialog from './src/TxBottomDialog.vue'
import TxPopperDialog from './src/TxPopperDialog.vue'
import TxTouchTip from './src/TxTouchTip.vue'
export { asTrustedDialogHtml } from './src/types'
export type {
  BlowDialogProps,
  BottomDialogProps,
  DialogButton,
  DialogButtonType,
  DialogEmits,
  DialogMessageHtml,
  PopperDialogProps,
  TouchTipButton,
  TouchTipProps,
  TrustedDialogHtml,
} from './src/types'

/**
 * TxBottomDialog component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxBottomDialog, TxBlowDialog } from '@talex-touch/tuffex'
 * ```
 *
 * @public
 */
const BottomDialog = withInstall(TxBottomDialog)
const BlowDialog = withInstall(TxBlowDialog)
const PopperDialog = withInstall(TxPopperDialog)
const TouchTip = withInstall(TxTouchTip)

export {
  BlowDialog,
  BottomDialog,
  PopperDialog,
  TouchTip,
  TxBlowDialog,
  TxBottomDialog,
  TxPopperDialog,
  TxTouchTip,
}

export type TxBottomDialogInstance = InstanceType<typeof TxBottomDialog>
export type TxBlowDialogInstance = InstanceType<typeof TxBlowDialog>
export type TxPopperDialogInstance = InstanceType<typeof TxPopperDialog>
export type TxTouchTipInstance = InstanceType<typeof TxTouchTip>

export default BottomDialog
