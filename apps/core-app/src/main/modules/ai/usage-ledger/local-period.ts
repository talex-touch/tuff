/**
 * Local calendar periods of the usage ledger (audit rebuild parent design §1.2, §1.5).
 *
 * The global bucket is keyed by the main process's local day and month, read from
 * `Date#getFullYear/getMonth/getDate` exactly like the voice insights store
 * (`voice/voice-insights-store.ts` `localDate`). These helpers are the only place that turns a
 * timestamp into a ledger period key; nothing else may slice `toISOString()` for them.
 *
 * Boundaries are built with `new Date(y, m, d)`, so a day that is 23 or 25 hours long around a DST
 * change still starts at its own local midnight. Iterating over day keys happens in UTC space on
 * the `YYYY-MM-DD` strings, where every day is 24 hours.
 *
 * Leaf module: imported statically by the audit logger.
 */
import type { UsageRange } from '@talex-touch/utils/transport/sdk/domains/intelligence'

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const USAGE_RANGE_DAYS: Readonly<Record<UsageRange, number>> = Object.freeze({
  today: 1,
  '7d': 7,
  '30d': 30
})

export function isUsageRange(value: unknown): value is UsageRange {
  return typeof value === 'string' && Object.hasOwn(USAGE_RANGE_DAYS, value)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD` of the local calendar day containing `timestamp`. */
export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** `YYYY-MM` of the local calendar month containing `timestamp`. */
export function localMonthKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** `intelligence_usage_stats.period` of a day key. */
export function dayPeriod(dayKey: string): string {
  return `day:${dayKey}`
}

/** `intelligence_usage_stats.period` of a month key. */
export function monthPeriod(monthKey: string): string {
  return `month:${monthKey}`
}

/** IANA zone the keys above follow; `'UTC'` when the runtime reports none. */
export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const match = DAY_KEY_PATTERN.exec(dayKey)
  if (!match) throw new Error(`Invalid usage day key: ${dayKey}`)
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

/** First instant of a local day (its local midnight, or the first instant after a DST gap). */
export function localDayStartMs(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return new Date(year, month, day).getTime()
}

/** Local midnight that starts the day after the one containing `timestamp`. */
export function nextLocalDayStartMs(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

/** Local midnight of the first day of the month after the one containing `timestamp`. */
export function nextLocalMonthStartMs(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

/** `dayKey` moved by `offset` calendar days (UTC arithmetic on the key, so DST cannot shift it). */
export function shiftDayKey(dayKey: string, offset: number): string {
  const { year, month, day } = parseDayKey(dayKey)
  return new Date(Date.UTC(year, month, day + offset)).toISOString().slice(0, 10)
}

export interface UsageWindow {
  range: UsageRange
  startDay: string
  endDay: string
  /** Inclusive: local midnight of `startDay`. */
  startMs: number
  /** Exclusive: local midnight after `endDay`. */
  endMs: number
  /** Every day key from `startDay` to `endDay`, oldest first. */
  days: string[]
}

/**
 * `today` is the current local day; `7d` / `30d` are that many local days ending today. The
 * window ends at the next local midnight rather than at `now`, which selects the same rows and
 * keeps the day series aligned.
 */
export function resolveWindow(range: UsageRange, now: number = Date.now()): UsageWindow {
  const endDay = localDayKey(now)
  const count = USAGE_RANGE_DAYS[range]
  const days: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    days.push(shiftDayKey(endDay, -offset))
  }
  const startDay = days[0] ?? endDay
  return {
    range,
    startDay,
    endDay,
    startMs: localDayStartMs(startDay),
    endMs: nextLocalDayStartMs(now),
    days
  }
}
