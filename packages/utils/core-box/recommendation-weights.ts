import type { TimePattern } from './recommendation'

/**
 * Time-of-use weighting, shared with plugins.
 *
 * These are the functions the host itself ranks with, exposed so a plugin's `RecommendProvider`
 * can order its candidates on the same axis rather than inventing one. They are deliberately the
 * time half of the model and nothing else: frecency reads `item_usage_stats` row shapes, and
 * publishing that would freeze an internal table as an API and hand callers another user's
 * behaviour data. Everything here is a pure function of arguments the caller already holds.
 */

export const DAY_MS = 86_400_000

/** Multiplier when the item has history in the current time slot. */
export const TIME_CONTEXT_SLOT_BOOST = 1.35
/** Multiplier when the item has history on the current weekday. */
export const TIME_CONTEXT_DAY_BOOST = 1.15
/** Puts the slot ratio (0..1) on a 0..100 scale; the hour term reuses it so both halves are commensurate. */
export const TIME_RELEVANCE_SCALE = 100
/** Split of the time-relevance score between the coarse slot/weekday signal and hour-of-day affinity. */
export const TIME_RELEVANCE_SLOT_WEIGHT = 0.5
export const TIME_RELEVANCE_HOUR_WEIGHT = 0.5

/** Usage histogram for one item. Counts are occurrences; only their relative size matters. */
export interface ItemTimeDistribution {
  /** 24 buckets, index = hour of day. May be empty for items recorded before hour buckets existed. */
  hourDistribution: number[]
  /** 7 buckets, index = day of week (0 = Sunday). */
  dayOfWeekDistribution: number[]
  timeSlotDistribution: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
}

export function toDayBucket(timestampMs: number): number {
  return Math.floor(timestampMs / DAY_MS)
}

/**
 * Multiplier for "this item has been used at times like now", 1 when it has not.
 *
 * Presence-based on purpose: it asks whether there is *any* history in this slot/weekday, not how
 * much. The magnitude question is `calculateTimeRelevanceScore`'s.
 */
export function calculateTimeContextBoost(
  itemTimeStats: ItemTimeDistribution,
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
 * Hour-of-day affinity, 0..1: how strongly this item clusters on the current hour relative to its
 * busiest hour. Returns null when the item has no hour history at all, so callers can fall back to
 * the slot-only score instead of penalising them.
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

/**
 * How much today's weekday argues for this item, relative to its own average day.
 *
 * Smoothed rather than a bare ratio. The bare form has two failure modes and this sits between
 * them:
 *
 * - `dayUsage > 0 ? ratio : 1` makes *absence* neutral, so an item never used on a Monday
 *   (factor 1) outranks one used twice against an average of ten (factor 0.2) — absence of
 *   evidence beating weak evidence (#650)
 * - dividing unconditionally makes absence a factor of 0, which zeroes the whole relevance score
 *   and erases the item on every weekday it has not been used, however strong its hour affinity
 *
 * (dayUsage + 1) / (avgDayUsage + 1) is strictly increasing in dayUsage, so any evidence always
 * beats none, and it is never 0.
 */
function calculateDayFactor(dayUsage: number, avgDayUsage: number): number {
  return (dayUsage + 1) / (avgDayUsage + 1)
}

/**
 * Blends the coarse slot/weekday signal with hour-of-day affinity, on a 0..~135 scale.
 *
 * Returns 0 for an item with no time history, which callers use to drop it from time-based
 * results rather than ranking it low.
 */
export function calculateTimeRelevanceScore(
  itemTimeStats: ItemTimeDistribution,
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
