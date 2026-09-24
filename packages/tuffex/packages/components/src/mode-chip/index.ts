import type { ModeChipProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxModeChip from './src/TxModeChip.vue'

/**
 * TxModeChip — a button that names the mode a surface is in ("Request approval",
 * "Unrestricted access") and morphs when the mode changes: the icon scales out
 * and in, the label blur-crossfades a beat behind it, and the tinted fill and
 * width follow. Hover switches colour at once.
 *
 * @example
 * ```ts
 * import { TxModeChip } from '@talex-touch/tuffex'
 *
 * // The label names the mode in effect, so it carries the state: no `aria-pressed`,
 * // which a toggle may only pair with a label that stays the same (WAI-ARIA APG).
 * // <TxModeChip :label="label" :icon="icon" :tone="tone" @click="toggle" />
 * ```
 *
 * @public
 */
const ModeChip = withInstall(TxModeChip)

export { ModeChip, TxModeChip }
export type { ModeChipProps }
export type TxModeChipInstance = InstanceType<typeof TxModeChip>

export default ModeChip
