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

/**
 * Time relevance blends the coarse slot/weekday signal with hour-of-day
 * affinity. `item_time_stats.hourDistribution` had been aggregated since the
 * table existed but was never read — an item used every day at 09:00 scored
 * the same at 11:30 as at 09:05 because both fall in the "morning" slot.
 */
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
  const dayFactor = dayUsage > 0 ? dayUsage / (avgDayUsage || 1) : 1
  const boost = calculateTimeContextBoost(itemTimeStats, currentTime)
  const slotScore = slotRatio * TIME_RELEVANCE_SCALE * dayFactor

  const hourAffinity = calculateHourAffinity(itemTimeStats.hourDistribution, currentTime.hourOfDay)
  if (hourAffinity === null) {
    return slotScore * boost
  }

  const hourScore = hourAffinity * TIME_RELEVANCE_SCALE * dayFactor
  return (slotScore * TIME_RELEVANCE_SLOT_WEIGHT + hourScore * TIME_RELEVANCE_HOUR_WEIGHT) * boost
}
