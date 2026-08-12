/**
 * Time-bucket arithmetic for `item_time_stats`.
 *
 * The buckets used to be produced only by a 24h full-table rebuild that wrote
 * absolute values recomputed from `usage_logs`. That made the distributions a
 * derived view of the raw logs, so privacy retention deleting old logs also
 * deleted the accumulated history. These helpers let the usage-stats drain path
 * accumulate the same buckets incrementally, which keeps the history after the
 * logs behind it are gone.
 */

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night'

export interface TimeBuckets {
  /** Executions per hour of day, length 24 */
  hour: number[]
  /** Executions per weekday (0 = Sunday), length 7 */
  dayOfWeek: number[]
  timeSlot: Record<TimeSlot, number>
}

export function resolveTimeSlot(hour: number): TimeSlot {
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

export function createEmptyTimeBuckets(): TimeBuckets {
  return {
    hour: Array.from({ length: 24 }, () => 0),
    dayOfWeek: Array.from({ length: 7 }, () => 0),
    timeSlot: { morning: 0, afternoon: 0, evening: 0, night: 0 }
  }
}

export function addExecutionToBuckets(buckets: TimeBuckets, timestamp: Date): void {
  const hour = timestamp.getHours()
  const dayOfWeek = timestamp.getDay()

  buckets.hour[hour] = (buckets.hour[hour] ?? 0) + 1
  buckets.dayOfWeek[dayOfWeek] = (buckets.dayOfWeek[dayOfWeek] ?? 0) + 1
  buckets.timeSlot[resolveTimeSlot(hour)] += 1
}

export function cloneTimeBuckets(buckets: TimeBuckets): TimeBuckets {
  return {
    hour: [...buckets.hour],
    dayOfWeek: [...buckets.dayOfWeek],
    timeSlot: { ...buckets.timeSlot }
  }
}

/** Adds `addition` into `target` in place. */
export function mergeTimeBuckets(target: TimeBuckets, addition: TimeBuckets): void {
  for (let i = 0; i < target.hour.length; i++) {
    target.hour[i] = (target.hour[i] ?? 0) + (addition.hour[i] ?? 0)
  }
  for (let i = 0; i < target.dayOfWeek.length; i++) {
    target.dayOfWeek[i] = (target.dayOfWeek[i] ?? 0) + (addition.dayOfWeek[i] ?? 0)
  }
  for (const slot of ['morning', 'afternoon', 'evening', 'night'] as const) {
    target.timeSlot[slot] += addition.timeSlot[slot]
  }
}

export function isEmptyTimeBuckets(buckets: TimeBuckets): boolean {
  return (
    buckets.hour.every((count) => count === 0) &&
    buckets.dayOfWeek.every((count) => count === 0) &&
    Object.values(buckets.timeSlot).every((count) => count === 0)
  )
}

function toCountArray(value: unknown, length: number): number[] {
  const parsed = Array.isArray(value) ? value : []
  return Array.from({ length }, (_, index) => {
    const count = parsed[index]
    return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
  })
}

/** Parses a persisted row's JSON columns, tolerating legacy/short/corrupt payloads. */
export function parseStoredTimeBuckets(row: {
  hourDistribution: string | null
  dayOfWeekDistribution: string | null
  timeSlotDistribution: string | null
}): TimeBuckets {
  const buckets = createEmptyTimeBuckets()

  try {
    buckets.hour = toCountArray(JSON.parse(row.hourDistribution ?? '[]'), 24)
  } catch {
    // keep zeros
  }
  try {
    buckets.dayOfWeek = toCountArray(JSON.parse(row.dayOfWeekDistribution ?? '[]'), 7)
  } catch {
    // keep zeros
  }
  try {
    const slots = JSON.parse(row.timeSlotDistribution ?? '{}') as Record<string, unknown>
    for (const slot of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const count = slots?.[slot]
      buckets.timeSlot[slot] =
        typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
    }
  } catch {
    // keep zeros
  }

  return buckets
}

export function serializeTimeBuckets(buckets: TimeBuckets): {
  hourDistribution: string
  dayOfWeekDistribution: string
  timeSlotDistribution: string
} {
  return {
    hourDistribution: JSON.stringify(buckets.hour),
    dayOfWeekDistribution: JSON.stringify(buckets.dayOfWeek),
    timeSlotDistribution: JSON.stringify(buckets.timeSlot)
  }
}
