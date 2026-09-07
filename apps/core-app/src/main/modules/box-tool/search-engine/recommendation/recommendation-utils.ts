/**
 * Logging helpers plus a re-export of the shared time-weighting model.
 *
 * The weight functions live in `@talex-touch/utils/core-box` because plugins rank against the same
 * axis (see `RecommendSDK`); keeping a second copy here is how the two drift. `ParsedItemTimeStats`
 * is structurally the shared `ItemTimeDistribution` plus identity/`lastUpdated` fields, so it
 * satisfies the shared signatures without a cast.
 */
export {
  calculateHourAffinity,
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  DAY_MS,
  TIME_CONTEXT_DAY_BOOST,
  TIME_CONTEXT_SLOT_BOOST,
  TIME_RELEVANCE_HOUR_WEIGHT,
  TIME_RELEVANCE_SCALE,
  TIME_RELEVANCE_SLOT_WEIGHT,
  toDayBucket
} from '@talex-touch/utils/core-box'

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
 * Unlike {@link calculateHourAffinity} this is a display concern, not a scoring
 * one, so it is deliberately stricter: a weak signal is still useful for ranking
 * but must not be turned into a sentence.
 */
export function resolvePeakHourRange(
  hourDistribution: number[] | undefined
): { startHour: number; endHour: number } | null {
  if (!Array.isArray(hourDistribution) || hourDistribution.length !== 24) return null

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
