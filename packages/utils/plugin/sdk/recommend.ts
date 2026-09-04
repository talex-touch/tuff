import type { RecommendProvider } from '../../core-box/recommendation'
import type { ItemTimeDistribution, TimePattern } from '../../core-box'
import {
  calculateHourAffinity,
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  TIME_CONTEXT_DAY_BOOST,
  TIME_CONTEXT_SLOT_BOOST,
  TIME_RELEVANCE_HOUR_WEIGHT,
  TIME_RELEVANCE_SCALE,
  TIME_RELEVANCE_SLOT_WEIGHT,
} from "../../core-box/recommendation-weights";

/**
 * The host's time-of-use weighting, so a provider can order its candidates on the same axis the
 * grid is ranked by instead of inventing one.
 *
 * Pure functions over arguments the caller supplies — calling them performs no host request and
 * reads no usage data. Frecency is deliberately not here: it is computed from `item_usage_stats`
 * row shapes, and exposing it would freeze an internal table as an API surface and let a plugin
 * read behaviour it did not observe.
 *
 * Note that `priority` on a returned candidate orders a provider's *own* candidates. It is
 * bounded well below the terms the host derives from real usage, so declaring 100 does not place
 * an item above the applications someone actually uses; being used is what moves it.
 */
export interface RecommendWeights {
  /** Multiplier for "used at times like now", 1 when there is no such history. */
  timeContextBoost(stats: ItemTimeDistribution, now: TimePattern): number
  /** Hour-of-day affinity 0..1, or null when the item has no hour history to judge by. */
  hourAffinity(hourDistribution: number[] | undefined, hourOfDay: number): number | null
  /** Combined slot/weekday/hour relevance on a 0..~135 scale; 0 means "no time history". */
  timeRelevanceScore(stats: ItemTimeDistribution, now: TimePattern): number
  /** The constants behind the functions above, for callers blending their own signal. */
  readonly constants: {
    readonly slotBoost: number
    readonly dayBoost: number
    readonly scale: number
    readonly slotWeight: number
    readonly hourWeight: number
  }
}

/**
 * SDK for plugins to register custom recommendation providers.
 *
 * Providers registered through this SDK will be called by the RecommendationEngine
 * when generating recommendations for the CoreBox empty-query state.
 */
export interface RecommendSDK {
  /**
   * Register a recommendation provider.
   * @returns A dispose function to unregister the provider.
   */
  registerProvider(provider: RecommendProvider): () => void

  /**
   * Unregister a recommendation provider by its ID.
   * @returns true if the provider was found and removed.
   */
  unregisterProvider(providerId: string): boolean

  /** The host's time-weighting functions. */
  readonly weights: RecommendWeights
}

/** The shared implementation, identical to what the host ranks with. */
export const recommendWeights: RecommendWeights = {
  timeContextBoost: calculateTimeContextBoost,
  hourAffinity: calculateHourAffinity,
  timeRelevanceScore: calculateTimeRelevanceScore,
  constants: {
    slotBoost: TIME_CONTEXT_SLOT_BOOST,
    dayBoost: TIME_CONTEXT_DAY_BOOST,
    scale: TIME_RELEVANCE_SCALE,
    slotWeight: TIME_RELEVANCE_SLOT_WEIGHT,
    hourWeight: TIME_RELEVANCE_HOUR_WEIGHT,
  },
};
