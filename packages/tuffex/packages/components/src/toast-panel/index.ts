import { withInstall } from '../../../utils/withInstall'
import TxToastPanel from './src/TxToastPanel.vue'

/**
 * TxToastPanel — an item surfacing beneath the surface it came from.
 *
 * Not to be confused with `TxToastHost`, which is the global stack of
 * transient notifications driven by `toastStore`. This one is anchored to a
 * specific surface, fully controlled, and its dashed tether is what says
 * "this came from *that*".
 *
 * @example
 * ```ts
 * import { TxToastPanel } from '@talex-touch/tuffex'
 *
 * // <TxToastPanel :open="hasLatest" :stack="1">…</TxToastPanel>
 * ```
 *
 * @public
 */
withInstall(TxToastPanel)

export { TxToastPanel }
export type { ToastPanelProps, ToastPanelSide } from './src/types'
export type TxToastPanelInstance = InstanceType<typeof TxToastPanel>

export default TxToastPanel
