// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import { withInstall } from '../../../utils/withInstall'
import TxFineTuneCard from './src/TxFineTuneCard.vue'

/**
 * TxFineTuneCard — the compact property inspector: a layout segmented control,
 * four scrubbable numeric fields and a type picker, over one `values` object.
 *
 * The segmented control is `TxFlatRadio`, so the layout choice arrives with
 * roving arrow-key focus rather than a row of toggle buttons.
 *
 * @example
 * ```ts
 * import { TxFineTuneCard } from '@talex-touch/tuffex'
 *
 * // <TxFineTuneCard v-model:values="values" :defaults="defaults" :type-options="types" />
 * ```
 *
 * @public
 */
const FineTuneCard = withInstall(TxFineTuneCard)

export { FineTuneCard, TxFineTuneCard }
export type {
  FineTuneCardEmits,
  FineTuneCardProps,
  FineTuneField,
  FineTuneLayout,
  FineTuneRange,
  FineTuneTypeOption,
  FineTuneValues,
} from './src/types'
export type TxFineTuneCardInstance = InstanceType<typeof TxFineTuneCard>

export default FineTuneCard
