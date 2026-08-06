import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { TimePattern } from './context-provider'
import { describe, expect, it } from 'vitest'
import { calculateHourAffinity, calculateTimeRelevanceScore } from './recommendation-utils'

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
