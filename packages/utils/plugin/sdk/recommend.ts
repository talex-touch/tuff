import type { RecommendProvider } from '../../core-box/recommendation'
import type { TimePattern, UsageBehaviorFacts } from '../../core-box'
import {
  calculateBehaviorScore,
  calculatePluginPriorityContribution,
  calculateTimeContribution,
  isFrequentEligible,
  RECOMMENDATION_MODEL_VERSION,
  TIME_CONTRIBUTION_MAX
} from "../../core-box/recommendation-weights";

/**
 * The host's behaviour and time-of-use weighting, so a provider can order its candidates on the
 * same axis the grid is ranked by instead of inventing one.
 *
 * Pure functions over arguments the caller supplies — calling them performs no host request and
 * reads no usage data. Frecency is deliberately not here: it is computed from `item_usage_stats`
 * row shapes, and exposing it would freeze an internal table as an API surface and let a plugin
 * read behaviour it did not observe.
 *
 * The model is bounded and evidence-gated: behaviour is 0..100 and saturates, time adds at most
 * {@link TIME_CONTRIBUTION_MAX} and only once the 30-day evidence crosses its threshold, and a
 * provider's own `priority` may move its candidates by at most 5 points. Every function here takes
 * the facts as an argument and returns 0 for an item with no evidence, so a caller can never obtain
 * a large score from a thin history.
 */
export interface RecommendWeights {
  /**
   * Automatic behaviour score 0..100 from real dated executions only. Saturated on purpose, so a
   * long history cannot permanently outrank a new habit and one burst of use cannot dominate.
   */
  behaviorScore(facts: UsageBehaviorFacts): number
  /**
   * Time preference points 0..{@link TIME_CONTRIBUTION_MAX}, 0 below the evidence threshold (>=10
   * executions over >=3 distinct local days in 30 days). Apply on top of {@link behaviorScore}; a
   * caller must not scale it up to bypass the cap.
   */
  timeContribution(facts: UsageBehaviorFacts, now: TimePattern, nowMs?: number): number
  /** Whether the item meets the strict frequent cohort (>=5 executions over >=3 distinct days). */
  isFrequentEligible(facts: UsageBehaviorFacts): boolean
  /** What a provider's self-declared `priority` may add: at most 5 points. */
  pluginPriorityContribution(priority: number | undefined): number
  /** Model version; changes when a score's meaning changes, not when a constant is tuned. */
  readonly modelVersion: string
  /** The cap on {@link timeContribution}, for callers blending their own signal. */
  readonly constants: {
    readonly timeContributionMax: number
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
   *
   * The call is asynchronous because registration crosses the plugin/host boundary. It rejects
   * when the host cannot accept the provider (no engine bound, or a provider the host refuses);
   * it never resolves with a no-op disposer.
   *
   * @returns A dispose function that revokes this provider. Idempotent.
   */
  registerProvider(provider: RecommendProvider): Promise<() => Promise<void>>

  /**
   * Unregister a recommendation provider by its ID.
   *
   * Only a provider registered by this plugin can be removed; an unknown or foreign id resolves
   * `false` rather than throwing.
   *
   * @returns true if the provider was found, owned, and removed.
   */
  unregisterProvider(providerId: string): Promise<boolean>

  /** The host's behaviour/time-weighting functions. */
  readonly weights: RecommendWeights
}

/** The shared implementation, identical to what the host ranks with. */
export const recommendWeights: RecommendWeights = {
  behaviorScore: calculateBehaviorScore,
  timeContribution: (facts, now, nowMs) => calculateTimeContribution(facts, now, nowMs),
  isFrequentEligible,
  pluginPriorityContribution: calculatePluginPriorityContribution,
  modelVersion: RECOMMENDATION_MODEL_VERSION,
  constants: {
    timeContributionMax: TIME_CONTRIBUTION_MAX,
  },
};
