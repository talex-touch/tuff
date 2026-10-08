import { afterEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '../../../modules/lang/en-US.json'
import zhCN from '../../../modules/lang/zh-CN.json'
import {
  createDayLabelFormatter,
  DAY_MS,
  daysBetween,
  formatCompact,
  formatDuration,
  formatLatency,
  formatPricePerMillion,
  formatRecordDateTime,
  formatRetention,
  formatSuccessRate,
  formatTokenLimit,
  formatUsd,
  latencyParts,
  localDateStamp,
  localMidnight,
  parseDayKey,
  toLocalIsoString,
  usdTickFormatter
} from './audit-format'

/** The app's own messages and plural rules, so a duration reads exactly as the page shows it. */
function translator(locale: 'en-US' | 'zh-CN') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'en-US': enUS, 'zh-CN': zhCN }
  })
  return (key: string, named?: Record<string, unknown>, plural?: number) =>
    plural === undefined ? i18n.global.t(key, named ?? {}) : i18n.global.t(key, named ?? {}, plural)
}

/**
 * The node test runtime follows `process.env.TZ` for every `Date` call made after it is set, so
 * one file can show the same day key under two zones.
 */
const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe('day keys', () => {
  it('splits a real day key and rejects anything else', () => {
    expect(parseDayKey('2026-10-03')).toEqual({ year: 2026, month: 10, day: 3 })
    expect(parseDayKey('2026-02-31')).toBeNull()
    expect(parseDayKey('2026-10-3')).toBeNull()
    expect(parseDayKey('')).toBeNull()
  })

  it('walks every calendar day of a window, both ends included', () => {
    expect(daysBetween('2026-09-28', '2026-10-03')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03'
    ])
    expect(daysBetween('2026-10-03', '2026-10-03')).toEqual(['2026-10-03'])
    expect(daysBetween('2026-10-04', '2026-10-03')).toEqual([])
    expect(daysBetween('nope', '2026-10-03')).toEqual([])
  })

  it('neither skips nor repeats a day across a DST change', () => {
    process.env.TZ = 'America/Los_Angeles'
    // 2026-11-01 is 25 hours long in Los Angeles; 2026-03-08 is 23.
    expect(daysBetween('2026-10-31', '2026-11-02')).toEqual([
      '2026-10-31',
      '2026-11-01',
      '2026-11-02'
    ])
    expect(daysBetween('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09'
    ])
  })

  it('places a day on this process’s own midnight, which is where d3 puts the day tick', () => {
    process.env.TZ = 'Asia/Shanghai'
    const at = localMidnight('2026-10-03')!
    const date = new Date(at)
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 9, 3, 0
    ])
    // Eight hours before the UTC midnight a `Date.UTC` placement would have used.
    expect(Date.UTC(2026, 9, 3) - at).toBe(8 * 60 * 60 * 1000)
    expect(localMidnight('bad')).toBeNull()
  })

  it('labels a day key as the date it names, in any zone', () => {
    const label = createDayLabelFormatter('en-US')
    process.env.TZ = 'America/Los_Angeles'
    expect(label('2026-10-03')).toBe('Oct 3')
    process.env.TZ = 'Asia/Tokyo'
    expect(label('2026-10-03')).toBe('Oct 3')
    // A weekday is a formatted word, never one character of a translated array.
    const titled = createDayLabelFormatter('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
    expect(titled('2026-10-03')).toBe('10月3日周六')
  })
})

describe('figures', () => {
  it('compacts big counts and keeps small ones exact', () => {
    expect(formatCompact(999, 'en-US')).toBe('999')
    expect(formatCompact(12_345, 'en-US')).toBe('12.3K')
    expect(formatCompact(1_250_000, 'en-US')).toBe('1.3M')
    expect(formatCompact(Number.NaN, 'en-US')).toBe('0')
  })

  it('never rounds a success rate onto 100 % while something failed, or onto 0 % while something worked', () => {
    expect(formatSuccessRate(9_996, 10_000, 'en-US')).toBe('99.9%')
    expect(formatSuccessRate(1, 10_000, 'en-US')).toBe('0.1%')
    expect(formatSuccessRate(10, 10, 'en-US')).toBe('100%')
    expect(formatSuccessRate(573, 1000, 'en-US')).toBe('57.3%')
    expect(formatSuccessRate(0, 0, 'en-US')).toBeNull()
  })

  it('reads latency in milliseconds under a second and seconds above', () => {
    expect(formatLatency(850, 'en-US')).toBe('850 ms')
    expect(formatLatency(1_234, 'en-US')).toBe('1.2 s')
    expect(formatLatency(null, 'en-US')).toBe('—')
    expect(latencyParts(2_000, 'en-US')).toEqual({ value: '2', unit: 's' })
  })

  it('writes estimated dollars with two decimals, and a positive fraction of a cent as < $0.01', () => {
    expect(formatUsd(0.42, 'en-US')).toBe('$0.42')
    expect(formatUsd(1234.5, 'en-US')).toBe('$1,234.50')
    expect(formatUsd(0.004, 'en-US')).toBe('< $0.01')
    expect(formatUsd(0, 'en-US')).toBe('$0.00')
    // `narrowSymbol`: zh-CN would otherwise print US$.
    expect(formatUsd(3, 'zh-CN')).toBe('$3.00')
  })

  it('prices per million tokens down to fractions of a cent', () => {
    expect(formatPricePerMillion(2.5, 'en-US')).toBe('$2.50')
    expect(formatPricePerMillion(0.075, 'en-US')).toBe('$0.075')
    expect(formatPricePerMillion(null, 'en-US')).toBe('—')
    expect(formatTokenLimit(128_000, 'en-US')).toBe('128K')
    expect(formatTokenLimit(null, 'en-US')).toBe('—')
  })

  it('keeps tiny daily costs apart on the value axis', () => {
    const tick = usdTickFormatter('en-US')
    expect(tick(0.0015)).toBe('$0.0015')
    expect(tick(0.002)).toBe('$0.002')
    expect(tick(1500)).toBe('$1.5K')
  })

  it('words durations from the locale files: English plurals, Chinese with its usual space', () => {
    expect(formatDuration(1, 'day', translator('en-US'), 'en-US')).toBe('1 day')
    expect(formatDuration(30, 'day', translator('en-US'), 'en-US')).toBe('30 days')
    expect(formatDuration(1.5, 'hour', translator('en-US'), 'en-US')).toBe('1.5 hours')
    expect(formatDuration(5, 'minute', translator('zh-CN'), 'zh-CN')).toBe('5 分钟')
    expect(formatDuration(30, 'day', translator('zh-CN'), 'zh-CN')).toBe('30 天')
  })

  it('states retention as whole days, otherwise hours, and never-expiring as such', () => {
    const t = translator('en-US')
    expect(formatRetention(30 * DAY_MS, t, 'en-US')).toBe('30 days')
    expect(formatRetention(60 * 60 * 1000, t, 'en-US')).toBe('1 hour')
    expect(formatRetention(36 * 60 * 60 * 1000, t, 'en-US')).toBe('36 hours')
    expect(formatRetention(null, t, 'en-US')).toBe('no expiry')
  })
})

describe('export stamps', () => {
  it('stamps local dates and local ISO times with their offset', () => {
    process.env.TZ = 'Asia/Shanghai'
    // 2026-10-02 18:30 UTC is already the 3rd in Shanghai.
    const at = Date.UTC(2026, 9, 2, 18, 30, 5, 250)
    expect(localDateStamp(at)).toBe('2026-10-03')
    expect(toLocalIsoString(at)).toBe('2026-10-03T02:30:05.250+08:00')

    process.env.TZ = 'America/Los_Angeles'
    expect(toLocalIsoString(at)).toBe('2026-10-02T11:30:05.250-07:00')
  })

  it('reads a record time as a local date and 24-hour time, to the second', () => {
    process.env.TZ = 'Asia/Shanghai'
    const at = Date.UTC(2026, 9, 2, 18, 30, 5, 250)
    expect(formatRecordDateTime(at, 'zh-CN')).toBe('2026/10/03 02:30:05')
    expect(formatRecordDateTime(at, 'en-US')).toBe('10/03/2026, 02:30:05')
    process.env.TZ = 'America/Los_Angeles'
    expect(formatRecordDateTime(at, 'zh-CN')).toBe('2026/10/02 11:30:05')
  })
})
