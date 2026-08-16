import type { IconChipProps, IconChipShape, IconChipTone, IconChipVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxIconChip from './src/TxIconChip.vue'

/**
 * TxIconChip — the small filled plate that carries a file-type badge, a
 * workspace initial or a glyph in the Beautiful UI family.
 *
 * @example
 * ```ts
 * import { TxIconChip } from '@talex-touch/tuffex'
 *
 * // <TxIconChip :size="14" tone="red" label="PDF" />
 * ```
 *
 * @public
 */
const IconChip = withInstall(TxIconChip)

export { IconChip, TxIconChip }
export type { IconChipProps, IconChipShape, IconChipTone, IconChipVariant }
export type TxIconChipInstance = InstanceType<typeof TxIconChip>

export default IconChip
