/**
 * Logging helpers plus a re-export of the shared behaviour model.
 *
 * The weight functions live in `@talex-touch/utils/core-box` because plugins rank against the same
 * axis (see `RecommendSDK`); keeping a second copy here is how the two drift. The raw time-histogram
 * primitives are deliberately NOT re-exported any more: the only public way to obtain time points is
 * `calculateTimeContribution`, which is evidence-gated and capped, so no caller can turn a thin
 * history into a large score.
 */
export {
  BEHAVIOR_BASE_MAX,
  BEHAVIOR_SCORE_MAX,
  FREQUENT_MIN_ACTIVE_DAYS_30,
  FREQUENT_MIN_EXECUTES_30,
  PLUGIN_PRIORITY_MAX_CONTRIBUTION,
  RECOMMENDATION_MODEL_VERSION,
  TIME_CONTRIBUTION_MAX,
  TIME_MIN_ACTIVE_DAYS_30,
  TIME_MIN_EXECUTES_30,
  calculateBehaviorScore,
  calculatePluginPriorityContribution,
  calculateTimeContribution,
  isFrequentEligible,
  toItemTimeDistribution,
  DAY_MS,
  toDayBucket
} from '@talex-touch/utils/core-box'
import {
  TIME_MIN_ACTIVE_DAYS_30,
  TIME_MIN_EXECUTES_30,
  isFrequentEligible
} from '@talex-touch/utils/core-box'
import type { RecommendationSource, UsageBehaviorFacts } from '@talex-touch/utils/core-box'

export { usageBehaviorRowToFacts } from '../usage-utils'
export type { UsageBehaviorMeta, UsageBehaviorRow } from '../usage-utils'
export { isSparseUsageBehaviorRow } from '../usage-utils'

export type LogMeta = Record<string, string | number | boolean | null | undefined>
export function toPrimitive(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return String(value)
}

export function toErrorMeta(error: unknown): LogMeta {
  if (error instanceof Error) {
    const node = error as Error & { code?: unknown; cause?: unknown }
    const cause =
      node.cause && typeof node.cause === 'object'
        ? (node.cause as { code?: unknown; rawCode?: unknown; message?: unknown })
        : null
    return {
      name: node.name,
      message: node.message,
      code: toPrimitive(node.code),
      causeCode: toPrimitive(cause?.code),
      causeRawCode: toPrimitive(cause?.rawCode),
      causeMessage: toPrimitive(cause?.message)
    }
  }
  return { message: String(error) }
}

/** Below this many recorded executions there is no pattern worth claiming, only noise. */
export const PEAK_HOUR_MIN_SAMPLES = 10
/** Width of the peak window, in hours. Three reads naturally as "09-11". */
export const PEAK_HOUR_WINDOW_SIZE = 3
/**
 * Share of total usage the window must hold before we call it a peak. A flat
 * distribution puts 3/24 = 12.5% in every window; demanding 40% means the item
 * is genuinely concentrated there.
 */
export const PEAK_HOUR_MIN_SHARE = 0.4

/**
 * The hours of day an item clusters around, for showing a human reason like
 * "usually around 09-11". Both bounds inclusive; the range may wrap past
 * midnight (`{ startHour: 22, endHour: 0 }`).
 *
 * Returns null whenever the data cannot support the claim — too few samples, or
 * usage too evenly spread. That null is the point: the empty state renders no
 * reason at all rather than a plausible-looking one, so every reason a user sees
 * is backed by real history.
 *
 * Unlike the raw hour-affinity primitive this is a display concern, not a scoring
 * one, so it is deliberately stricter: a weak signal is still useful for ranking
 * but must not be turned into a sentence.
 *
 * `activeDays30` and `executeCount30` are the same two halves of the evidence gate the time
 * *score* applies, so a reason can never be claimed that the scorer itself would refuse: a dozen
 * uses crammed into one afternoon is a session, not a habit, and must not become the sentence
 * "usually around 09-11". Both are optional because a caller with only a histogram still gets the
 * sample-count gate, but a caller that holds the counts must pass them.
 */
export function resolvePeakHourRange(
  hourDistribution: number[] | undefined,
  activeDays30?: number,
  executeCount30?: number
): { startHour: number; endHour: number } | null {
  if (!Array.isArray(hourDistribution) || hourDistribution.length !== 24) return null

  if (typeof activeDays30 === 'number' && activeDays30 < TIME_MIN_ACTIVE_DAYS_30) return null
  if (typeof executeCount30 === 'number' && executeCount30 < TIME_MIN_EXECUTES_30) return null
  // Negative and non-finite buckets are treated as absent rather than trusted,
  // so a corrupt row degrades to "no reason" instead of a wrong one.
  const at = (hour: number): number => {
    const count = hourDistribution[hour % 24]
    return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
  }

  let total = 0
  for (let hour = 0; hour < 24; hour++) total += at(hour)
  if (total < PEAK_HOUR_MIN_SAMPLES) return null

  let bestStart = 0
  let bestSum = -1
  for (let start = 0; start < 24; start++) {
    let sum = 0
    // `at` wraps, so the window starting at 22 covers 22, 23, 0.
    for (let offset = 0; offset < PEAK_HOUR_WINDOW_SIZE; offset++) sum += at(start + offset)
    // Strict `>` keeps the earliest start on ties, so the result is stable.
    if (sum > bestSum) {
      bestSum = sum
      bestStart = start
    }
  }

  if (bestSum / total < PEAK_HOUR_MIN_SHARE) return null

  return { startHour: bestStart, endHour: (bestStart + PEAK_HOUR_WINDOW_SIZE - 1) % 24 }
}

/**
 * The reason a candidate may honestly be shown with, given only its recall tag and its dated
 * behaviour facts (R9).
 *
 * The recall dimensions are *claims* — "Frequent", "Popular Now", "Recent", "Trending" — and each
 * one has to be checked against the accepted-execution ledger before it is printed:
 *
 * - `frequent` needs the strict 5/30-day, 3-day threshold {@link isFrequentEligible} applies.
 * - `recent` / `trending` / `time-based` all need at least one accepted execution whose reliable
 *   timestamp the ledger can date ({@link UsageBehaviorFacts.lastExecutedAt}). Legacy rows keep
 *   their lifetime count but carry no dated event, and must not wear any behavioural badge.
 * - `time-based` additionally keeps the same 10-execution / 3-day gate the time *score* uses.
 * - `trending` additionally requires at least two dated executions in 7 days and growth over the
 *   dated 30-day weekly average; one accepted action cannot validate an older inferred trend.
 *
 * A claim that fails never falls back to a *different* behavioural claim: the caller gets
 * `'cold-start'`, which carries the neutral "Suggested" badge and makes no dated assertion. Pins
 * and the dimensions that carry their own proof (plugin, context, novelty, cold start) are returned
 * unchanged. The lifetime count itself is never touched here — R9 keeps the fact, only the reason
 * is withheld.
 */
export function resolveEvidenceBackedReason(
  source: RecommendationSource,
  behavior: UsageBehaviorFacts | undefined
): RecommendationSource {
  switch (source) {
    case 'frequent':
      return behavior && isFrequentEligible(behavior)
        ? 'frequent'
        : resolveEvidenceBackedReason('recent', behavior)
    case 'recent':
      return behavior?.lastExecutedAt != null ? source : 'cold-start'
    case 'trending':
      return behavior &&
        behavior.lastExecutedAt != null &&
        behavior.executeCount7 >= 2 &&
        behavior.executeCount7 > behavior.executeCount30 / 4
        ? 'trending'
        : 'cold-start'
    case 'time-based':
      return behavior &&
        behavior.executeCount30 >= TIME_MIN_EXECUTES_30 &&
        behavior.activeDays30 >= TIME_MIN_ACTIVE_DAYS_30
        ? 'time-based'
        : 'cold-start'
    default:
      return source
  }
}
