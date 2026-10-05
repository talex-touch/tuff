import { afterEach, describe, expect, it } from 'vitest'
import {
  currentTimeZone,
  localDayKey,
  localDayStartMs,
  localMonthKey,
  nextLocalDayStartMs,
  nextLocalMonthStartMs,
  resolveWindow,
  shiftDayKey
} from './local-period'

const originalTimeZone = process.env.TZ
const HOUR_MS = 3_600_000

function useTimeZone(timeZone: string): void {
  process.env.TZ = timeZone
}

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('local usage periods (AC-B2)', () => {
  it('follows a runtime TZ change (positive control for every case below)', () => {
    const instant = Date.parse('2026-10-02T16:01:00.000Z')
    useTimeZone('Asia/Shanghai')
    expect(localDayKey(instant)).toBe('2026-10-03')
    expect(currentTimeZone()).toBe('Asia/Shanghai')
    useTimeZone('America/Los_Angeles')
    expect(localDayKey(instant)).toBe('2026-10-02')
    expect(currentTimeZone()).toBe('America/Los_Angeles')
  })

  it('Asia/Shanghai: UTC 23:59 and 00:01 are one local day; local 23:59 and 00:01 are two', () => {
    useTimeZone('Asia/Shanghai')
    // 07:59 and 08:01 local on 2026-10-03.
    expect(localDayKey(Date.parse('2026-10-02T23:59:00.000Z'))).toBe('2026-10-03')
    expect(localDayKey(Date.parse('2026-10-03T00:01:00.000Z'))).toBe('2026-10-03')
    // 23:59 local on 2026-10-02 and 00:01 local on 2026-10-03.
    expect(localDayKey(Date.parse('2026-10-02T15:59:00.000Z'))).toBe('2026-10-02')
    expect(localDayKey(Date.parse('2026-10-02T16:01:00.000Z'))).toBe('2026-10-03')
    // The month turns at local midnight too, not at 08:00.
    expect(localMonthKey(Date.parse('2026-09-30T15:59:00.000Z'))).toBe('2026-09')
    expect(localMonthKey(Date.parse('2026-09-30T16:01:00.000Z'))).toBe('2026-10')
  })

  it('America/Los_Angeles: UTC 23:59 and 00:01 are one local day; local 23:59 and 00:01 are two', () => {
    useTimeZone('America/Los_Angeles')
    // 16:59 and 17:01 PDT on 2026-10-02.
    expect(localDayKey(Date.parse('2026-10-02T23:59:00.000Z'))).toBe('2026-10-02')
    expect(localDayKey(Date.parse('2026-10-03T00:01:00.000Z'))).toBe('2026-10-02')
    // 23:59 PDT on 2026-10-02 and 00:01 PDT on 2026-10-03.
    expect(localDayKey(Date.parse('2026-10-03T06:59:00.000Z'))).toBe('2026-10-02')
    expect(localDayKey(Date.parse('2026-10-03T07:01:00.000Z'))).toBe('2026-10-03')
    expect(localMonthKey(Date.parse('2026-11-01T06:59:00.000Z'))).toBe('2026-10')
    expect(localMonthKey(Date.parse('2026-11-01T07:01:00.000Z'))).toBe('2026-11')
  })

  it('keeps DST days at their own length and their own local midnight', () => {
    useTimeZone('America/Los_Angeles')
    // 2026-11-01: PDT → PST, a 25-hour day. 2026-03-08: PST → PDT, a 23-hour day.
    expect(localDayStartMs('2026-11-02') - localDayStartMs('2026-11-01')).toBe(25 * HOUR_MS)
    expect(localDayStartMs('2026-03-09') - localDayStartMs('2026-03-08')).toBe(23 * HOUR_MS)
    expect(new Date(localDayStartMs('2026-11-02')).toISOString()).toBe('2026-11-02T08:00:00.000Z')
    expect(new Date(localDayStartMs('2026-11-01')).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    // 23:30 PST on the long day still belongs to it, and the next day starts at its midnight.
    const lateOnLongDay = Date.parse('2026-11-02T07:30:00.000Z')
    expect(localDayKey(lateOnLongDay)).toBe('2026-11-01')
    expect(nextLocalDayStartMs(lateOnLongDay)).toBe(localDayStartMs('2026-11-02'))
  })

  it('resolves windows on local midnights across a DST change', () => {
    useTimeZone('America/Los_Angeles')
    const now = Date.parse('2026-11-03T20:00:00.000Z') // 12:00 PST
    const week = resolveWindow('7d', now)
    expect(week).toMatchObject({ range: '7d', startDay: '2026-10-28', endDay: '2026-11-03' })
    expect(week.days).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03'
    ])
    expect(new Date(week.startMs).toISOString()).toBe('2026-10-28T07:00:00.000Z')
    expect(new Date(week.endMs).toISOString()).toBe('2026-11-04T08:00:00.000Z')
    // Seven calendar days, one of them 25 hours long.
    expect(week.endMs - week.startMs).toBe((7 * 24 + 1) * HOUR_MS)

    const today = resolveWindow('today', now)
    expect(today).toMatchObject({ startDay: '2026-11-03', endDay: '2026-11-03' })
    expect(today.days).toEqual(['2026-11-03'])
    expect(today.endMs - today.startMs).toBe(24 * HOUR_MS)

    const month = resolveWindow('30d', now)
    expect(month.days).toHaveLength(30)
    expect(month.startDay).toBe('2026-10-05')
  })

  it('resolves the same window bounds the day keys imply in Asia/Shanghai', () => {
    useTimeZone('Asia/Shanghai')
    const now = Date.parse('2026-10-02T16:30:00.000Z') // 00:30 local on 2026-10-03
    const window = resolveWindow('today', now)
    expect(window).toMatchObject({ startDay: '2026-10-03', endDay: '2026-10-03' })
    expect(new Date(window.startMs).toISOString()).toBe('2026-10-02T16:00:00.000Z')
    expect(new Date(window.endMs).toISOString()).toBe('2026-10-03T16:00:00.000Z')
    expect(new Date(nextLocalMonthStartMs(now)).toISOString()).toBe('2026-10-31T16:00:00.000Z')
  })

  it('shifts day keys by calendar days regardless of the zone', () => {
    useTimeZone('America/Los_Angeles')
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDayKey('2026-11-01', 1)).toBe('2026-11-02')
    expect(shiftDayKey('2024-03-01', -1)).toBe('2024-02-29')
    expect(() => localDayStartMs('2026/11/01')).toThrow(/Invalid usage day key/)
  })
})
