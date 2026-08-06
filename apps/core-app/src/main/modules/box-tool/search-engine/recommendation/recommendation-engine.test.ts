import { ContextProvider, type ContextSignal } from './context-provider'
import { afterEach, describe, expect, it, vi } from 'vitest'

const intelligenceSdkMock = vi.hoisted(() => ({
  embeddingGenerate: vi.fn(),
  ragRerank: vi.fn()
}))

const exposureServiceMock = vi.hoisted(() => ({
  setTaggedKeys: vi.fn(),
  recordExposure: vi.fn(),
  recordClick: vi.fn(),
  getHitRate: vi.fn(async () => [])
}))

vi.mock('./recommendation-exposure-service', () => ({
  recommendationExposureService: exposureServiceMock
}))

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

vi.mock('../../../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    embedding: {
      generate: intelligenceSdkMock.embeddingGenerate
    },
    rag: {
      rerank: intelligenceSdkMock.ragRerank
    }
  }
}))

vi.mock('./item-rebuilder', () => ({
  ItemRebuilder: class {
    // Mirrors the real rebuilder's contract: input (scored) order out, with the
    // score published on scoring.final.
    async rebuildItems(
      items: Array<{ itemId: string; sourceId: string; source: string; score: number }>
    ) {
      return items.map((item) => ({
        id: item.itemId,
        source: { id: item.sourceId, type: 'app', name: item.sourceId },
        kind: 'app',
        render: { mode: 'default', basic: { title: item.itemId } },
        scoring: { final: item.score },
        meta: { recommendation: { source: item.source, score: item.score } }
      }))
    }
  }
}))

import {
  calculateNoveltyFactor,
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  RecommendationEngine
} from './recommendation-engine'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

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

const devFocusCodeContext: ContextSignal = {
  ...morningContext,
  clipboard: {
    type: 'files',
    content: 'hash_only',
    timestamp: new Date('2026-05-04T09:00:00.000Z').getTime(),
    contentType: 'file',
    meta: {
      fileType: 'code',
      language: 'typescript'
    }
  },
  foregroundApp: {
    bundleId: 'dev.workspace.editor',
    name: 'Visual Studio Code'
  },
  systemState: {
    isOnline: true,
    networkType: 'wifi',
    networkIdHash: 'net_focus',
    batteryLevel: 80,
    isCharging: true,
    isOnBattery: false,
    powerMode: 'charging',
    isDNDEnabled: true,
    focusMode: 'active',
    locationBucket: 'loc_work',
    timezone: 'Asia/Shanghai',
    unavailableSignals: []
  }
}

type RecommendationCacheRecord = {
  cacheKey: string
  recommendedItems: string
  createdAt: Date
  expiresAt: Date
}

function createDbUtils() {
  return {
    getAuxDb: vi.fn(() => ({
      insert: vi.fn(() => ({
        values: vi.fn()
      }))
    })),
    getDb: vi.fn(() => ({})),
    getRecommendationCache: vi.fn(
      async (_cacheKey: string): Promise<RecommendationCacheRecord | null> => null
    ),
    setRecommendationCache: vi.fn(async () => undefined),
    getUsageStatsBatch: vi.fn(
      async (_keys: Array<{ sourceId: string; itemId: string }>) =>
        [] as ReturnType<typeof createUsageStats>[]
    )
  }
}

/** A `files` row as the app catalog stores it, with `ctime` = first indexed. */
function createCatalogApp(path: string, indexedAgoMs: number, id: number) {
  return {
    id,
    path,
    name: path.split('/').pop(),
    displayName: path.split('/').pop(),
    ctime: new Date(Date.now() - indexedAgoMs),
    mtime: new Date(Date.now() - indexedAgoMs)
  }
}

/**
 * App-catalog handle: `getFilesByType` plus the `installedAt` extension rows,
 * which is the whole contract the freshness gate reads (the app provider owns
 * the write side).
 */
function createCatalogDbUtils(
  apps: ReturnType<typeof createCatalogApp>[],
  installedAgoMsByFileId: Record<number, number>
) {
  return {
    ...createDbUtils(),
    getFilesByType: vi.fn(async () => apps),
    getFileExtensionsByFileIds: vi.fn(async (fileIds: number[], _keys?: string[]) =>
      fileIds.flatMap((fileId) => {
        const installedAgoMs = installedAgoMsByFileId[fileId]
        if (installedAgoMs === undefined) return []
        return [{ fileId, key: 'installedAt', value: String(Date.now() - installedAgoMs) }]
      })
    )
  }
}

/** Wires an engine so only the freshness dimension produces candidates. */
function stubDimensions(
  engine: RecommendationEngine,
  overrides: Record<string, unknown> = {}
): void {
  Object.assign(engine as unknown as Record<string, unknown>, {
    contextProvider: {
      getCurrentContext: vi.fn(async () => morningContext),
      generateCacheKey: () => 'freshness-key'
    },
    scheduleTrendBackfill: vi.fn(),
    getPinnedItems: vi.fn(async () => []),
    getFrequentItems: vi.fn(async () => []),
    getRecentItems: vi.fn(async () => []),
    getTimeBasedTopItems: vi.fn(async () => []),
    getTrendingItems: vi.fn(async () => ({
      items: [],
      perf: { durationMs: 0, rowCount: 0, ready: true }
    })),
    getPluginCandidates: vi.fn(async () => []),
    ...overrides
  })
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
    vi.useRealTimers()
  })

  it('includes time slot and day type in the production recommendation cache key', () => {
    const provider = new ContextProvider()
    const tuesdayMorningContext: ContextSignal = {
      ...morningContext,
      time: {
        ...morningContext.time,
        dayOfWeek: 2
      }
    }
    const sundayMorningContext: ContextSignal = {
      ...morningContext,
      time: {
        ...morningContext.time,
        dayOfWeek: 0
      }
    }

    expect(provider.generateCacheKey(morningContext)).toBe('morning|workday')
    expect(provider.generateCacheKey(afternoonContext)).toBe('afternoon|workday')
    expect(provider.generateCacheKey(tuesdayMorningContext)).toBe('morning|workday')
    expect(provider.generateCacheKey(sundayMorningContext)).toBe('morning|weekend')
  })

  it('keeps volatile system state out of the recommendation cache key', () => {
    const provider = new ContextProvider()
    const context: ContextSignal = {
      ...morningContext,
      systemState: {
        isOnline: true,
        networkType: 'wifi',
        networkIdHash: 'net_9f02',
        batteryLevel: 83,
        isCharging: false,
        isOnBattery: true,
        powerMode: 'battery',
        isDNDEnabled: true,
        focusMode: 'active',
        locationBucket: 'loc_12ab',
        timezone: 'Asia/Shanghai',
        unavailableSignals: []
      }
    }

    const key = provider.generateCacheKey(context)

    expect(key).toBe('morning|workday|net:1')
    expect(key).not.toContain('nid:')
    expect(key).not.toContain('bat:')
    expect(key).not.toContain('pow:')
    expect(key).not.toContain('dnd:')
    expect(key).not.toContain('loc:')
    expect(key).not.toContain('Asia/Shanghai')
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

  it('does not reuse persisted recommendation cache across time slots', async () => {
    const dbUtils = createDbUtils()
    dbUtils.getRecommendationCache.mockImplementation(async (cacheKey: string) => {
      if (cacheKey !== 'morning|1|pin:none') return null

      return {
        cacheKey,
        recommendedItems: JSON.stringify([
          {
            id: 'cached-morning-app',
            source: { id: 'app-provider', type: 'app', name: 'app-provider' },
            kind: 'app',
            render: { mode: 'default', basic: { title: 'cached-morning-app' } },
            meta: { recommendation: { source: 'frequent' } }
          }
        ]),
        createdAt: new Date('2026-05-04T09:00:00.000Z'),
        expiresAt: new Date(Date.now() + 60_000)
      }
    })

    const engine = new RecommendationEngine(dbUtils as never)
    const contexts = [morningContext, afternoonContext]
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'fresh-afternoon-app',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('fresh-afternoon-app', { executeCount: 2 })
        }
      ],
      perf: candidatePerf(1)
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => contexts.shift() ?? afternoonContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates
    })

    const morning = await engine.recommend({ limit: 1 })
    const afternoon = await engine.recommend({ limit: 1 })

    expect(morning.items[0]?.id).toBe('cached-morning-app')
    expect(afternoon.items[0]?.id).toBe('fresh-afternoon-app')
    expect(dbUtils.getRecommendationCache).toHaveBeenNthCalledWith(1, 'morning|1|pin:none')
    expect(dbUtils.getRecommendationCache).toHaveBeenNthCalledWith(2, 'afternoon|1|pin:none')
    expect(getCandidates).toHaveBeenCalledTimes(1)
  })

  it('keeps pinned items visible when recommendations already fill the limit', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      sourceId: `source-${index}`,
      itemId: `recommended-${index}`,
      sourceType: `type-${index}`,
      source: 'frequent' as const,
      usageStats: createUsageStats(`recommended-${index}`, { executeCount: 10 - index })
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => [
        {
          sourceId: 'pinned-source',
          itemId: 'pinned-app',
          sourceType: 'app',
          usageStats: createUsageStats('pinned-app')
        }
      ]),
      getCandidates: vi.fn(async () => ({
        items: candidates,
        perf: candidatePerf(candidates.length)
      }))
    })

    const result = await engine.recommend({ limit: 10 })
    const ids = result.items.map((item) => item.id)

    expect(ids).toContain('pinned-app')
    expect(ids).toHaveLength(10)
    expect(ids.at(-1)).toBe('pinned-app')
    expect(result.containerLayout?.sections?.at(-1)).toMatchObject({
      id: 'pinned',
      itemIds: ['pinned-app']
    })
  })

  it('drops the lowest-scored recommendation, not the highest, when pinned items take a slot', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const candidates = [
      {
        sourceId: 'clipboard-history',
        itemId: 'low-scored',
        sourceType: 'history',
        source: 'frequent' as const,
        usageStats: createUsageStats('low-scored', { executeCount: 1 })
      },
      {
        sourceId: 'app-provider',
        itemId: 'high-scored',
        sourceType: 'app',
        source: 'frequent' as const,
        usageStats: createUsageStats('high-scored', { executeCount: 50 })
      }
    ]

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}|pinned-truncation`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => [
        {
          sourceId: 'pinned-source',
          itemId: 'pinned-app',
          sourceType: 'pinned',
          usageStats: createUsageStats('pinned-app')
        }
      ]),
      getCandidates: vi.fn(async () => ({
        items: candidates,
        perf: candidatePerf(candidates.length)
      })),
      // A rebuild that hands back a different order than it was given (the
      // per-source fan-out did exactly this): the truncation must still be
      // decided by score.
      itemRebuilder: {
        rebuildItems: async (
          items: Array<{ itemId: string; sourceId: string; source: string; score: number }>
        ) =>
          [...items].reverse().map((item) => ({
            id: item.itemId,
            source: { id: item.sourceId, type: 'app', name: item.sourceId },
            kind: 'app',
            render: { mode: 'default', basic: { title: item.itemId } },
            scoring: { final: item.score },
            meta: { recommendation: { source: item.source, score: item.score } }
          }))
      }
    })

    const result = await engine.recommend({ limit: 2 })

    expect(result.items.map((item) => item.id)).toEqual(['high-scored', 'pinned-app'])
  })

  it('separates persisted recommendation cache by pinned items', async () => {
    const dbUtils = createDbUtils()
    dbUtils.getRecommendationCache.mockImplementation(async (cacheKey: string) => {
      if (cacheKey.endsWith('pin:none')) return null

      return {
        cacheKey,
        recommendedItems: JSON.stringify([
          {
            id: 'cached-pinned-app',
            source: { id: 'pinned-source', type: 'app', name: 'pinned-source' },
            kind: 'app',
            render: { mode: 'default', basic: { title: 'cached-pinned-app' } },
            meta: {
              pinned: { isPinned: true },
              recommendation: { source: 'pinned' }
            }
          }
        ]),
        createdAt: new Date('2026-05-04T09:00:00.000Z'),
        expiresAt: new Date(Date.now() + 60_000)
      }
    })

    const engine = new RecommendationEngine(dbUtils as never)
    const pinnedSets = [
      [
        {
          sourceId: 'pinned-source',
          itemId: 'cached-pinned-app',
          sourceType: 'app',
          usageStats: createUsageStats('cached-pinned-app')
        }
      ],
      []
    ]
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'fresh-app',
          sourceType: 'app',
          source: 'frequent' as const,
          usageStats: createUsageStats('fresh-app', { executeCount: 2 })
        }
      ],
      perf: candidatePerf(1)
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => pinnedSets.shift() ?? []),
      getCandidates
    })

    const cached = await engine.recommend({ limit: 1 })
    const fresh = await engine.recommend({ limit: 1 })

    expect(cached.items[0]?.id).toBe('cached-pinned-app')
    expect(fresh.items[0]?.id).toBe('fresh-app')
    expect(dbUtils.getRecommendationCache.mock.calls[0]?.[0]).toContain('pin:')
    expect(dbUtils.getRecommendationCache.mock.calls[1]?.[0]).toBe('morning|1|pin:none')
    expect(getCandidates).toHaveBeenCalledTimes(1)
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

  it('keeps time-slot relevance even when the current weekday has no history yet', () => {
    const slotOnlyStats = createTimeStats({
      itemId: 'weekday-missing-app',
      morning: 8,
      afternoon: 2,
      monday: 0,
      tuesday: 10
    })

    expect(calculateTimeRelevanceScore(slotOnlyStats, morningContext.time)).toBeGreaterThan(0)
  })

  it('uses focus system state to prefer work apps over social apps', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const focusContext: ContextSignal = {
      ...morningContext,
      systemState: {
        isOnline: true,
        networkType: 'wifi',
        networkIdHash: 'net_focus',
        batteryLevel: 70,
        isCharging: true,
        isOnBattery: false,
        powerMode: 'charging',
        isDNDEnabled: true,
        focusMode: 'active',
        locationBucket: 'loc_focus',
        timezone: 'Asia/Shanghai',
        unavailableSignals: []
      }
    }

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => focusContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:focus`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 10 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 10 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 2 })
    const ids = result.items.map((item) => item.id)
    const socialRank = ids.indexOf('discord')

    expect(ids[0]).toBe('com.apple.Terminal')
    expect(socialRank === -1 || socialRank > 0).toBe(true)
  })

  it('uses local semantic scoring to prefer developer tools in a focused code context', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:semantic-on`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: true,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 5 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 5 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.microsoft.VSCode',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.microsoft.VSCode', { executeCount: 5 })
          }
        ],
        perf: candidatePerf(3, 3)
      }))
    })

    const result = await engine.recommend({ limit: 10 })
    const ids = result.items.map((item) => item.id)

    expect(ids.indexOf('com.apple.Terminal')).toBeLessThan(ids.indexOf('discord'))
    expect(ids.indexOf('com.microsoft.VSCode')).toBeLessThan(ids.indexOf('discord'))
  })

  it('falls back to frequency ranking when local semantic scoring is disabled', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:semantic-off`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: false,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.microsoft.VSCode',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.microsoft.VSCode', { executeCount: 1 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 5 })
          }
        ],
        perf: candidatePerf(3, 3)
      }))
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items[0]?.id).toBe('discord')
  })

  it('uses historical local preference vectors to lift semantically related tools', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:preference-vector`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: true,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'com.microsoft.VSCode',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.microsoft.VSCode', { executeCount: 40 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(3, 3)
      }))
    })

    const result = await engine.recommend({ limit: 10 })
    const ids = result.items.map((item) => item.id)

    expect(ids.indexOf('com.apple.Terminal')).toBeLessThan(ids.indexOf('discord'))
  })

  it('uses historical cancellation vectors to suppress semantically avoided tools', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:avoidance-vector`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: true,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', {
              executeCount: 0,
              cancelCount: 20,
              lastExecuted: null,
              lastCancelled: new Date('2026-05-04T08:55:00.000Z')
            })
          },
          {
            sourceId: 'app-provider',
            itemId: 'telegram',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('telegram', { executeCount: 4 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 2 })
          }
        ],
        perf: candidatePerf(3, 3)
      }))
    })

    const result = await engine.recommend({ limit: 10 })
    const ids = result.items.map((item) => item.id)

    expect(ids.indexOf('com.apple.Terminal')).toBeLessThan(ids.indexOf('telegram'))
  })

  it('uses optional AI embedding scores to improve semantic ranking', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
    intelligenceSdkMock.embeddingGenerate.mockImplementation(async ({ text }: { text: string }) => {
      const normalizedText = text.toLowerCase()
      if (normalizedText.includes('typescript') || normalizedText.includes('visual studio code')) {
        return { result: [1, 0] }
      }
      if (normalizedText.includes('terminal')) {
        return { result: [0.96, 0.28] }
      }
      return { result: [0, 1] }
    })

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:ai-embedding`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: false,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: true
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 8 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toEqual(['com.apple.Terminal', 'discord'])
    expect(intelligenceSdkMock.embeddingGenerate).toHaveBeenCalledTimes(3)
  })

  it('keeps local ranking when optional AI embedding scoring fails', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
    intelligenceSdkMock.embeddingGenerate.mockRejectedValue(new Error('embedding unavailable'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:ai-embedding-fail`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: false,
        aiRerankEnabled: false,
        aiEmbeddingEnabled: true
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 8 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toEqual(['discord', 'com.apple.Terminal'])
    expect(intelligenceSdkMock.embeddingGenerate).toHaveBeenCalledTimes(1)
  })

  it('uses optional AI rerank scores to improve semantic ranking', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
    intelligenceSdkMock.ragRerank.mockResolvedValue({
      result: {
        results: [
          {
            id: 'app-provider:com.apple.Terminal',
            content: 'terminal developer shell',
            score: 1,
            originalRank: 1
          },
          {
            id: 'app-provider:discord',
            content: 'chat social community',
            score: 0,
            originalRank: 0
          }
        ]
      }
    })

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:ai-rerank`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: false,
        aiRerankEnabled: true,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 8 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toEqual(['com.apple.Terminal', 'discord'])
    expect(intelligenceSdkMock.ragRerank).toHaveBeenCalledTimes(1)
    expect(intelligenceSdkMock.ragRerank.mock.calls[0]?.[0]).toMatchObject({
      topK: 2,
      documents: [{ id: 'app-provider:discord' }, { id: 'app-provider:com.apple.Terminal' }]
    })
  })

  it('keeps local ranking when optional AI rerank fails', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
    intelligenceSdkMock.ragRerank.mockRejectedValue(new Error('rerank unavailable'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:ai-rerank-fail`
      },
      getRecommendationSemanticSettings: vi.fn(async () => ({
        localVectorEnabled: false,
        aiRerankEnabled: true,
        aiEmbeddingEnabled: false
      })),
      calculateContextMatch: vi.fn(() => 0),
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 8 })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toEqual(['discord', 'com.apple.Terminal'])
    expect(intelligenceSdkMock.ragRerank).toHaveBeenCalledTimes(1)
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
    expect(result.items[0]?.meta?.recommendation).toMatchObject({ source: 'time-based' })
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

  it('serves a cache hit when only volatile context changed, and re-ranks for it', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const perfEvents: Array<{ eventType: string; metadata: Record<string, unknown> }> = []
    // Same slow-moving context, different foreground app: the 15-min warm-up
    // and the user's own request must land on the same cache entry.
    const contexts: ContextSignal[] = [
      morningContext,
      {
        ...morningContext,
        foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
      }
    ]
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'com.apple.Terminal',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('com.apple.Terminal', { executeCount: 3 })
        },
        {
          sourceId: 'app-provider',
          itemId: 'com.apple.Preview',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('com.apple.Preview', { executeCount: 4 })
        }
      ],
      perf: candidatePerf(2, 2)
    }))

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => contexts.shift() ?? morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates,
      recordRecommendationPerf: (eventType: string, metadata: Record<string, unknown>) => {
        perfEvents.push({ eventType, metadata })
      }
    })

    const warmup = await engine.recommend({ limit: 5, forceRefresh: true })
    const userRequest = await engine.recommend({ limit: 5 })

    expect(warmup.items[0]?.id).toBe('com.apple.Preview')
    expect(userRequest.fromCache).toBe(true)
    expect(getCandidates).toHaveBeenCalledTimes(1)
    expect(perfEvents.at(-1)?.metadata.cacheLayer).toBe('memory')
    // Foreground = an IDE lifts the terminal past the more frequent app.
    expect(userRequest.items[0]?.id).toBe('com.apple.Terminal')
  })

  it('keeps re-ranking idempotent across repeated cache hits', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))

    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const ideContext: ContextSignal = {
      ...morningContext,
      foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
    }

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => ideContext),
        generateCacheKey: () => 'stable-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            itemId: 'com.apple.Terminal',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 3 })
          }
        ],
        perf: candidatePerf(1, 1)
      }))
    })

    const first = await engine.recommend({ limit: 5 })
    const second = await engine.recommend({ limit: 5 })
    const third = await engine.recommend({ limit: 5 })

    expect(second.items[0]?.scoring?.final).toBe(first.items[0]?.scoring?.final)
    expect(third.items[0]?.scoring?.final).toBe(first.items[0]?.scoring?.final)
  })

  it('never serves a clipboard URL action from the cache after the clipboard changed', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const clipboardContext = (marker: string): ContextSignal => ({
      ...morningContext,
      clipboard: {
        type: 'text',
        content: marker,
        timestamp: Date.now(),
        contentType: 'url',
        meta: { isUrl: true }
      }
    })
    const contexts = [clipboardContext('first-url'), clipboardContext('second-url')]

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => contexts.shift() ?? clipboardContext('second-url')),
        generateCacheKey: () => 'stable-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      // The real getCandidates runs here on purpose: the regression was that it
      // injected the clipboard URL action into the pool that gets cached.
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: 'com.apple.Terminal',
          sourceType: 'app',
          usageStats: createUsageStats('com.apple.Terminal', { executeCount: 3 })
        }
      ]),
      getRecentItems: vi.fn(async () => []),
      getTimeBasedTopItems: vi.fn(async () => []),
      getTrendingItems: vi.fn(async () => ({
        items: [],
        perf: { durationMs: 0, rowCount: 0, ready: true }
      })),
      getPluginCandidates: vi.fn(async () => [])
    })

    await engine.recommend({ limit: 5 })
    const cached = await engine.recommend({ limit: 5 })

    expect(cached.fromCache).toBe(true)
    const urlActions = cached.items.filter((item) => item.id.startsWith('clipboard-url-open:'))
    expect(urlActions.map((item) => item.id)).toEqual(['clipboard-url-open:second-url'])
  })

  it('recommends catalog apps on a cold start with no usage history', async () => {
    const dbUtils = createDbUtils()
    const catalogApps = [
      {
        id: 1,
        path: '/Applications/Old.app',
        name: 'Old',
        displayName: 'Old',
        ctime: new Date('2026-01-01T00:00:00.000Z'),
        mtime: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        id: 2,
        path: '/Applications/New.app',
        name: 'New',
        displayName: 'New',
        ctime: new Date('2026-05-01T00:00:00.000Z'),
        mtime: new Date('2026-05-01T00:00:00.000Z')
      }
    ]
    const getFilesByType = vi.fn(async () => catalogApps)
    const engine = new RecommendationEngine(
      dbUtils as never,
      { ...dbUtils, getFilesByType } as never
    )

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: () => 'cold-start-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      // Fresh install: no usage rows anywhere.
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(0, 0) })),
      getFrequentItems: vi.fn(async () => [])
    })

    const result = await engine.recommend({ limit: 5 })

    expect(getFilesByType).toHaveBeenCalledWith('app')
    expect(result.items.map((item) => item.id)).toEqual([
      '/Applications/New.app',
      '/Applications/Old.app'
    ])
    expect(result.items[0]?.meta?.recommendation).toMatchObject({ source: 'cold-start' })
  })

  it('orders the cold-start catalog by install stamp rather than index time', async () => {
    const dbUtils = createDbUtils()
    // Everything entered the index in the same first-scan batch, so ctime alone
    // cannot separate these two — the install stamps are the only real signal,
    // and they run opposite to the ctime tiebreak.
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/OldBundle.app', 30 * DAY_MS, 1),
        createCatalogApp('/Applications/NewBundle.app', 30 * DAY_MS + 1, 2)
      ],
      { 1: 400 * DAY_MS, 2: 20 * DAY_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(0, 0) }))
    })

    const result = await engine.recommend({ limit: 5 })

    expect(result.items.map((item) => item.id)).toEqual([
      '/Applications/NewBundle.app',
      '/Applications/OldBundle.app'
    ])
    expect(result.items[0]?.meta?.recommendation).toMatchObject({ source: 'cold-start' })
  })

  it('prefers real usage over the cold-start catalog', async () => {
    const dbUtils = createDbUtils()
    const getFilesByType = vi.fn(async () => [
      { id: 1, path: '/Applications/Catalog.app', name: 'Catalog', ctime: null, mtime: null }
    ])
    const engine = new RecommendationEngine(
      dbUtils as never,
      { ...dbUtils, getFilesByType } as never
    )

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: () => 'fallback-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(0, 0) })),
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: 'used-app',
          sourceType: 'app',
          usageStats: createUsageStats('used-app', { executeCount: 9 })
        }
      ])
    })

    const result = await engine.recommend({ limit: 5 })

    expect(result.items.map((item) => item.id)).toEqual(['used-app'])
    expect(getFilesByType).not.toHaveBeenCalled()
  })

  it('matches path-form app ids against the foreground app', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => ({
          ...morningContext,
          foregroundApp: { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' }
        })),
        generateCacheKey: () => 'path-form-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({
        items: [
          {
            sourceId: 'app-provider',
            // Path-form id: what the app provider actually stores for scanned apps.
            itemId: '/Applications/Visual Studio Code.app',
            sourceType: 'application',
            source: 'frequent',
            usageStats: createUsageStats('/Applications/Visual Studio Code.app', {
              executeCount: 20
            })
          },
          {
            sourceId: 'app-provider',
            itemId: '/Applications/Terminal.app',
            sourceType: 'application',
            source: 'frequent',
            usageStats: createUsageStats('/Applications/Terminal.app', { executeCount: 1 })
          }
        ],
        perf: candidatePerf(2, 2)
      }))
    })

    const result = await engine.recommend({ limit: 5 })

    // The already-open app is demoted despite 20x the usage, and the terminal
    // is promoted because the foreground app is an IDE.
    expect(result.items[0]?.id).toBe('/Applications/Terminal.app')
  })

  it('ranks an app installed two hours ago above an established habit', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Fresh.app', 2 * HOUR_MS, 1)],
      { 1: 2 * HOUR_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Habit.app',
          sourceType: 'application',
          usageStats: createUsageStats('/Applications/Habit.app', {
            executeCount: 40,
            lastExecuted: new Date(Date.now() - HOUR_MS)
          })
        }
      ])
    })

    const result = await engine.recommend({ limit: 5 })

    expect(result.items.map((item) => item.id)).toEqual([
      '/Applications/Fresh.app',
      '/Applications/Habit.app'
    ])
    expect(result.items[0]?.meta?.recommendation).toMatchObject({ source: 'newly-installed' })
  })

  it('treats an app as new only when the install stamp and the index row are both fresh', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/Fresh.app', 2 * HOUR_MS, 1),
        // Self-update: the bundle was rewritten today, but we indexed it in March.
        createCatalogApp('/Applications/SelfUpdated.app', 60 * DAY_MS, 2),
        // First full scan on an old machine: new row, ancient bundle.
        createCatalogApp('/Applications/FirstScan.app', 2 * HOUR_MS, 3),
        // Indexed before the app provider started writing install stamps.
        createCatalogApp('/Applications/NoStamp.app', 2 * HOUR_MS, 4)
      ],
      { 1: 2 * HOUR_MS, 2: 3 * HOUR_MS, 3: 400 * DAY_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)
    stubDimensions(engine)

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toEqual(['/Applications/Fresh.app'])
  })

  it('fades novelty from full strength at 48h to nothing at 7 days', () => {
    expect(calculateNoveltyFactor(0)).toBe(1)
    expect(calculateNoveltyFactor(48 * HOUR_MS)).toBe(1)
    expect(calculateNoveltyFactor(7 * DAY_MS)).toBe(0)
    expect(calculateNoveltyFactor(8 * DAY_MS)).toBe(0)
    // Halfway across the 48h → 7d ramp.
    expect(calculateNoveltyFactor(48 * HOUR_MS + (5 * DAY_MS) / 2)).toBeCloseTo(0.5, 10)
    // Clock skew: a stamp from the future is as new as it gets, not negative.
    expect(calculateNoveltyFactor(-HOUR_MS)).toBe(1)
  })

  it('hands ranking back to frecency once the new app has been executed', async () => {
    const dbUtils = createDbUtils()
    dbUtils.getUsageStatsBatch = vi.fn(async () => [
      createUsageStats('/Applications/Fresh.app', {
        executeCount: 1,
        lastExecuted: new Date(Date.now() - 3 * HOUR_MS)
      })
    ])
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Fresh.app', 2 * HOUR_MS, 1)],
      { 1: 2 * HOUR_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Habit.app',
          sourceType: 'application',
          usageStats: createUsageStats('/Applications/Habit.app', {
            executeCount: 40,
            lastExecuted: new Date(Date.now() - HOUR_MS)
          })
        }
      ])
    })

    const result = await engine.recommend({ limit: 5 })

    // Boost gone, but the app is still a candidate — it just ranks on usage now.
    expect(result.items.map((item) => item.id)).toEqual([
      '/Applications/Habit.app',
      '/Applications/Fresh.app'
    ])
  })

  it('keeps the newly installed app in a grid the diversity filter trims', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Fresh.app', 2 * HOUR_MS, 1)],
      { 1: 2 * HOUR_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      // Same sourceType as the new app, so the per-type cap applies to all of them.
      getFrequentItems: vi.fn(async () =>
        Array.from({ length: 14 }, (_, index) => ({
          sourceId: 'app-provider',
          itemId: `/Applications/Habit${index}.app`,
          sourceType: 'application',
          usageStats: createUsageStats(`/Applications/Habit${index}.app`, {
            executeCount: 30 - index,
            lastExecuted: new Date(Date.now() - HOUR_MS)
          })
        }))
      )
    })

    const result = await engine.recommend({ limit: 10 })

    expect(result.items.map((item) => item.id)).toContain('/Applications/Fresh.app')
  })

  it('stops serving the persisted ranking after the cache is invalidated', async () => {
    const dbUtils = createDbUtils()
    const staleItem = {
      id: '/Applications/Stale.app',
      source: { id: 'app-provider', type: 'app', name: 'app-provider' },
      kind: 'app',
      render: { mode: 'default', basic: { title: 'Stale' } },
      scoring: { final: 1 },
      meta: { recommendation: { source: 'frequent', score: 1 } }
    }
    dbUtils.getRecommendationCache = vi.fn(async () => ({
      cacheKey: 'freshness-key',
      recommendedItems: JSON.stringify([staleItem]),
      createdAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 20 * 60_000)
    }))
    const catalog = createCatalogDbUtils([createCatalogApp('/Applications/Fresh.app', 30_000, 1)], {
      1: 30_000
    })
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)
    stubDimensions(engine)

    const beforeInstall = await engine.recommend({ limit: 5 })
    expect(beforeInstall.fromCache).toBe(true)
    expect(beforeInstall.items.map((item) => item.id)).toEqual(['/Applications/Stale.app'])

    // What the app index commit does when the new app lands.
    engine.invalidateCache()
    const afterInstall = await engine.recommend({ limit: 5 })

    expect(afterInstall.fromCache).toBe(false)
    expect(afterInstall.items.map((item) => item.id)).toEqual(['/Applications/Fresh.app'])
  })

  it('tags the newly installed ids it returned so exposure can be sliced', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Fresh.app', 2 * HOUR_MS, 1)],
      { 1: 2 * HOUR_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Habit.app',
          sourceType: 'application',
          usageStats: createUsageStats('/Applications/Habit.app', { executeCount: 40 })
        }
      ])
    })

    await engine.recommend({ limit: 5 })

    expect(exposureServiceMock.setTaggedKeys).toHaveBeenLastCalledWith('newly-installed', [
      'app-provider:/Applications/Fresh.app'
    ])
  })
})
