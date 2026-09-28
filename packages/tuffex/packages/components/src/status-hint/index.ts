import type { StatusHintProps, StatusHintSize } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxStatusHint from './src/TxStatusHint.vue'

/**
 * TxStatusHint — a one-line outcome ("Copied", "Could not pin") over a faint, grainy wash of
 * its tone that rises from the leading edge and fades out towards the far end. The text lands
 * from a slight scale-up, a new message morphs out of the old one character by character, and
 * the same message arriving again (a new `pulseKey`) replays the emphasis.
 *
 * @example
 * ```ts
 * import { TxStatusHint } from '@talex-touch/tuffex'
 *
 * // Keep it mounted while messages change, so the text morphs rather than remounting; wrap
 * // it in <Transition name="tx-status-hint"> to let the wash fade out when it goes.
 * // <Transition name="tx-status-hint">
 * //   <TxStatusHint v-if="feedback" :text="feedback.message" :tone="feedback.tone" :pulse-key="feedback.id" />
 * // </Transition>
 * ```
 *
 * @public
 */
const StatusHint = withInstall(TxStatusHint)

export { StatusHint, TxStatusHint }
export type { StatusHintProps, StatusHintSize }
export type TxStatusHintInstance = InstanceType<typeof TxStatusHint>

export default StatusHint
