/**
 * Formatting for the audit insights page: counts, latency, estimated USD, per-1M prices, reset
 * times, and the local calendar days the trend chart is drawn on.
 *
 * Everything takes the locale explicitly so a test can pin it, and nothing here reads `t()`:
 * the words around these figures are the components'.
 *
 * No imports, and none to be added — no `~/` alias, no Vue, no i18n instance: the file-index
 * diagnostics display uses `formatResetTime` and also runs under Node + tsx
 * (`scripts/settings-indexing-diagnostics-verify.ts`).
 */

export const DAY_MS = 86_400_000

/** A `YYYY-MM-DD` day key, split. `month` is 1-based, as written. */
export interface DayParts {
  year: number
  month: number
  day: number
}

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Splits a day key the main process wrote; anything else is `null`, never a guessed date. */
export function parseDayKey(day: string): DayParts | null {
  const match = DAY_KEY_PATTERN.exec(day)
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  // `Date.UTC` rolls 2026-02-31 over into March; a key that does so was never a real day.
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() === parts.month - 1 &&
    check.getUTCDate() === parts.day
    ? parts
    : null
}

function dayKeyFromUtc(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/**
 * Every calendar day from `startDay` to `endDay`, both included.
 *
 * Walked on UTC midnights, where every day is 24 hours long: stepping local time across a DST
 * change would skip or repeat a day. The keys are calendar labels, so where they are walked does
 * not move them. Capped so a corrupt window cannot build an unbounded array.
 */
export function daysBetween(startDay: string, endDay: string, maxDays = 400): string[] {
  const start = parseDayKey(startDay)
  const end = parseDayKey(endDay)
  if (!start || !end) return []
  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  const days: string[] = []
  for (let at = startUtc; at <= endUtc && days.length < maxDays; at += DAY_MS) {
    days.push(dayKeyFromUtc(at))
  }
  return days
}

/**
 * The renderer's own midnight for a day key.
 *
 * Where the trend chart puts the bar. `TxTimeseriesChart` draws on d3's `scaleTime`, which lays
 * its day ticks on local midnights; a bar placed on `Date.UTC(…)` would sit the time-zone offset
 * away from its tick (eight hours, a third of a slot, in Asia/Shanghai) under a label for the day
 * before. The label text never comes from this number — see `createDayLabelFormatter`.
 */
export function localMidnight(day: string): number | null {
  const parts = parseDayKey(day)
  return parts ? new Date(parts.year, parts.month - 1, parts.day).getTime() : null
}

/**
 * Labels a day key as the date it names.
 *
 * Formatted from `Date.UTC(…)` in `timeZone: 'UTC'`, so the text is the key's own calendar date
 * whatever zone this process runs in — the old chart printed weekday glyphs one character at a
 * time out of a translated array, and dated its bars with `toISOString()` (UTC days).
 */
export function createDayLabelFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
): (day: string) => string {
  const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
  return (day) => {
    const parts = parseDayKey(day)
    return parts
      ? formatter.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
      : day
  }
}

/** Big counts read as `1.2万` / `12K`; anything under a thousand stays exact. */
export function formatCompact(value: number, locale: string): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    safe
  )
}

export function formatInteger(value: number, locale: string): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(safe)
}

/**
 * Success rate, never rounded onto a boundary it has not reached.
 *
 * 9,996 of 10,000 is 99.96 %, which every ordinary formatter prints as "100%" — on the one page
 * that exists to show what failed. A rate with any failure stops at 99.9 %, and one with any
 * success starts at 0.1 %. `null` when nothing ran: there is no rate of nothing.
 */
export function formatSuccessRate(success: number, total: number, locale: string): string | null {
  if (!(total > 0)) return null
  const failures = Math.max(0, total - success)
  let percent = (Math.max(0, success) / total) * 100
  if (failures > 0) percent = Math.min(percent, 99.9)
  if (success > 0) percent = Math.max(percent, 0.1)
  // Floor to one decimal so the clamps above are not undone by rounding. The epsilon keeps a
  // product like 57.3 × 10 = 572.9999… from flooring a whole tenth away.
  const shown = failures > 0 ? Math.floor(percent * 10 + 1e-9) / 10 : Math.round(percent * 10) / 10
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
    shown / 100
  )
}

/** Under a second in milliseconds, otherwise seconds; `null` (no requests) is a dash. */
export function formatLatency(ms: number | null | undefined, locale: string): string {
  const parts = latencyParts(ms, locale)
  return parts.unit ? `${parts.value} ${parts.unit}` : parts.value
}

/** The same, split into figure and unit for a metric card that sets the unit smaller. */
export function latencyParts(
  ms: number | null | undefined,
  locale: string
): { value: string; unit: string } {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return { value: '—', unit: '' }
  if (ms < 1000) return { value: formatInteger(Math.round(ms), locale), unit: 'ms' }
  return {
    value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000),
    unit: 's'
  }
}

function usdFormatter(locale: string, min: number, max: number): Intl.NumberFormat {
  // `narrowSymbol`: zh-CN would otherwise print "US$", which reads as a different currency.
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: min,
    maximumFractionDigits: max
  })
}

/**
 * Estimated USD with two decimals; a positive amount under a cent reads `< $0.01` rather than
 * rounding to a zero that would claim the calls were free.
 */
export function formatUsd(value: number, locale: string): string {
  const formatter = usdFormatter(locale, 2, 2)
  const safe = Number.isFinite(value) && value > 0 ? value : 0
  if (safe > 0 && safe < 0.01) return `< ${formatter.format(0.01)}`
  return formatter.format(safe)
}

/** A price per million tokens: cheap models are priced in fractions of a cent, so up to 4 places. */
export function formatPricePerMillion(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return usdFormatter(locale, 2, 4).format(Math.max(0, value))
}

/**
 * Value-axis labels for the cost chart. Daily costs are often fractions of a cent, where the
 * two-decimal format would label every tick `$0.00`; three significant digits keep them apart.
 */
export function usdTickFormatter(locale: string): (value: number) => string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumSignificantDigits: 3
  })
  return (value) => formatter.format(Number.isFinite(value) ? value : 0)
}

/** Context and output limits are token counts; `null` means the catalog does not say. */
export function formatTokenLimit(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '—'
  return formatCompact(value, locale)
}

const HOUR_MS = 3_600_000

/** `t` as the formatters below call it: a key, its named values, and a count picking the form. */
export type AuditTranslate = (
  key: string,
  named?: Record<string, unknown>,
  plural?: number
) => string

const DURATION_KEYS = {
  minute: 'intelligenceAudit.duration.minutes',
  hour: 'intelligenceAudit.duration.hours',
  day: 'intelligenceAudit.duration.days'
} as const

/**
 * A duration in one unit, worded by the locale files: English picks "1 day" or "30 days" by the
 * count, and Chinese keeps the space the rest of its copy puts between a number and its unit
 * ("30 天", like 「近 30 天」) — `Intl`'s unit style writes "30天".
 */
export function formatDuration(
  value: number,
  unit: 'minute' | 'hour' | 'day',
  t: AuditTranslate,
  locale: string
): string {
  const count = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  return t(DURATION_KEYS[unit], { count }, value)
}
/**
 * How long call records are kept: whole days when it is whole days, hours otherwise (the privacy
 * policy goes down to one hour); `null` is a policy that never deletes them.
 */
export function formatRetention(
  retentionMs: number | null,
  t: AuditTranslate,
  locale: string
): string {
  if (retentionMs === null || !Number.isFinite(retentionMs)) {
    return t('intelligenceAudit.retention.forever')
  }
  const days = retentionMs / DAY_MS
  if (days >= 1 && Number.isInteger(days)) return formatDuration(days, 'day', t, locale)
  return formatDuration(Math.max(1, Math.round(retentionMs / HOUR_MS)), 'hour', t, locale)
}

/** When a limit resets: a local date and time, 24-hour. */
export function formatResetTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp))
}

/** A record's time in the table: date and time to the second, local. */
export function formatRecordTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp))
}

/** A record's whole local date and time, to the second: the detail's form of the list's time. */
export function formatRecordDateTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp))
}
function pad(value: number, width = 2): string {
  return String(Math.abs(Math.trunc(value))).padStart(width, '0')
}

/** Today's local date as `YYYY-MM-DD`, for export filenames. */
export function localDateStamp(timestamp: number = Date.now()): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * ISO 8601 in local time with its offset (`2026-10-03T14:05:07.250+08:00`).
 *
 * For exports: unambiguous for any tool that parses it, and still the wall-clock time the reader
 * remembers — `toISOString()` is the first and not the second.
 */
export function toLocalIsoString(timestamp: number): string {
  const date = new Date(timestamp)
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offset = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${offset}`
  )
}
