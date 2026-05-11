import type { ContextSignal } from './context-provider'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => ({
      isRegistered: vi.fn(() => false),
      unregister: vi.fn(),
      register: vi.fn(),
      start: vi.fn()
    })
  }
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: vi.fn(() => false),
    waitForIdle: vi.fn(async () => undefined)
  }
}))

vi.mock('../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn(async (_label: string, task: () => unknown) => task())
  }
}))

vi.mock('../../../../db/sqlite-retry', () => ({
  withSqliteRetry: vi.fn((task: () => unknown) => task())
}))

vi.mock('../../../sentry', () => ({
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    queueNexusTelemetry: vi.fn()
  })
}))

vi.mock('../../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('./item-rebuilder', () => ({
  ItemRebuilder: class {
    async rebuildItems(items: Array<{ itemId: string; sourceId: string; source: string }>) {
      return items.map((item) => ({
        id: item.itemId,
        source: { id: item.sourceId, type: 'app', name: item.sourceId },
        kind: 'app',
        render: { mode: 'default', basic: { title: item.itemId } },
        meta: { recommendation: { source: item.source } }
      }))
    }
  }
}))

import {
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  RecommendationEngine
} from './recommendation-engine'

const morningContext: ContextSignal = {
  time: {
    hourOfDay: 9,
    dayOfWeek: 1,
    isWorkingHours: true,
    timeSlot: 'morning'
  }
}

const afternoonContext: ContextSignal = {
  time: {
    hourOfDay: 15,
    dayOfWeek: 1,
    isWorkingHours: true,
    timeSlot: 'afternoon'
  }
}

function createDbUtils() {
  return {
    getAuxDb: vi.fn(() => ({
      insert: vi.fn(() => ({
        values: vi.fn()
      }))
    })),
    getDb: vi.fn(() => ({})),
    getRecommendationCache: vi.fn(async () => null),
    setRecommendationCache: vi.fn(async () => undefined)
  }
}

function createUsageStats(
  itemId: string,
  overrides: Partial<{
    searchCount: number
    executeCount: number
    cancelCount: number
    lastSearched: Date | null
    lastExecuted: Date | null
    lastCancelled: Date | null
  }> = {}
) {
  return {
    sourceId: 'app-provider',
    itemId,
    sourceType: 'app',
    searchCount: overrides.searchCount ?? 0,
    executeCount: overrides.executeCount ?? 1,
    cancelCount: overrides.cancelCount ?? 0,
    lastSearched: overrides.lastSearched ?? null,
    lastExecuted: overrides.lastExecuted ?? new Date('2026-05-04T09:00:00.000Z'),
    lastCancelled: overrides.lastCancelled ?? null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-04T09:00:00.000Z')
  }
}

function createTimeStats({
  itemId,
  morning = 0,
  afternoon = 0,
  monday = 0,
  tuesday = 0
}: {
  itemId: string
  morning?: number
  afternoon?: number
  monday?: number
  tuesday?: number
}) {
  return {
    sourceId: 'app-provider',
    itemId,
    hourDistribution: Array.from({ length: 24 }, () => 0),
    dayOfWeekDistribution: [0, monday, tuesday, 0, 0, 0, 0],
    timeSlotDistribution: {
      morning,
      afternoon,
      evening: 0,
      night: 0
    },
    lastUpdated: new Date('2026-05-04T09:00:00.000Z')
  }
}

function candidatePerf(totalCandidates: number, filteredCount = totalCandidates) {
  return {
    totalCandidates,
    filteredCount,
    trendingDurationMs: 0,
    trendingRows: 0,
    trendingCandidates: 0,
    trendingReady: true
  }
}

describe('RecommendationEngine', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not reuse memory cache when the time context changes', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const contexts = [morningContext, afternoonContext]
    const getCandidates = vi.fn(async (context: ContextSignal) => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: `${context.time.timeSlot}-app`,
          sourceType: 'app',
          source: 'time-based',
          usageStats: {
            sourceId: 'app-provider',
            itemId: `${context.time.timeSlot}-app`,
            sourceType: 'app',
            searchCount: 0,
            executeCount: 1,
            cancelCount: 0,
            lastSearched: null,
            lastExecuted: new Date(),
            lastCancelled: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ],
      perf: {
        totalCandidates: 1,
        filteredCount: 1,
        trendingDurationMs: 0,
        trendingRows: 0,
        trendingCandidates: 0,
        trendingReady: true
      }
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => contexts.shift() ?? afternoonContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates
    })

    const first = await engine.recommend({ limit: 1 })
    const second = await engine.recommend({ limit: 1 })

    expect(first.items[0]?.id).toBe('morning-app')
    expect(second.items[0]?.id).toBe('afternoon-app')
    expect(getCandidates).toHaveBeenCalledTimes(2)
  })

  it('boosts candidates that match the current time slot and weekday', () => {
    const matchingStats = createTimeStats({
      itemId: 'morning-app',
      morning: 6,
      afternoon: 4,
      monday: 5
    })
    const baselineStats = createTimeStats({
      itemId: 'plain-app',
      morning: 6,
      afternoon: 4
    })

    expect(calculateTimeContextBoost(matchingStats, morningContext.time)).toBeGreaterThan(
      calculateTimeContextBoost(baselineStats, morningContext.time)
    )
    expect(calculateTimeRelevanceScore(matchingStats, morningContext.time)).toBeGreaterThan(
      calculateTimeRelevanceScore(baselineStats, morningContext.time)
    )
  })

  it('keeps time stats when duplicate frequent candidates are also time-based', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const morningStats = createTimeStats({
      itemId: 'morning-app',
      morning: 8,
      afternoon: 2,
      monday: 8
    })

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'plain-app',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('plain-app', { executeCount: 100 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'morning-app',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('morning-app', { executeCount: 1 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'morning-app',
            sourceType: 'app',
            source: 'time-based',
            usageStats: createUsageStats('morning-app', { executeCount: 1 }),
            timeStats: morningStats
          }
        ],
        perf: candidatePerf(3, 2)
      }))
    })

    const result = await engine.recommend({ limit: 5 })

    expect(result.items.map((item) => item.id).slice(0, 2)).toEqual(['morning-app', 'plain-app'])
  })

  it('ranks different apps first when the active time slot changes', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const contexts = [morningContext, afternoonContext]
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'morning-app',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('morning-app', { executeCount: 4 }),
          timeStats: createTimeStats({
            itemId: 'morning-app',
            morning: 12,
            afternoon: 1,
            monday: 8
          })
        },
        {
          sourceId: 'app-provider',
          itemId: 'afternoon-app',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('afternoon-app', { executeCount: 4 }),
          timeStats: createTimeStats({
            itemId: 'afternoon-app',
            morning: 1,
            afternoon: 12,
            monday: 8
          })
        }
      ],
      perf: candidatePerf(2, 2)
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => contexts.shift() ?? afternoonContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates
    })

    const morning = await engine.recommend({ limit: 2 })
    const afternoon = await engine.recommend({ limit: 2 })

    expect(morning.items[0]?.id).toBe('morning-app')
    expect(afternoon.items[0]?.id).toBe('afternoon-app')
    expect(getCandidates).toHaveBeenCalledTimes(2)
  })
})
