import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { TimePattern } from './context-provider'

export const DAY_MS = 86_400_000
export const TIME_CONTEXT_SLOT_BOOST = 1.35
export const TIME_CONTEXT_DAY_BOOST = 1.15
/** Puts the slot ratio (0..1) on a 0..100 scale; the hour term reuses it so both halves are commensurate. */
export const TIME_RELEVANCE_SCALE = 100
/** Split of the time-relevance score between the coarse slot/weekday signal and hour-of-day affinity. */
export const TIME_RELEVANCE_SLOT_WEIGHT = 0.5
export const TIME_RELEVANCE_HOUR_WEIGHT = 0.5

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

export function toDayBucket(timestampMs: number): number {
  return Math.floor(timestampMs / DAY_MS)
}

export function calculateTimeContextBoost(
  itemTimeStats: ParsedItemTimeStats,
  currentTime: TimePattern
): number {
  let boost = 1

  if ((itemTimeStats.timeSlotDistribution[currentTime.timeSlot] ?? 0) > 0) {
    boost *= TIME_CONTEXT_SLOT_BOOST
  }

  if ((itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek] ?? 0) > 0) {
    boost *= TIME_CONTEXT_DAY_BOOST
  }

  return boost
}

/**
 * Hour-of-day affinity, 0..1: how strongly this item clusters on the current
 * hour relative to its busiest hour. Returns null when the item has no hour
 * history at all (rows written before hour buckets were populated), so callers
 * can fall back to the slot-only score instead of penalising them.
 */
export function calculateHourAffinity(
  hourDistribution: number[] | undefined,
  hourOfDay: number
): number | null {
  if (!Array.isArray(hourDistribution) || hourDistribution.length === 0) return null

  let peak = 0
  for (const count of hourDistribution) {
    if (typeof count === 'number' && count > peak) peak = count
  }
  if (peak <= 0) return null

  const currentHourUsage = hourDistribution[hourOfDay] ?? 0
  return Math.max(0, Math.min(1, currentHourUsage / peak))
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

/**
 * Time relevance blends the coarse slot/weekday signal with hour-of-day
 * affinity. `item_time_stats.hourDistribution` had been aggregated since the
 * table existed but was never read — an item used every day at 09:00 scored
 * the same at 11:30 as at 09:05 because both fall in the "morning" slot.
 */
/**
 * How much today's weekday argues for this item, relative to its own average day.
 *
 * Smoothed rather than a bare ratio. The bare form has two failure modes and this sits between
 * them:
 *
 * - the old `dayUsage > 0 ? ratio : 1` made *absence* neutral, so an item never used on a Monday
 *   (factor 1) outranked one used twice against an average of ten (factor 0.2) — absence of
 *   evidence beating weak evidence (#650)
 * - dividing unconditionally makes absence a factor of 0, which zeroes the whole relevance score.
 *   The caller keeps only `timeScore > 0`, so an item would disappear from time-based results on
 *   every weekday it has not been used, however strong its hour-of-day affinity
 *
 * (dayUsage + 1) / (avgDayUsage + 1) is strictly increasing in dayUsage, so any evidence always
 * beats none, and it is never 0, so nothing is erased for lack of a weekday sample.
 */
function calculateDayFactor(dayUsage: number, avgDayUsage: number): number {
  return (dayUsage + 1) / (avgDayUsage + 1)
}

export function calculateTimeRelevanceScore(
  itemTimeStats: ParsedItemTimeStats,
  currentTime: TimePattern
): number {
  const slotUsage = itemTimeStats.timeSlotDistribution[currentTime.timeSlot] ?? 0
  const totalUsage = Object.values(itemTimeStats.timeSlotDistribution).reduce((a, b) => a + b, 0)

  if (totalUsage === 0) return 0

  const slotRatio = slotUsage / totalUsage
  const dayUsage = itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek] ?? 0
  const avgDayUsage = itemTimeStats.dayOfWeekDistribution.reduce((a, b) => a + b, 0) / 7
  const dayFactor = calculateDayFactor(dayUsage, avgDayUsage)
  const boost = calculateTimeContextBoost(itemTimeStats, currentTime)
  const slotScore = slotRatio * TIME_RELEVANCE_SCALE * dayFactor

  const hourAffinity = calculateHourAffinity(itemTimeStats.hourDistribution, currentTime.hourOfDay)
  if (hourAffinity === null) {
    return slotScore * boost
  }

  const hourScore = hourAffinity * TIME_RELEVANCE_SCALE * dayFactor
  return (slotScore * TIME_RELEVANCE_SLOT_WEIGHT + hourScore * TIME_RELEVANCE_HOUR_WEIGHT) * boost
}
