import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { TimePattern } from './context-provider'

export const DAY_MS = 86_400_000
export const TIME_CONTEXT_SLOT_BOOST = 1.35
export const TIME_CONTEXT_DAY_BOOST = 1.15

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

  return slotRatio * 100 * dayFactor * calculateTimeContextBoost(itemTimeStats, currentTime)
}
