import type {
  UsageInsights,
  UsageTotals
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { afterEach, describe, expect, it } from 'vitest'
import { DAY_MS, localMidnight } from './audit-format'
import {
  buildTrendSeries,
  nearestTrendDay,
  otherTokens,
  TREND_PADDING_SERIES,
  trendDayAtTick,
  trendDays
} from './audit-trend'

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

function totals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    avgLatencyMs: null,
    ...overrides
  }
}

function insights(
  startDay: string,
  endDay: string,
  days: UsageInsights['days']
): Pick<UsageInsights, 'window' | 'days'> {
  return {
    window: { range: '7d', startDay, endDay, startMs: 0, endMs: 0 },
    days
  }
}

const STYLES = {
  input: { name: 'Input', color: 'var(--input)' },
  output: { name: 'Output', color: 'var(--output)' },
  other: { name: 'Other', color: 'var(--other)' },
  success: { name: 'Succeeded', color: 'var(--success)' },
  failure: { name: 'Failed', color: 'var(--failure)' },
  cost: { name: 'Cost', color: 'var(--cost)' }
}

describe('trendDays', () => {
  it('fills every day of the window, a missing day as a real zero', () => {
    const days = trendDays(
      insights('2026-09-27', '2026-10-03', [
        { day: '2026-09-28', ...totals({ requestCount: 3, totalTokens: 90 }) },
        { day: '2026-10-03', ...totals({ requestCount: 1, totalTokens: 10 }) }
      ])
    )
    expect(days.map((day) => day.day)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03'
    ])
    expect(days.map((day) => day.totals.requestCount)).toEqual([0, 3, 0, 0, 0, 0, 1])
  })

  it('puts each bar on the local midnight of its day key', () => {
    process.env.TZ = 'Asia/Shanghai'
    const [day] = trendDays(insights('2026-10-03', '2026-10-03', []))
    expect(day!.at).toBe(localMidnight('2026-10-03'))
    expect(new Date(day!.at).getHours()).toBe(0)
  })
})

describe('buildTrendSeries', () => {
  const days = trendDays(
    insights('2026-10-01', '2026-10-03', [
      {
        day: '2026-10-01',
        ...totals({
          requestCount: 5,
          successCount: 4,
          failureCount: 1,
          promptTokens: 300,
          completionTokens: 200,
          totalTokens: 500,
          estimatedCostUsd: 0.01
        })
      },
      {
        day: '2026-10-03',
        ...totals({
          requestCount: 2,
          successCount: 2,
          promptTokens: 40,
          completionTokens: 10,
          totalTokens: 50
        })
      }
    ])
  )

  it('stacks input on output for tokens, with zeros on the empty day', () => {
    const series = buildTrendSeries(days, 'tokens', STYLES)
    expect(series.map((entry) => entry.name)).toEqual(['Input', 'Output', TREND_PADDING_SERIES])
    expect(series[0]!.data.map(([, value]) => value)).toEqual([300, 0, 40])
    expect(series[1]!.data.map(([, value]) => value)).toEqual([200, 0, 10])
    expect(series[0]!.color).toBe('var(--input)')
  })

  it('stacks succeeded on failed for requests, and draws one series for cost', () => {
    const requests = buildTrendSeries(days, 'requests', STYLES)
    expect(requests.map((entry) => entry.name)).toEqual([
      'Succeeded',
      'Failed',
      TREND_PADDING_SERIES
    ])
    expect(requests[1]!.data.map(([, value]) => value)).toEqual([1, 0, 0])

    const cost = buildTrendSeries(days, 'cost', STYLES)
    expect(cost.map((entry) => entry.name)).toEqual(['Cost', TREND_PADDING_SERIES])
    expect(cost[0]!.data.map(([, value]) => value)).toEqual([0.01, 0, 0])
  })

  it('adds a third token piece only when a day reports tokens on neither side', () => {
    const odd = trendDays(
      insights('2026-10-03', '2026-10-03', [
        { day: '2026-10-03', ...totals({ promptTokens: 10, completionTokens: 5, totalTokens: 20 }) }
      ])
    )
    expect(otherTokens(odd[0]!.totals)).toBe(5)
    expect(buildTrendSeries(odd, 'tokens', STYLES).map((entry) => entry.name)).toEqual([
      'Input',
      'Output',
      'Other',
      TREND_PADDING_SERIES
    ])
  })

  it('widens the domain by half a day on each side with a padding series that draws nothing', () => {
    const series = buildTrendSeries(days, 'tokens', STYLES)
    const padding = series.find((entry) => entry.name === TREND_PADDING_SERIES)!
    expect(padding.data).toEqual([
      [days[0]!.at - DAY_MS / 2, 0],
      [days[2]!.at + DAY_MS / 2, 0]
    ])
    // Last, so the visible series keep their palette slots.
    expect(series.at(-1)).toBe(padding)
  })

  it('has no padding over an empty window', () => {
    expect(buildTrendSeries([], 'tokens', STYLES).map((entry) => entry.name)).toEqual([
      'Input',
      'Output'
    ])
  })
})

describe('axis and tooltip days', () => {
  const days = trendDays(insights('2026-10-01', '2026-10-03', []))

  it('snaps a pointer between two bars to the nearer one', () => {
    expect(nearestTrendDay(days, days[1]!.at + DAY_MS * 0.4)!.day).toBe('2026-10-02')
    expect(nearestTrendDay(days, days[1]!.at + DAY_MS * 0.6)!.day).toBe('2026-10-03')
    expect(nearestTrendDay([], 0)).toBeNull()
  })

  it('labels a tick only when it falls on a bar', () => {
    expect(trendDayAtTick(days, days[2]!.at)!.day).toBe('2026-10-03')
    expect(trendDayAtTick(days, days[2]!.at + 6 * 60 * 60 * 1000)).toBeNull()
  })
})
