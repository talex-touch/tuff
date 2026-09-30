import { describe, expect, it } from 'vitest'
import {
  PEAK_HOUR_MIN_SAMPLES,
  resolveEvidenceBackedReason,
  resolvePeakHourRange
} from './recommendation-utils'
import type { UsageBehaviorFacts } from '@talex-touch/utils/core-box'

/** The dated facts the decision reads; a source's own proof is the only thing that varies. */
function facts(overrides: Partial<UsageBehaviorFacts> = {}): UsageBehaviorFacts {
  return {
    executeCount: 0,
    executeCount30: 0,
    executeCount7: 0,
    activeDays30: 0,
    lastExecutedAt: null,
    decayedExecuteScore30: 0,
    hourDistribution30: Array.from({ length: 24 }, () => 0),
    dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
    timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 },
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

  it('needs enough distinct active days before claiming a peak', () => {
    // Same 16 executions crammed into two days is a session, not a habit — the reason must not be
    // claimed even though the samples and the concentration would otherwise pass.
    const concentrated = hourDistribution({ 9: 8, 10: 8 })

    expect(resolvePeakHourRange(concentrated, 5)).toEqual({ startHour: 8, endHour: 10 })
    expect(resolvePeakHourRange(concentrated, 2)).toBeNull()
    expect(resolvePeakHourRange(concentrated, 0)).toBeNull()
  })

  it('still reports no peak on too few samples even with enough active days', () => {
    // The two gates are independent: spread-out days alone must not fabricate a pattern.
    expect(resolvePeakHourRange(hourDistribution({ 9: 9 }), 30)).toBeNull()
  })
})

describe('resolveEvidenceBackedReason', () => {
  const DAY = 86_400_000

  it('withholds every dated claim when the ledger cannot date a single execution', () => {
    // A legacy row: lifetime count kept, raw stored timestamp kept, but no accepted event. It must
    // not wear "最近使用" / "此时常用" / "上升", and a lifetime count does not make it "常用" (R9).
    const legacy = facts({
      executeCount: 500,
      executeCount30: 0,
      activeDays30: 0,
      lastExecutedAt: null
    })

    expect(resolveEvidenceBackedReason('recent', legacy)).toBe('cold-start')
    expect(resolveEvidenceBackedReason('trending', legacy)).toBe('cold-start')
    expect(resolveEvidenceBackedReason('time-based', legacy)).toBe('cold-start')
    expect(resolveEvidenceBackedReason('frequent', legacy)).toBe('cold-start')
  })

  it('keeps the recent and time-based claims once the ledger carries dated evidence', () => {
    const dated = facts({
      executeCount: 12,
      executeCount30: 12,
      executeCount7: 4,
      activeDays30: 4,
      lastExecutedAt: Date.now() - DAY
    })

    expect(resolveEvidenceBackedReason('recent', dated)).toBe('recent')
    // 12 executions over 4 distinct days clears the 10/3 gate the time score itself uses.
    expect(resolveEvidenceBackedReason('time-based', dated)).toBe('time-based')
  })

  it('keeps the time-based claim below the execution gate even when the days are there', () => {
    // Nine executions is still a session-sized sample; the label must not claim "此时常用".
    const nineUses = facts({
      executeCount: 9,
      executeCount30: 9,
      activeDays30: 4,
      lastExecutedAt: Date.now() - DAY
    })

    expect(resolveEvidenceBackedReason('time-based', nineUses)).toBe('cold-start')
  })

  it('turns the frequent claim into recent when the habit gate fails but a dated run exists', () => {
    // Five executions inside two days: recent enough to be "最近使用", not a habit.
    const sessionOnly = facts({
      executeCount: 5,
      executeCount30: 5,
      executeCount7: 5,
      activeDays30: 2,
      lastExecutedAt: Date.now() - DAY
    })

    expect(resolveEvidenceBackedReason('frequent', sessionOnly)).toBe('recent')
  })

  it('keeps the trending claim only for real recent growth', () => {
    // One dated execution is a use, not a rise.
    const singleUse = facts({ executeCount30: 4, executeCount7: 1, lastExecutedAt: Date.now() })
    expect(resolveEvidenceBackedReason('trending', singleUse)).toBe('cold-start')

    // Two of the last four executions landing in the 7-day window is growth.
    const growing = facts({ executeCount30: 4, executeCount7: 2, lastExecutedAt: Date.now() })
    expect(resolveEvidenceBackedReason('trending', growing)).toBe('trending')
  })

  it('does not call a saturating habit trending, however dated it is', () => {
    // 40 lifetime executions with 2 recent is deceleration, not a trend: a single new event must not
    // re-justify an established pattern as "上升" (R9).
    const saturating = facts({
      executeCount: 40,
      executeCount30: 40,
      executeCount7: 2,
      lastExecutedAt: Date.now()
    })
    expect(resolveEvidenceBackedReason('trending', saturating)).toBe('cold-start')
  })

  it('leaves the sources that carry their own proof untouched', () => {
    const none = facts()
    for (const source of [
      'pinned',
      'plugin',
      'context',
      'newly-installed',
      'newly-added',
      'cold-start'
    ] as const) {
      expect(resolveEvidenceBackedReason(source, none)).toBe(source)
      expect(resolveEvidenceBackedReason(source, undefined)).toBe(source)
    }
  })
})
