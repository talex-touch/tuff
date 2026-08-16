import type {
  RecommendationCardEmits,
  RecommendationCardProps,
  RecommendationConfidence,
  RecommendationCtaTone,
  RecommendationOption,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxRecommendationCard from './src/TxRecommendationCard.vue'

/**
 * TxRecommendationCard — an agent suggestion with its confidence, its
 * alternatives, and the action that confirms it.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @example
 * ```ts
 * import { TxRecommendationCard } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxRecommendationCard v-model="key" title="Place this order?" :options="options" @accept="run" />
 * ```
 *
 * @public
 */
const RecommendationCard = withInstall(TxRecommendationCard)

export { RecommendationCard, TxRecommendationCard }
export type {
  RecommendationCardEmits,
  RecommendationCardProps,
  RecommendationConfidence,
  RecommendationCtaTone,
  RecommendationOption,
}
export type TxRecommendationCardInstance = InstanceType<typeof TxRecommendationCard>

export default RecommendationCard
