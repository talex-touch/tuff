// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import { withInstall } from '../../../utils/withInstall'
import TxInsightCards from './src/TxInsightCards.vue'
import TxInsightMetric from './src/TxInsightMetric.vue'

/**
 * TxInsightCards — the `Insights N ‹ ›` pager: a lede, one card of host
 * content, and a follow-up pill, all keyed off the active page.
 *
 * `TxInsightMetric` is the figure block those cards are built from — a dotted
 * label over a signed headline (U+2212 minus, tabular figures, tone by sign)
 * and a mono detail line.
 *
 * @example
 * ```ts
 * import { TxInsightCards, TxInsightMetric } from '@talex-touch/tuffex'
 *
 * // <TxInsightCards v-model:active-index="page" :pages="pages" @follow-up="ask">
 * //   <template #default="{ page }"><FlavourCard :key="page.key" /></template>
 * // </TxInsightCards>
 * ```
 *
 * @public
 */
const InsightCards = withInstall(TxInsightCards)
const InsightMetric = withInstall(TxInsightMetric)

export { InsightCards, InsightMetric, TxInsightCards, TxInsightMetric }
export type {
  InsightCardsEmits,
  InsightCardsProps,
  InsightMetricProps,
  InsightMetricTone,
  InsightPage,
} from './src/types'
export type TxInsightCardsInstance = InstanceType<typeof TxInsightCards>
export type TxInsightMetricInstance = InstanceType<typeof TxInsightMetric>

export default InsightCards
