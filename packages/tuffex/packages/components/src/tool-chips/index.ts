import type {
  DiffChipsEmits,
  DiffChipsProps,
  ToolChipDetailLine,
  ToolChipDiff,
  ToolChipIcon,
  ToolChipRow,
  ToolChipsEmits,
  ToolChipsProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDiffChips from './src/TxDiffChips.vue'
import TxToolChips from './src/TxToolChips.vue'

/**
 * TxToolChips — one agent run as compact, individually expandable rows.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @example
 * ```ts
 * import { TxToolChips } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxToolChips :rows="rows" :diffs="diffs" />
 * ```
 *
 * @public
 */
const ToolChips = withInstall(TxToolChips)

/**
 * TxDiffChips — the file-diff summary of a run, usable on its own.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @public
 */
const DiffChips = withInstall(TxDiffChips)

export { DiffChips, ToolChips, TxDiffChips, TxToolChips }
export type {
  DiffChipsEmits,
  DiffChipsProps,
  ToolChipDetailLine,
  ToolChipDiff,
  ToolChipIcon,
  ToolChipRow,
  ToolChipsEmits,
  ToolChipsProps,
}
export type TxToolChipsInstance = InstanceType<typeof TxToolChips>
export type TxDiffChipsInstance = InstanceType<typeof TxDiffChips>

export default ToolChips
