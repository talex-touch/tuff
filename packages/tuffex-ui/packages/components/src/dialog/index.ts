import TxBottomDialog from './src/TxBottomDialog.vue'
import TxBlowDialog from './src/TxBlowDialog.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  BottomDialogProps,
  BlowDialogProps,
  DialogButton,
  DialogButtonType,
  DialogEmits,
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

export {
  BottomDialog,
  BlowDialog,
  TxBottomDialog,
  TxBlowDialog,
}

export type {
  BottomDialogProps,
  BlowDialogProps,
  DialogButton,
  DialogButtonType,
  DialogEmits,
}

export type TxBottomDialogInstance = InstanceType<typeof TxBottomDialog>
export type TxBlowDialogInstance = InstanceType<typeof TxBlowDialog>

export default BottomDialog
