import { computed } from 'vue'
import type { ComputedRef } from 'vue'

/** What every formatter prints for a missing or unreadable value. */
export const ADMIN_FORMAT_EMPTY = '—'

export type AdminDateInput = string | number | Date | null | undefined
export type AdminNumberInput = number | string | null | undefined

type Translate = (key: string, named: Record<string, unknown>) => string

export interface AdminDateOptions {
  /**
   * `'UTC'` reads the value's UTC calendar fields. Use it for a date-only value
   * stored at UTC midnight: west of UTC its local day is the day before
   * (`2026-09-26T00:00:00Z` is 2026-09-25 17:00 in Los Angeles).
   */
  timeZone?: 'UTC'
}

export interface AdminFormat {
  /** BCP-47 tag every `Intl` formatter here uses. */
  locale: ComputedRef<string>
  /** `YYYY-MM-DD HH:mm`, local time, 24-hour: fixed width, so a table column never wraps. */
  tableDateTime: (value: AdminDateInput) => string
  /**
   * `YYYY-MM-DD`, local time: `tableDateTime` without the clock, for a column
   * whose values are calendar days. An update published "on 2026-10-03" is
   * stored as `2026-10-03T00:00:00Z`, and its clock would only print the
   * reader's UTC offset ("08:00" in UTC+8) — read such a value with
   * `{ timeZone: 'UTC' }`, or west of UTC it prints the day before.
   */
  tableDate: (value: AdminDateInput, options?: AdminDateOptions) => string
  /** The full localized date and time; the `title` behind a `tableDateTime` or `tableDate` cell. */
  dateTimeTitle: (value: AdminDateInput) => string
  /** The localized date without a time; `{ timeZone: 'UTC' }` as for `tableDate`. */
  date: (value: AdminDateInput, options?: AdminDateOptions) => string
  dateTime: (value: AdminDateInput) => string
  /** "3 minutes ago" / "3 分钟前". `now` exists for tests. */
  relative: (value: AdminDateInput, now?: number) => string
  number: (value: AdminNumberInput) => string
  /** 1.2K / 1.2万 */
  compact: (value: AdminNumberInput) => string
  /** 1024-based: B, KB, MB, GB, TB. */
  bytes: (value: AdminNumberInput) => string
  /** `850 ms`, `12s`, `1m 5s`, `2h 3m` — localized through the dashboard messages. */
  duration: (milliseconds: AdminNumberInput) => string
  /** `ratio` is a fraction: 0.125 prints as 12.5%. */
  percent: (ratio: AdminNumberInput, digits?: number) => string
}

/**
 * The app's i18n codes are `en` and `zh`; `Intl` wants a region. Anything else
 * falls back to US English rather than to the runtime's default, which would
 * differ between the server and a visitor's browser.
 */
export function resolveAdminLocale(locale: string | null | undefined): string {
  const normalized = (locale ?? '').trim().toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-'))
    return 'zh-CN'
  return 'en-US'
}

function toDate(value: AdminDateInput): Date | null {
  if (value === null || value === undefined || value === '')
    return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toNumber(value: AdminNumberInput): number | null {
  if (value === null || value === undefined)
    return null
  if (typeof value === 'string' && !value.trim())
    return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD` from the local calendar fields. */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` from the UTC calendar fields. */
function utcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

const RELATIVE_STEPS: Array<{ unit: Intl.RelativeTimeFormatUnit, seconds: number }> = [
  { unit: 'year', seconds: 365 * 24 * 3600 },
  { unit: 'month', seconds: 30 * 24 * 3600 },
  { unit: 'day', seconds: 24 * 3600 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
]

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * The formatter set for one locale source. `useAdminFormat` binds it to the i18n
 * locale; tests call it directly.
 */
export function createAdminFormat(resolveLocale: () => string, t: Translate): AdminFormat {
  const locale = computed(() => resolveAdminLocale(resolveLocale()))
  // `Intl` constructors are not free, and a table formats every row on every
  // render. Cached per tag and options, so a locale switch builds a fresh set.
  const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>()

  function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
    kind: string,
    options: object,
    create: (tag: string) => T,
  ): T {
    const tag = locale.value
    const key = `${kind}|${tag}|${JSON.stringify(options)}`
    let formatter = cache.get(key) as T | undefined
    if (!formatter) {
      formatter = create(tag)
      cache.set(key, formatter)
    }
    return formatter
  }

  function dateFormat(options: Intl.DateTimeFormatOptions) {
    return cached('date', options, tag => new Intl.DateTimeFormat(tag, options))
  }

  function numberFormat(options: Intl.NumberFormatOptions) {
    return cached('number', options, tag => new Intl.NumberFormat(tag, options))
  }

  return {
    locale,
    tableDateTime(value) {
      const date = toDate(value)
      if (!date)
        return ADMIN_FORMAT_EMPTY
      return `${localDay(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    },
    tableDate(value, options) {
      const date = toDate(value)
      if (!date)
        return ADMIN_FORMAT_EMPTY
      return options?.timeZone === 'UTC' ? utcDay(date) : localDay(date)
    },
    dateTimeTitle(value) {
      const date = toDate(value)
      return date ? dateFormat({ dateStyle: 'medium', timeStyle: 'medium' }).format(date) : ADMIN_FORMAT_EMPTY
    },
    date(value, options) {
      const date = toDate(value)
      if (!date)
        return ADMIN_FORMAT_EMPTY
      return dateFormat(options?.timeZone ? { dateStyle: 'medium', timeZone: options.timeZone } : { dateStyle: 'medium' }).format(date)
    },
    dateTime(value) {
      const date = toDate(value)
      return date ? dateFormat({ dateStyle: 'medium', timeStyle: 'short' }).format(date) : ADMIN_FORMAT_EMPTY
    },
    relative(value, now = Date.now()) {
      const date = toDate(value)
      if (!date)
        return ADMIN_FORMAT_EMPTY
      const formatter = cached('relative', { numeric: 'auto' }, tag => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }))
      const diffSeconds = (date.getTime() - now) / 1000
      const magnitude = Math.abs(diffSeconds)
      for (const step of RELATIVE_STEPS) {
        if (magnitude >= step.seconds)
          return formatter.format(Math.round(diffSeconds / step.seconds), step.unit)
      }
      return formatter.format(Math.round(diffSeconds), 'second')
    },
    number(value) {
      const number = toNumber(value)
      return number === null ? ADMIN_FORMAT_EMPTY : numberFormat({}).format(number)
    },
    compact(value) {
      const number = toNumber(value)
      return number === null
        ? ADMIN_FORMAT_EMPTY
        : numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(number)
    },
    bytes(value) {
      const number = toNumber(value)
      if (number === null || number < 0)
        return ADMIN_FORMAT_EMPTY
      let size = number
      let unit = 0
      while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
        size /= 1024
        unit += 1
      }
      const digits = unit === 0 ? 0 : 1
      return `${numberFormat({ maximumFractionDigits: digits }).format(size)} ${BYTE_UNITS[unit]}`
    },
    duration(milliseconds) {
      const number = toNumber(milliseconds)
      if (number === null || number < 0)
        return ADMIN_FORMAT_EMPTY
      if (number < 1000)
        return t('dashboard.sections.adminKit.format.durationMs', { value: Math.round(number) })
      const totalSeconds = Math.round(number / 1000)
      if (totalSeconds < 60)
        return t('dashboard.sections.adminKit.format.durationSeconds', { value: totalSeconds })
      const totalMinutes = Math.floor(totalSeconds / 60)
      if (totalMinutes < 60) {
        return t('dashboard.sections.adminKit.format.durationMinutes', {
          minutes: totalMinutes,
          seconds: totalSeconds % 60,
        })
      }
      return t('dashboard.sections.adminKit.format.durationHours', {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
      })
    },
    percent(ratio, digits = 1) {
      const number = toNumber(ratio)
      if (number === null)
        return ADMIN_FORMAT_EMPTY
      const fraction = Math.max(0, Math.min(20, Math.floor(digits)))
      return numberFormat({ style: 'percent', maximumFractionDigits: fraction }).format(number)
    },
  }
}

/**
 * Formatting for every administrator page, following the active i18n locale.
 * Pages call this instead of writing `toLocaleString('en-US')`, which is how the
 * audit log ended up printing "Sep 30, 2026, 8:46 PM" to Chinese administrators
 * and wrapping it across five lines.
 */
export function useAdminFormat(): AdminFormat {
  const { t, locale } = useI18n()
  return createAdminFormat(() => locale.value, (key, named) => t(key, named))
}
