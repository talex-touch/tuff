import TxBottomDialog from './src/TxBottomDialog.vue'
import TxBlowDialog from './src/TxBlowDialog.vue'
import TxPopperDialog from './src/TxPopperDialog.vue'
import TxTouchTip from './src/TxTouchTip.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  BottomDialogProps,
  BlowDialogProps,
  PopperDialogProps,
  DialogButton,
  DialogButtonType,
  DialogEmits,
  TouchTipButton,
  TouchTipProps,
} from './src/types'

/**
 * TxBottomDialog component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxBottomDialog, TxBlowDialog } from '@talex-touch/tuff-ui'
 * ```
 *
 * @public
 */
const BottomDialog = withInstall(TxBottomDialog)
const BlowDialog = withInstall(TxBlowDialog)
const PopperDialog = withInstall(TxPopperDialog)
const TouchTip = withInstall(TxTouchTip)

export {
  BottomDialog,
  BlowDialog,
  PopperDialog,
  TouchTip,
  TxBottomDialog,
  TxBlowDialog,
  TxPopperDialog,
  TxTouchTip,
}

export type {
  BottomDialogProps,
  BlowDialogProps,
  PopperDialogProps,
  DialogButton,
  DialogButtonType,
  DialogEmits,
  TouchTipButton,
  TouchTipProps,
}

export type TxBottomDialogInstance = InstanceType<typeof TxBottomDialog>
export type TxBlowDialogInstance = InstanceType<typeof TxBlowDialog>
export type TxPopperDialogInstance = InstanceType<typeof TxPopperDialog>
export type TxTouchTipInstance = InstanceType<typeof TxTouchTip>

export default BottomDialog
