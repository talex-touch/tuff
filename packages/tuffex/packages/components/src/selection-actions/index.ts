import type {
  SelectionActionItem,
  SelectionActionsEmits,
  SelectionActionsProps,
  SelectionActionState,
  SelectionPayload,
} from './src/types'
import type {
  ResolveSelectionInput,
  UseSelectionAnchorOptions,
  UseSelectionAnchorReturn,
} from './src/use-selection-anchor'
import { withInstall } from '../../../utils/withInstall'
import TxSelectionActions from './src/TxSelectionActions.vue'
import { resolveSelectionPayload, useSelectionAnchor } from './src/use-selection-anchor'

/**
 * TxSelectionActions — a floating bar that hands the highlighted passage to an
 * agent.
 *
 * The component is presentation only: pair it with `useSelectionAnchor` for
 * ordinary document text, or feed `selection` yourself from a contenteditable
 * or virtualised surface.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @example
 * ```ts
 * import { TxSelectionActions, useSelectionAnchor } from '@talex-touch/tuffex'
 *
 * const { selection, clear } = useSelectionAnchor({ root: articleRef })
 *
 * // Use in template
 * <TxSelectionActions :selection="selection" :state="state" @action="rewrite" />
 * ```
 *
 * @public
 */
const SelectionActions = withInstall(TxSelectionActions)

export { resolveSelectionPayload, SelectionActions, TxSelectionActions, useSelectionAnchor }
export type {
  ResolveSelectionInput,
  SelectionActionItem,
  SelectionActionsEmits,
  SelectionActionsProps,
  SelectionActionState,
  SelectionPayload,
  UseSelectionAnchorOptions,
  UseSelectionAnchorReturn,
}
export type TxSelectionActionsInstance = InstanceType<typeof TxSelectionActions>

export default SelectionActions
