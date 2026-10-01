import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_SCORE_MAX,
  calculateBehaviorScore,
  calculatePluginPriorityContribution,
  calculateTimeContribution,
  isFrequentEligible,
  PLUGIN_PRIORITY_MAX_CONTRIBUTION,
  TIME_CONTRIBUTION_MAX
} from '../core-box/recommendation-weights'
import type { UsageBehaviorFacts } from '../core-box/recommendation-weights'
import type { TimePattern } from '../core-box/recommendation'
import { recommendWeights } from '../plugin/sdk/recommend'

/**
 * This is a published SDK surface: a plugin's `RecommendProvider` ranks its candidates with the
 * same functions the host ranks the grid with. The assertions below are the rank orderings a
 * caller can observe (relations, not the constants behind them), so the bounded time model can
 * change its scale and multipliers without breaking the suite.
 */

const monday9am: TimePattern = {
  hourOfDay: 9,
  dayOfWeek: 1,
  isWorkingHours: true,
  timeSlot: 'morning'
}

function facts(overrides: Partial<UsageBehaviorFacts> = {}): UsageBehaviorFacts {
  const zeroHours = () => Array.from({ length: 24 }, () => 0)
  const zeroDays = () => Array.from({ length: 7 }, () => 0)
  return {
    executeCount: overrides.executeCount ?? 0,
    executeCount30: overrides.executeCount30 ?? 0,
    executeCount7: overrides.executeCount7 ?? 0,
    activeDays30: overrides.activeDays30 ?? 0,
    lastExecutedAt: overrides.lastExecutedAt ?? null,
    decayedExecuteScore30: overrides.decayedExecuteScore30 ?? 0,
    hourDistribution30: overrides.hourDistribution30 ?? zeroHours(),
    dayOfWeekDistribution30: overrides.dayOfWeekDistribution30 ?? zeroDays(),
    timeSlotDistribution30: overrides.timeSlotDistribution30 ?? {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    }
  }
}

/** Facts whose executions all land on the current slot/weekday/hour — the strongest time signal. */
function concentratedAt(factsInput: UsageBehaviorFacts, at: TimePattern, count: number) {
  const hours = Array.from({ length: 24 }, () => 0)
  hours[at.hourOfDay] = count
  const days = Array.from({ length: 7 }, () => 0)
  days[at.dayOfWeek] = count
  return {
    ...factsInput,
    hourDistribution30: hours,
    dayOfWeekDistribution30: days,
    timeSlotDistribution30: {
      morning: at.timeSlot === 'morning' ? count : 0,
      afternoon: at.timeSlot === 'afternoon' ? count : 0,
      evening: at.timeSlot === 'evening' ? count : 0,
      night: at.timeSlot === 'night' ? count : 0
    }
  }
}

describe('calculateBehaviorScore', () => {
  it('stays inside 0..100 however large the history grows', () => {
    // Saturation, not an unbounded sum: a lifetime of use must not overflow the scale the grid
    // ranks on, and a single burst at every period must not exceed it either.
    for (const executeCount7 of [0, 5, 50, 5_000, 1_000_000]) {
      const score = calculateBehaviorScore(
        facts({
          executeCount7,
          executeCount30: executeCount7,
          decayedExecuteScore30: executeCount7,
          activeDays30: 30
        })
      )
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(BEHAVIOR_SCORE_MAX)
    }
  })

  it('is zero with no recorded execution and rises with recent use', () => {
    expect(calculateBehaviorScore(facts())).toBe(0)

    const low = calculateBehaviorScore(facts({ executeCount7: 1, executeCount30: 1, activeDays30: 1 }))
    const high = calculateBehaviorScore(
      facts({ executeCount7: 20, executeCount30: 20, decayedExecuteScore30: 20, activeDays30: 5 })
    )

    // A dropped recent term would make these equal; a missing saturating term would be flat.
    expect(high).toBeGreaterThan(low)
    expect(low).toBeGreaterThan(0)
  })

  it('does not let a long history pin the score forever: one more use only adds its own weight', () => {
    // The sustained term is the decayed 30-day score, not the lifetime count. A user who used an
    // item heavily long ago scores low until new dated executions arrive.
    const stale = calculateBehaviorScore(
      facts({ executeCount: 5_000, executeCount30: 0, decayedExecuteScore30: 0, activeDays30: 0 })
    )
    expect(stale).toBe(0)

    const revived = calculateBehaviorScore(
      facts({ executeCount: 5_001, executeCount30: 1, decayedExecuteScore30: 1, activeDays30: 1 })
    )
    expect(revived).toBeGreaterThan(0)
  })
})

describe('calculateTimeContribution', () => {
  const monday9amLocal: TimePattern = monday9am
  const now = new Date('2026-05-04T09:00:00.000Z').getTime()

  it('adds nothing below the evidence threshold: nine uses or two distinct days score zero', () => {
    // A single concentrated use proves nothing; the boundary is ten uses over three days.
    const oneUse = concentratedAt(
      facts({ executeCount30: 1, activeDays30: 1, lastExecutedAt: now }),
      monday9amLocal,
      1
    )
    expect(calculateTimeContribution(oneUse, monday9amLocal, now)).toBe(0)

    const nineUses = concentratedAt(
      facts({ executeCount30: 9, activeDays30: 9, lastExecutedAt: now }),
      monday9amLocal,
      9
    )
    expect(calculateTimeContribution(nineUses, monday9amLocal, now)).toBe(0)

    const twoDays = concentratedAt(
      facts({ executeCount30: 10, activeDays30: 2, lastExecutedAt: now }),
      monday9amLocal,
      10
    )
    expect(calculateTimeContribution(twoDays, monday9amLocal, now)).toBe(0)
  })

  it('adds points at ten uses over three days, and never past the cap', () => {
    const threshold = concentratedAt(
      facts({ executeCount30: 10, activeDays30: 3, lastExecutedAt: now }),
      monday9amLocal,
      10
    )
    const score = calculateTimeContribution(threshold, monday9amLocal, now)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(TIME_CONTRIBUTION_MAX)

    // Fully concentrated, fully recent, far past the evidence threshold: still capped at 20.
    const saturated = concentratedAt(
      facts({ executeCount30: 1_000, activeDays30: 30, lastExecutedAt: now }),
      monday9amLocal,
      1_000
    )
    expect(calculateTimeContribution(saturated, monday9amLocal, now)).toBeLessThanOrEqual(
      TIME_CONTRIBUTION_MAX
    )
  })

  it('decays the contribution as the evidence ages', () => {
    const base = facts({ executeCount30: 20, activeDays30: 5 })
    const fresh = concentratedAt({ ...base, lastExecutedAt: now }, monday9amLocal, 20)
    const old = concentratedAt(
      { ...base, lastExecutedAt: now - 60 * 24 * 60 * 60 * 1000 },
      monday9amLocal,
      20
    )

    // Without the age factor, old evidence would sit at its maximum forever.
    expect(calculateTimeContribution(fresh, monday9amLocal, now)).toBeGreaterThan(
      calculateTimeContribution(old, monday9amLocal, now)
    )
  })
})

describe('isFrequentEligible', () => {
  it('requires both five uses in thirty days and three distinct days', () => {
    expect(isFrequentEligible(facts({ executeCount30: 4, activeDays30: 3 }))).toBe(false)
    expect(isFrequentEligible(facts({ executeCount30: 5, activeDays30: 2 }))).toBe(false)
    expect(isFrequentEligible(facts({ executeCount30: 4, activeDays30: 4 }))).toBe(false)
    expect(isFrequentEligible(facts({ executeCount30: 5, activeDays30: 3 }))).toBe(true)
  })

  it('does not accept a lifetime count without recent, spread-out use', () => {
    // Five uses in one day is a session, not a habit; a huge lifetime count is not evidence either.
    expect(isFrequentEligible(facts({ executeCount: 500, executeCount30: 5, activeDays30: 1 }))).toBe(
      false
    )
    expect(isFrequentEligible(facts({ executeCount: 500, executeCount30: 0, activeDays30: 0 }))).toBe(
      false
    )
  })
})

describe('calculatePluginPriorityContribution', () => {
  it('caps a self-declared priority at five points', () => {
    expect(calculatePluginPriorityContribution(undefined)).toBe(0)
    expect(calculatePluginPriorityContribution(0)).toBe(0)
    expect(calculatePluginPriorityContribution(-50)).toBe(0)
    expect(calculatePluginPriorityContribution(100)).toBe(PLUGIN_PRIORITY_MAX_CONTRIBUTION)
    // Declaring a million must buy nothing beyond a declaration of 100.
    expect(calculatePluginPriorityContribution(1_000_000)).toBe(PLUGIN_PRIORITY_MAX_CONTRIBUTION)
  })

  it('still orders a plugin’s own candidates below the cap', () => {
    const low = calculatePluginPriorityContribution(10)
    const high = calculatePluginPriorityContribution(80)

    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(PLUGIN_PRIORITY_MAX_CONTRIBUTION)
  })
})

describe('recommendWeights SDK surface', () => {
  it('ranks and gates from the same bounded model the host uses', () => {
    // Asserted through the published functions on a shared sample, not by comparing function
    // identity: what a plugin must agree with is the answer, not which object produced it.
    const sample: UsageBehaviorFacts = {
      executeCount: 30,
      executeCount30: 12,
      executeCount7: 4,
      activeDays30: 4,
      lastExecutedAt: Date.now(),
      decayedExecuteScore30: 9,
      hourDistribution30: Array.from({ length: 24 }, () => 0),
      dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
      timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    }

    expect(recommendWeights.behaviorScore(sample)).toBe(calculateBehaviorScore(sample))
    expect(recommendWeights.behaviorScore(sample)).toBeLessThanOrEqual(BEHAVIOR_SCORE_MAX)
    expect(recommendWeights.timeContribution(sample, monday9am)).toBeLessThanOrEqual(
      TIME_CONTRIBUTION_MAX
    )
    expect(recommendWeights.isFrequentEligible(sample)).toBe(true)
    expect(recommendWeights.pluginPriorityContribution(1_000_000)).toBe(
      PLUGIN_PRIORITY_MAX_CONTRIBUTION
    )
  })

  it('does not expose a frecency or usage-stats entry point', () => {
    // Frecency reads item_usage_stats row shapes; publishing it would freeze an internal table as
    // an API and hand a plugin behaviour it never observed.
    expect(recommendWeights).not.toHaveProperty('frecency')
    expect(recommendWeights).not.toHaveProperty('getUsageStatsBatch')
  })
})
