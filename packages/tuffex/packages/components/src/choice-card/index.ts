import type {
  ChoiceCardColumns,
  ChoiceCardEmits,
  ChoiceCardProps,
  ChoiceOption,
  ChoiceSelectPayload,
  ChoiceStep,
  ChoiceStepLabelFormatter,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxChoiceCard from './src/TxChoiceCard.vue'

/**
 * TxChoiceCard — a question card whose answers are rich rows (icon, label, one line of
 * description), optionally split over steps with a `‹ 1 / 2 ›` pager. Picking a row emits
 * `select`; the host decides whether that moves to the next step (`v-model:step`) or ends.
 *
 * @example
 * ```ts
 * import { TxChoiceCard } from '@talex-touch/tuffex'
 *
 * // <TxChoiceCard v-model:step="step" :steps="steps" @select="onSelect" />
 * ```
 *
 * @public
 */
const ChoiceCard = withInstall(TxChoiceCard)

export { ChoiceCard, TxChoiceCard }
export type {
  ChoiceCardColumns,
  ChoiceCardEmits,
  ChoiceCardProps,
  ChoiceOption,
  ChoiceSelectPayload,
  ChoiceStep,
  ChoiceStepLabelFormatter,
}
export type TxChoiceCardInstance = InstanceType<typeof TxChoiceCard>

export default ChoiceCard
