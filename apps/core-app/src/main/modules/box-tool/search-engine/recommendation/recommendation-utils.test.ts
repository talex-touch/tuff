import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { TimePattern } from './context-provider'
import { describe, expect, it } from 'vitest'
import {
  calculateHourAffinity,
  calculateTimeRelevanceScore,
  PEAK_HOUR_MIN_SAMPLES,
  resolvePeakHourRange
} from './recommendation-utils'

const morningNine: TimePattern = {
  hourOfDay: 9,
  dayOfWeek: 1,
  isWorkingHours: true,
  timeSlot: 'morning'
}

function createTimeStats(overrides: Partial<ParsedItemTimeStats> = {}): ParsedItemTimeStats {
  return {
    sourceId: 'app-provider',
    itemId: 'item',
    hourDistribution: Array.from({ length: 24 }, () => 0),
    dayOfWeekDistribution: [0, 10, 0, 0, 0, 0, 0],
    timeSlotDistribution: { morning: 10, afternoon: 0, evening: 0, night: 0 },
    lastUpdated: new Date('2026-05-04T09:00:00.000Z'),
    ...overrides
  }
}

function hourDistribution(counts: Record<number, number>): number[] {
  const distribution = Array.from({ length: 24 }, () => 0)
  for (const [hour, count] of Object.entries(counts)) {
    distribution[Number(hour)] = count
  }
  return distribution
}

describe('calculateHourAffinity', () => {
  it('reports no signal when the distribution is missing or empty', () => {
    expect(calculateHourAffinity(undefined, 9)).toBeNull()
    expect(calculateHourAffinity([], 9)).toBeNull()
    expect(
      calculateHourAffinity(
        Array.from({ length: 24 }, () => 0),
        9
      )
    ).toBeNull()
  })

  it('scores the current hour against the item busiest hour', () => {
    const distribution = hourDistribution({ 9: 10, 14: 5 })

    expect(calculateHourAffinity(distribution, 9)).toBe(1)
    expect(calculateHourAffinity(distribution, 14)).toBe(0.5)
    expect(calculateHourAffinity(distribution, 20)).toBe(0)
  })

  it('treats a uniform distribution as a full match at every hour', () => {
    const distribution = Array.from({ length: 24 }, () => 3)

    expect(calculateHourAffinity(distribution, 0)).toBe(1)
    expect(calculateHourAffinity(distribution, 23)).toBe(1)
  })
})

describe('calculateTimeRelevanceScore hour weighting', () => {
  it('leaves the score untouched for items with no hour history', () => {
    const legacy = createTimeStats()
    const withHours = createTimeStats({ hourDistribution: hourDistribution({ 9: 10 }) })

    // Legacy rows keep the pure slot/weekday score; an item peaking on the
    // current hour must not score lower than one with no hour data at all.
    expect(calculateTimeRelevanceScore(legacy, morningNine)).toBeGreaterThan(0)
    expect(calculateTimeRelevanceScore(withHours, morningNine)).toBe(
      calculateTimeRelevanceScore(legacy, morningNine)
    )
  })

  it('ranks an item that peaks on the current hour above one that peaks elsewhere', () => {
    const peaksNow = createTimeStats({ hourDistribution: hourDistribution({ 9: 10, 11: 1 }) })
    const peaksLater = createTimeStats({ hourDistribution: hourDistribution({ 9: 1, 11: 10 }) })

    expect(calculateTimeRelevanceScore(peaksNow, morningNine)).toBeGreaterThan(
      calculateTimeRelevanceScore(peaksLater, morningNine)
    )
  })

  it('splits the score evenly between slot affinity and hour affinity', () => {
    const uniformHours = createTimeStats({
      hourDistribution: Array.from({ length: 24 }, () => 1)
    })
    const halfSlot = createTimeStats({
      timeSlotDistribution: { morning: 5, afternoon: 5, evening: 0, night: 0 },
      hourDistribution: hourDistribution({ 9: 10 })
    })

    // slotRatio 1 + hourAffinity 1 → identical halves, so the blend equals the
    // slot-only score.
    const slotOnly = calculateTimeRelevanceScore(createTimeStats(), morningNine)
    expect(calculateTimeRelevanceScore(uniformHours, morningNine)).toBeCloseTo(slotOnly, 6)

    // slotRatio 0.5 + hourAffinity 1 → the hour half lifts the weaker slot half.
    expect(calculateTimeRelevanceScore(halfSlot, morningNine)).toBeGreaterThan(slotOnly * 0.5)
    expect(calculateTimeRelevanceScore(halfSlot, morningNine)).toBeLessThan(slotOnly)
  })

  it('stays zero for items with no usage at all', () => {
    const empty = createTimeStats({
      timeSlotDistribution: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: Array.from({ length: 7 }, () => 0),
      hourDistribution: hourDistribution({ 9: 5 })
    })

    expect(calculateTimeRelevanceScore(empty, morningNine)).toBe(0)
  })
})

describe('calculateTimeRelevanceScore weekday evidence', () => {
  /** Same slot profile for both, so only the weekday distribution differs. */
  const withWeekdays = (dayOfWeekDistribution: number[]) =>
    createTimeStats({ dayOfWeekDistribution })

  it('ranks weak weekday evidence above none', () => {
    // #650: absence gave the neutral factor 1 while a below-average count gave < 1, so an item
    // never used on a Monday outranked one the user does use on Mondays.
    const neverOnMonday = withWeekdays([10, 0, 10, 10, 10, 10, 10])
    const twiceOnMonday = withWeekdays([10, 2, 10, 10, 10, 10, 10])

    expect(calculateTimeRelevanceScore(twiceOnMonday, morningNine)).toBeGreaterThan(
      calculateTimeRelevanceScore(neverOnMonday, morningNine)
    )
  })

  it('still ranks a typical weekday above an atypical one', () => {
    // Positive control on direction: the factor must remain monotone, not merely non-inverted.
    const mostlyMonday = withWeekdays([0, 20, 0, 0, 0, 0, 0])
    const rarelyMonday = withWeekdays([20, 1, 20, 20, 20, 20, 20])

    expect(calculateTimeRelevanceScore(mostlyMonday, morningNine)).toBeGreaterThan(
      calculateTimeRelevanceScore(rarelyMonday, morningNine)
    )
  })

  it('does not erase an item that has never been used on this weekday', () => {
    // Dividing unconditionally would make the factor 0 and zero the whole score. getTimeBasedTopItems
    // keeps only timeScore > 0, so the item would vanish from time-based results entirely — worse
    // than the mis-ranking being fixed.
    const neverOnMonday = withWeekdays([10, 0, 10, 10, 10, 10, 10])

    expect(calculateTimeRelevanceScore(neverOnMonday, morningNine)).toBeGreaterThan(0)
  })

  it('is monotone in the weekday count', () => {
    const scores = [0, 1, 2, 5, 10, 20].map((count) =>
      calculateTimeRelevanceScore(withWeekdays([10, count, 10, 10, 10, 10, 10]), morningNine)
    )

    for (let index = 1; index < scores.length; index++)
      expect(scores[index]).toBeGreaterThan(scores[index - 1]!)
  })
})

describe('resolvePeakHourRange', () => {
  it('reports no peak when the distribution is missing or malformed', () => {
    expect(resolvePeakHourRange(undefined)).toBeNull()
    expect(resolvePeakHourRange([])).toBeNull()
    expect(resolvePeakHourRange([1, 2, 3])).toBeNull()
  })

  it('needs at least PEAK_HOUR_MIN_SAMPLES executions before claiming a pattern', () => {
    expect(resolvePeakHourRange(hourDistribution({ 9: 9 }))).toBeNull()
    expect(resolvePeakHourRange(hourDistribution({ 9: PEAK_HOUR_MIN_SAMPLES }))).toEqual({
      startHour: 7,
      endHour: 9
    })
  })

  it('reports no peak when usage is spread evenly across the day', () => {
    // Every window holds 3/24 = 12.5%, far under the 40% bar.
    expect(resolvePeakHourRange(Array.from({ length: 24 }, () => 5))).toBeNull()
  })

  it('returns the busiest three-hour window', () => {
    expect(resolvePeakHourRange(hourDistribution({ 9: 8, 10: 9, 11: 7, 15: 2 }))).toEqual({
      startHour: 9,
      endHour: 11
    })
  })

  it('wraps the window past midnight', () => {
    expect(resolvePeakHourRange(hourDistribution({ 22: 5, 23: 6, 0: 4 }))).toEqual({
      startHour: 22,
      endHour: 0
    })
  })

  it('accepts a window sitting exactly on the share threshold', () => {
    // 8 of 20 executions = 0.4 exactly, which is not below the bar.
    const distribution = hourDistribution({ 9: 4, 10: 4, 15: 4, 18: 4, 21: 4 })

    expect(resolvePeakHourRange(distribution)).toEqual({ startHour: 8, endHour: 10 })
  })

  it('treats corrupt buckets as absent rather than trusting them', () => {
    const distribution = hourDistribution({ 9: 12 })
    distribution[3] = Number.NaN
    distribution[4] = -50

    expect(resolvePeakHourRange(distribution)).toEqual({ startHour: 7, endHour: 9 })
  })

  it('keeps the earliest start when two windows tie', () => {
    const distribution = hourDistribution({ 6: 10, 18: 10 })

    expect(resolvePeakHourRange(distribution)).toEqual({ startHour: 4, endHour: 6 })
  })
})
