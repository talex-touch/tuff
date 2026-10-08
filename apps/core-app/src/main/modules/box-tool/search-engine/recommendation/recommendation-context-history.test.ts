import type { RecommendationHistoryEvent } from '../../../../db/utils'
import type { ContextSignal } from './context-provider'
import { describe, expect, it, vi } from 'vitest'
import { buildRecommendationContextCandidates } from './recommendation-context-history'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = new Date(2026, 9, 6, 9, 30).getTime()
const SOURCE = 'com.example.editor'

function context(now = NOW, overrides: Partial<ContextSignal> = {}): ContextSignal {
  const date = new Date(now)
  return {
    time: {
      hourOfDay: date.getHours(),
      dayOfWeek: date.getDay(),
      isWorkingHours: true,
      timeSlot: 'morning'
    },
    foregroundApp: { bundleId: SOURCE, name: 'Editor' },
    ...overrides
  }
}

function at(daysAgo: number, hour = 9, minute = 30, now = NOW): number {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.getTime()
}

function event(
  itemId: string,
  timestamp: number,
  previousApp: string | null = SOURCE,
  sourceId = 'app-provider'
): RecommendationHistoryEvent {
  return { sourceId, itemId, sourceType: 'application', timestamp, previousApp }
}

function background(count: number): RecommendationHistoryEvent[] {
  return Array.from({ length: count }, (_, index) =>
    event('other-target', at(2 + (index % 8), 16), 'com.example.browser')
  )
}

function target(events: readonly RecommendationHistoryEvent[], signal = context(), now = NOW) {
  return buildRecommendationContextCandidates(events, signal, now).find(
    (candidate) => candidate.itemId === 'target'
  )
}

describe('buildRecommendationContextCandidates source preference', () => {
  it('recalls a locally preferred target with counts from the same accepted-event window', () => {
    const events = [
      event('target', at(2)),
      event('target', at(3)),
      event('target', at(3, 10)),
      event('target', at(4), 'com.example.browser'),
      ...background(8)
    ]
    const candidate = target(events)

    expect(candidate).toMatchObject({
      sourceId: 'app-provider',
      itemId: 'target',
      sourceType: 'application',
      source: 'app-context',
      evidence: {
        sourceApp: {
          bundleId: SOURCE,
          name: 'Editor',
          executeCount: 3,
          activeDays: 2,
          totalExecutions: 3,
          baselineExecuteCount: 4,
          baselineTotalExecutions: 12
        }
      }
    })
    expect(candidate?.score).toBeGreaterThan(0)
    expect(candidate?.score).toBeLessThanOrEqual(25)
    expect(candidate?.evidence.sourceApp).not.toHaveProperty('timeWindow')
  })

  it.each([
    { name: 'two executions on two days', days: [2, 3], accepted: false },
    { name: 'three executions on one day', days: [2, 2, 2], accepted: false },
    { name: 'three executions on two days', days: [2, 3, 3], accepted: true }
  ])('requires repeat use across dates: $name', ({ days, accepted }) => {
    const candidate = target([
      ...days.map((daysAgo) => event('target', at(daysAgo))),
      ...background(20)
    ])

    if (accepted) expect(candidate?.source).toBe('app-context')
    else expect(candidate).toBeUndefined()
  })

  it('does not call global popularity a source preference', () => {
    const events = [
      ...[2, 3, 4].flatMap((daysAgo) => [
        event('target', at(daysAgo)),
        event('other-target', at(daysAgo)),
        event('target', at(daysAgo), 'com.example.browser'),
        event('other-target', at(daysAgo), 'com.example.browser')
      ])
    ]

    expect(target(events)).toBeUndefined()
  })

  it.each([
    { name: 'share gain at the five-percent boundary', extraTarget: 6, accepted: false },
    { name: 'share gain above the boundary', extraTarget: 5, accepted: true }
  ])('$name', ({ extraTarget, accepted }) => {
    // Conditional share = 3/6. Global share = 9/20 or 8/20; only the latter clears >0.05.
    const events = [
      ...[2, 3, 4].map((daysAgo) => event('target', at(daysAgo))),
      ...[2, 3, 4].map((daysAgo) => event('source-other', at(daysAgo))),
      ...Array.from({ length: extraTarget }, () => event('target', at(5), 'com.example.browser')),
      ...background(14 - extraTarget)
    ]
    const candidate = target(events)

    if (accepted) expect(candidate?.source).toBe('app-context')
    else expect(candidate).toBeUndefined()
  })

  it.each([
    {
      name: 'four of twenty versus six of forty is exactly five percentage points',
      sourceTarget: 4,
      sourceTotal: 20,
      globalTarget: 6,
      globalTotal: 40,
      accepted: false
    },
    {
      name: 'three of four versus seven of ten is exactly five percentage points',
      sourceTarget: 3,
      sourceTotal: 4,
      globalTarget: 7,
      globalTotal: 10,
      accepted: false
    },
    {
      name: 'four of twenty versus five of forty exceeds five percentage points',
      sourceTarget: 4,
      sourceTotal: 20,
      globalTarget: 5,
      globalTotal: 40,
      accepted: true
    }
  ])('compares the exact accepted-count shares: $name', (row) => {
    // Both exact-boundary rows round upward under floating subtraction (0.2 - 0.15 and
    // 0.75 - 0.7). They must not acquire app-context evidence merely because of that rounding.
    const fromSource = [
      ...Array.from({ length: row.sourceTarget }, (_, index) =>
        event('target', at(2 + (index % 3)))
      ),
      ...Array.from({ length: row.sourceTotal - row.sourceTarget }, (_, index) =>
        event('source-other', at(2 + (index % 5)))
      )
    ]
    const otherTargetCount = row.globalTarget - row.sourceTarget
    const events = [
      ...fromSource,
      ...Array.from({ length: otherTargetCount }, (_, index) =>
        event('target', at(2 + (index % 3)), 'com.example.browser')
      ),
      ...background(row.globalTotal - row.sourceTotal - otherTargetCount)
    ]
    const candidate = target(events)

    if (row.accepted) {
      expect(candidate?.source).toBe('app-context')
      expect(candidate?.evidence.sourceApp).toMatchObject({
        executeCount: row.sourceTarget,
        activeDays: 3,
        totalExecutions: row.sourceTotal,
        baselineExecuteCount: row.globalTarget,
        baselineTotalExecutions: row.globalTotal
      })
    } else {
      expect(candidate).toBeUndefined()
    }
  })

  it('dampens sparse evidence without pinning the scoring formula', () => {
    const sparse = target([
      ...[2, 3, 3].map((daysAgo) => event('target', at(daysAgo))),
      ...background(27)
    ])
    const established = target([
      ...Array.from({ length: 10 }, (_, index) => event('target', at(2 + (index % 5)))),
      ...background(90)
    ])

    expect(sparse?.score).toBeGreaterThan(0)
    expect(established?.score).toBeGreaterThan(sparse!.score)
    expect(established?.score).toBeLessThanOrEqual(25)
  })

  it.each([undefined, { bundleId: 'com.github.Electron', name: 'Electron' }])(
    'does not infer a source association without a distinguishable foreground identity',
    (foregroundApp) => {
      const events = [
        ...[2, 3, 4].map((daysAgo) => event('target', at(daysAgo), 'com.github.Electron')),
        ...background(20)
      ]
      expect(target(events, context(NOW, { foregroundApp }))).toBeUndefined()
    }
  )

  it('keeps different providers with the same item id separate', () => {
    const events = [
      ...[2, 3, 4].flatMap((daysAgo) => [
        event('target', at(daysAgo), SOURCE, 'provider-a'),
        event('target', at(daysAgo), SOURCE, 'provider-b')
      ]),
      ...background(30)
    ]
    const candidates = buildRecommendationContextCandidates(events, context(), NOW)

    expect(candidates.map((candidate) => [candidate.sourceId, candidate.itemId]).sort()).toEqual([
      ['provider-a', 'target'],
      ['provider-b', 'target']
    ])
    expect(candidates.map((candidate) => candidate.evidence.sourceApp?.executeCount)).toEqual([
      3, 3
    ])
  })

  it('ignores invalid, future and expired events in both preference counts and denominators', () => {
    const clean = [...[2, 3, 4].map((daysAgo) => event('target', at(daysAgo))), ...background(10)]
    const invalid = [NaN, Infinity, -1, NOW + 1, NOW - 30 * DAY - 1].map((timestamp) =>
      event('target', timestamp)
    )

    expect(buildRecommendationContextCandidates([...clean, ...invalid], context(), NOW)).toEqual(
      buildRecommendationContextCandidates(clean, context(), NOW)
    )
    expect(buildRecommendationContextCandidates(clean, context(), NaN)).toEqual([])
  })
})

describe('buildRecommendationContextCandidates joint app/time evidence', () => {
  it('does not join an app association at night to executions from another app in the morning', () => {
    const events = [
      ...[2, 3, 4].flatMap((daysAgo) => [
        event('target', at(daysAgo, 18)),
        event('target', at(daysAgo, 18, 45)),
        event('target', at(daysAgo), 'com.example.browser'),
        event('target', at(daysAgo), 'com.example.browser')
      ]),
      ...background(30)
    ]
    const candidate = target(events)

    expect(candidate?.evidence.sourceApp).toMatchObject({ executeCount: 6, activeDays: 3 })
    expect(candidate?.evidence.sourceApp).not.toHaveProperty('timeWindow')
  })

  it.each([
    { name: 'four joint executions on three days', days: [2, 3, 4, 4], accepted: false },
    { name: 'five joint executions on two days', days: [2, 2, 3, 3, 3], accepted: false },
    { name: 'five joint executions on three days', days: [2, 2, 3, 3, 4], accepted: true }
  ])('only claims a proven joint habit: $name', ({ days, accepted }) => {
    const candidate = target([
      ...days.map((daysAgo) => event('target', at(daysAgo))),
      ...background(30)
    ])

    expect(candidate?.source).toBe('app-context')
    if (accepted) {
      expect(candidate?.evidence.sourceApp?.timeWindow).toEqual({
        startHour: 8,
        endHour: 10,
        executeCount: 5,
        activeDays: 3
      })
    } else {
      expect(candidate?.evidence.sourceApp).not.toHaveProperty('timeWindow')
    }
  })

  it('time opt-out retains app preference but removes yesterday and joint time claims', () => {
    const events = [
      ...[1, 2, 2, 3, 3, 4].map((daysAgo) => event('target', at(daysAgo))),
      ...background(30)
    ]
    const candidate = target(events, context(NOW, { timeAvailable: false }))

    expect(candidate?.source).toBe('app-context')
    expect(candidate?.evidence.sourceApp).toMatchObject({ executeCount: 6, activeDays: 4 })
    expect(candidate?.evidence).not.toHaveProperty('yesterday')
    expect(candidate?.evidence.sourceApp).not.toHaveProperty('timeWindow')
    expect(
      target([event('target', at(1), null)], context(NOW, { timeAvailable: false }))
    ).toBeUndefined()
  })
})

describe('buildRecommendationContextCandidates yesterday recall', () => {
  it.each([
    { name: 'one hour before', offset: -HOUR, accepted: true },
    { name: 'one hour after', offset: HOUR, accepted: true },
    { name: 'one millisecond too early', offset: -HOUR - 1, accepted: false },
    { name: 'one millisecond too late', offset: HOUR + 1, accepted: false }
  ])('uses an inclusive local clock window: $name', ({ offset, accepted }) => {
    const timestamp = at(1) + offset
    const candidate = target([event('target', timestamp, null)])

    if (accepted) {
      expect(candidate).toMatchObject({
        source: 'yesterday',
        evidence: { yesterday: { lastExecutedAt: timestamp, executeCount: 1 } }
      })
      expect(candidate?.score).toBeGreaterThan(0)
      expect(candidate?.score).toBeLessThanOrEqual(5)
    } else {
      expect(candidate).toBeUndefined()
    }
  })

  it.each([
    {
      name: 'midnight clips the lower edge',
      hour: 0,
      minute: 15,
      outsideDay: 2,
      outsideHour: 23,
      outsideMinute: 45
    },
    {
      name: 'late night clips the upper edge',
      hour: 23,
      minute: 45,
      outsideDay: 0,
      outsideHour: 0,
      outsideMinute: 15
    }
  ])('$name rather than treating yesterday as a rolling age', (row) => {
    const now = new Date(2026, 9, 6, row.hour, row.minute).getTime()
    const events = [
      event('target', at(1, row.hour, row.minute, now), null),
      event('wrong-date', at(row.outsideDay, row.outsideHour, row.outsideMinute, now), null)
    ]
    const candidates = buildRecommendationContextCandidates(events, context(now), now)

    expect(candidates.map((candidate) => candidate.itemId)).toEqual(['target'])
    expect(candidates[0]?.evidence.yesterday?.executeCount).toBe(1)
  })

  it.each([
    { name: 'spring forward', month: 2, day: 8, previousHour: 10 },
    { name: 'fall back', month: 10, day: 1, previousHour: 8 }
  ])('keeps yesterday clock boundaries across $name rather than subtracting 24 hours', (row) => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      const now = new Date(2026, row.month, row.day, 9, 30).getTime()
      const timestamp = at(1, row.previousHour, 30, now)
      const candidate = target([event('target', timestamp, null)], context(now), now)

      expect(candidate?.source).toBe('yesterday')
      expect(candidate?.evidence.yesterday).toEqual({ lastExecutedAt: timestamp, executeCount: 1 })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps the most recent matching execution and does not add yesterday to the app budget twice', () => {
    const events = [
      event('target', at(1, 9, 15)),
      event('target', at(1, 9, 45)),
      ...[2, 2, 3, 3, 4, 4, 5, 5].map((daysAgo) => event('target', at(daysAgo))),
      ...background(90)
    ]
    const combined = target(events)
    const appOnly = target(events, context(NOW, { timeAvailable: false }))
    const yesterdayOnly = target(events, context(NOW, { foregroundApp: undefined }))

    expect(combined?.evidence.yesterday).toEqual({
      lastExecutedAt: at(1, 9, 45),
      executeCount: 2
    })
    expect(combined?.evidence.sourceApp?.executeCount).toBe(10)
    expect(combined?.score).toBe(Math.max(appOnly!.score, yesterdayOnly!.score))
    expect(buildRecommendationContextCandidates(events, context(), NOW)).toHaveLength(1)
  })
})

describe('context recommendation contribution bounds', () => {
  it('keeps a dense yesterday session inside its small budget without inventing an app habit', () => {
    const candidate = target(Array.from({ length: 50 }, () => event('target', at(1), null)))

    expect(candidate?.source).toBe('yesterday')
    expect(candidate?.evidence.yesterday?.executeCount).toBe(50)
    expect(candidate?.evidence).not.toHaveProperty('sourceApp')
    expect(candidate?.score).toBeGreaterThan(0)
    expect(candidate?.score).toBeLessThanOrEqual(5)
  })
})
