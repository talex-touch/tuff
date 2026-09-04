import { ContextProvider, type ContextSignal, hashContextContent } from './context-provider'
import { afterEach, describe, expect, it, vi } from 'vitest'

const intelligenceSdkMock = vi.hoisted(() => ({
  embeddingGenerate: vi.fn(),
  ragRerank: vi.fn()
}))

// A stable instance: the engine resolves the singleton once, so a factory returning a fresh object
// per call would leave every assertion on one the code under test never held.
const pollingMock = vi.hoisted(() => ({
  isRegistered: vi.fn(() => false),
  unregister: vi.fn(),
  register: vi.fn(),
  start: vi.fn()
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
    getInstance: () => pollingMock
  }
}))

// Hoisted so tests can drive the gate: the engine resolves this singleton once,
// and recommend() is the interactive empty-query entry point.
const appTaskGateMock = vi.hoisted(() => ({
  isActive: vi.fn(() => false),
  waitForIdle: vi.fn(async (_timeoutMs?: number): Promise<boolean | undefined> => undefined)
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: appTaskGateMock
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

// The engine re-reads the clipboard when building the URL candidate, and only trusts it if the
// content still hashes to the digest carried on the context (#648).
const clipboardLatest = vi.hoisted(() => ({ current: null as { content: string } | null }))

vi.mock('../../../clipboard', () => ({
  clipboardModule: {
    getLatestItem: () => clipboardLatest.current
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

  it('fills the grid when every candidate shares one source type', () => {
    // maxPerType is ceil(10 * 0.4) = 4 and the half-mark is 5. A homogeneous pool
    // latches both conditions at once: items 1-5 get in (the 5th because
    // result.length is still 4), then everything after is skipped forever, so the
    // empty-query grid came back half full (#672).
    const engine = new RecommendationEngine(createDbUtils() as never)
    const diversify = (
      engine as unknown as {
        applyDiversityFilter: (scored: unknown[], limit: number) => unknown[]
      }
    ).applyDiversityFilter.bind(engine)

    const pool = Array.from({ length: 20 }, (_, i) => ({
      sourceId: 'app-provider',
      itemId: `/Applications/App-${i}.app`,
      sourceType: 'application',
      score: 1000 - i
    }))

    const picked = diversify(pool, 10) as Array<{ itemId: string }>

    expect(picked).toHaveLength(10)
    // Backfill must preserve score order, not append the leftovers arbitrarily.
    expect(picked.map((item) => item.itemId)).toEqual(pool.slice(0, 10).map((i) => i.itemId))
  })

  it('still spreads a mixed pool across source types', () => {
    const engine = new RecommendationEngine(createDbUtils() as never)
    const diversify = (
      engine as unknown as {
        applyDiversityFilter: (scored: unknown[], limit: number) => unknown[]
      }
    ).applyDiversityFilter.bind(engine)

    // 12 apps ahead of 4 plugins on score. Without the quota the plugins would
    // never appear; the backfill must not undo that.
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => ({
        sourceId: 'app-provider',
        itemId: `app-${i}`,
        sourceType: 'application',
        score: 1000 - i
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        sourceId: 'plugin-recommend',
        itemId: `plugin-${i}`,
        sourceType: 'plugin',
        score: 500 - i
      }))
    ]

    const picked = diversify(pool, 10) as Array<{ sourceType: string }>

    expect(picked).toHaveLength(10)
    expect(picked.filter((item) => item.sourceType === 'plugin').length).toBeGreaterThan(0)
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

  it('does not read the recommendation cache it is about to discard', async () => {
    // recommend() awaited getCachedRecommendations and only then checked
    // forceRefresh, so the 15-minute background refresh and every user-triggered
    // refresh paid for a SELECT plus a JSON.parse of up to 10 rendered TuffItems
    // and threw the result away (#675).
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'fresh-app',
          sourceType: 'app',
          source: 'frequent',
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
      getPinnedItems: vi.fn(async () => []),
      getCandidates
    })

    const forced = await engine.recommend({ limit: 1, forceRefresh: true })

    expect(dbUtils.getRecommendationCache).not.toHaveBeenCalled()
    expect(forced.items[0]?.id).toBe('fresh-app')
    expect(getCandidates).toHaveBeenCalledTimes(1)
  })

  it('still reads the cache on a normal recommend', async () => {
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(1) }))
    })

    await engine.recommend({ limit: 1 })

    // The skip must be conditional on forceRefresh, not a blanket removal.
    expect(dbUtils.getRecommendationCache).toHaveBeenCalled()
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
    // Pinning is not a score, so a pinned entry is appended last in the item order — but it claims
    // a grid slot first, or the one thing the user asked to always see would land in the
    // "here is a suggestion" list below.
    expect(result.containerLayout?.sections?.at(0)).toMatchObject({
      id: 'habitual',
      layout: 'grid'
    })
    expect(result.containerLayout?.sections?.at(0)?.itemIds?.[0]).toBe('pinned-app')
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
    // `content` carries the privacy digest, not the URL — that is what #648 was about. The engine
    // re-reads the clipboard and matches on this digest, so the fixture has to hash too.
    const clipboardContext = (url: string): ContextSignal => ({
      ...morningContext,
      clipboard: {
        type: 'text',
        content: hashContextContent(url),
        timestamp: Date.now(),
        contentType: 'url',
        meta: { isUrl: true }
      }
    })
    const first = 'https://example.com/first'
    const second = 'https://example.com/second'
    const contexts = [clipboardContext(first), clipboardContext(second)]

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

    clipboardLatest.current = { content: first }
    await engine.recommend({ limit: 5 })

    clipboardLatest.current = { content: second }
    const cached = await engine.recommend({ limit: 5 })

    expect(cached.fromCache).toBe(true)
    const urlActions = cached.items.filter((item) => item.id.startsWith('clipboard-url-open:'))
    expect(urlActions.map((item) => item.id)).toEqual([`clipboard-url-open:${second}`])
  })

  it('carries the real URL, not the privacy digest, into the open-url card', async () => {
    // #648: ContextSignal.clipboard.content is a sha256 prefix. Building the card from it gave a
    // '打开 URL' entry whose subtitle, id and open-url payload were all '9f2c1a4b8e7d3f01'.
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)
    const url = 'https://github.com/talex-touch/talex-touch'
    const digest = hashContextContent(url)

    expect(digest).not.toBe(url)

    clipboardLatest.current = { content: url }

    const candidates = await (
      engine as unknown as {
        getClipboardUrlCandidates: (
          context: ContextSignal
        ) => Promise<Array<{ pluginCandidate?: { data?: { url?: string }; subtitle?: string } }>>
      }
    ).getClipboardUrlCandidates({
      ...morningContext,
      clipboard: {
        type: 'text',
        content: digest,
        timestamp: Date.now(),
        contentType: 'url',
        meta: { isUrl: true }
      }
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.pluginCandidate?.data?.url).toBe(url)
    expect(candidates[0]?.pluginCandidate?.subtitle).toContain('github.com')
    expect(JSON.stringify(candidates[0])).not.toContain(digest)
  })

  it('produces no card when the clipboard no longer matches the context', async () => {
    // The race the digest check exists for: between the snapshot and the rebuild the user copied
    // something else. Opening that instead would be worse than showing nothing.
    const dbUtils = createDbUtils()
    const engine = new RecommendationEngine(dbUtils as never)

    clipboardLatest.current = { content: 'https://example.com/something-else' }

    const candidates = await (
      engine as unknown as {
        getClipboardUrlCandidates: (context: ContextSignal) => Promise<unknown[]>
      }
    ).getClipboardUrlCandidates({
      ...morningContext,
      clipboard: {
        type: 'text',
        content: hashContextContent('https://example.com/original'),
        timestamp: Date.now(),
        contentType: 'url',
        meta: { isUrl: true }
      }
    })

    expect(candidates).toEqual([])
  })

  it('survives a corrupt item_time_stats row instead of aborting the whole recommendation', async () => {
    // #649: this loop is inside the unguarded getCandidates chain, so a raw JSON.parse on one bad
    // row took down recommend() entirely rather than costing that item its time history.
    const good = {
      sourceId: 'app-provider',
      itemId: 'com.apple.Terminal',
      hourDistribution: JSON.stringify(Array.from({ length: 24 }, () => 5)),
      dayOfWeekDistribution: JSON.stringify(Array.from({ length: 7 }, () => 5)),
      timeSlotDistribution: JSON.stringify({ morning: 9, afternoon: 0, evening: 0, night: 0 }),
      lastUpdated: new Date()
    }
    const corrupt = { ...good, itemId: 'com.apple.Safari', hourDistribution: '{"truncated' }

    const dbUtils = {
      ...createDbUtils(),
      getAllItemTimeStats: vi.fn(async () => [corrupt, good]),
      getUsageStatsBatch: vi.fn(async () => [
        createUsageStats('com.apple.Terminal', { executeCount: 3 }),
        createUsageStats('com.apple.Safari', { executeCount: 3 })
      ])
    }
    const engine = new RecommendationEngine(dbUtils as never)

    const items = await (
      engine as unknown as {
        getTimeBasedTopItems: (
          pattern: unknown,
          limit: number
        ) => Promise<Array<{ itemId: string }>>
      }
    ).getTimeBasedTopItems(morningContext.time, 10)

    // Positive control: the healthy row still scores, so this is not passing because the method
    // returned nothing at all.
    expect(items.map((item) => item.itemId)).toContain('com.apple.Terminal')
  })

  it('does not run a refresh after stopBackgroundRefresh cancels the jitter window', async () => {
    // #652: the polling callback only *schedules* the refresh, through an untracked setTimeout.
    // stopBackgroundRefresh unregistered the polling task and left that pending, so a full
    // recommendation pass still ran after shutdown — against a database the owner had torn down.
    vi.useFakeTimers()
    try {
      pollingMock.register.mockClear()

      const engine = new RecommendationEngine(createDbUtils() as never)
      const runBackgroundRefresh = vi.fn(async () => {})
      Object.assign(engine as unknown as Record<string, unknown>, { runBackgroundRefresh })
      ;(engine as unknown as { startBackgroundRefresh: () => void }).startBackgroundRefresh()

      const scheduled = pollingMock.register.mock.calls.find(
        (call) => typeof call[1] === 'function'
      )?.[1] as (() => void) | undefined

      // Positive control: the polling task registered a callback at all.
      expect(scheduled).toBeTypeOf('function')

      scheduled?.()
      engine.stopBackgroundRefresh()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(runBackgroundRefresh).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still refreshes when the jitter window elapses without a stop', async () => {
    // The other half: a fix that simply never scheduled would pass the test above.
    vi.useFakeTimers()
    try {
      pollingMock.register.mockClear()

      const engine = new RecommendationEngine(createDbUtils() as never)
      const runBackgroundRefresh = vi.fn(async () => {})
      Object.assign(engine as unknown as Record<string, unknown>, { runBackgroundRefresh })
      ;(engine as unknown as { startBackgroundRefresh: () => void }).startBackgroundRefresh()
      const scheduled = pollingMock.register.mock.calls.find(
        (call) => typeof call[1] === 'function'
      )?.[1] as (() => void) | undefined

      scheduled?.()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(runBackgroundRefresh).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
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

  it('polls plugin recommendation providers concurrently, not one after another', async () => {
    // Awaiting each provider in a for-of made PLUGIN_PROVIDER_TIMEOUT_MS a
    // per-provider budget: six slow plugins meant 1.2s of empty grid on every
    // uncached open of the CoreBox empty-query path (#674).
    const engine = new RecommendationEngine(createDbUtils() as never)
    const DELAY = 60
    const PROVIDERS = 4

    let live = 0
    let peakConcurrent = 0

    for (let i = 0; i < PROVIDERS; i++) {
      engine.registerPluginProvider('demo-plugin', {
        id: `provider-${i}`,
        canProvide: () => true,
        getCandidates: async () => {
          live += 1
          peakConcurrent = Math.max(peakConcurrent, live)
          await new Promise((resolve) => setTimeout(resolve, DELAY))
          live -= 1
          return [{ id: `candidate-${i}`, title: `Candidate ${i}`, action: 'open' }]
        }
      } as never)
    }

    const startedAt = Date.now()
    const candidates = await (
      engine as unknown as {
        getPluginCandidates: (context: unknown) => Promise<unknown[]>
      }
    ).getPluginCandidates(morningContext)
    const elapsed = Date.now() - startedAt

    expect(candidates).toHaveLength(PROVIDERS)
    // All four in flight at once rather than a queue of one.
    expect(peakConcurrent).toBe(PROVIDERS)
    // Sequential would be >= 4 * 60ms; concurrent stays near one delay.
    expect(elapsed).toBeLessThan(DELAY * PROVIDERS)
  })

  it('clears the timeout timer when a provider answers in time', async () => {
    // The race armed a 200ms setTimeout per provider and never cleared it on the
    // winning path, leaving a pending timer per call keeping the loop awake (#674).
    vi.useFakeTimers()
    try {
      const engine = new RecommendationEngine(createDbUtils() as never)

      for (let i = 0; i < 3; i++) {
        engine.registerPluginProvider('demo-plugin', {
          id: `prompt-${i}`,
          canProvide: () => true,
          getCandidates: async () => [{ id: `c-${i}`, title: `C ${i}`, action: 'open' }]
        } as never)
      }

      const before = vi.getTimerCount()
      await (
        engine as unknown as {
          getPluginCandidates: (context: unknown) => Promise<unknown[]>
        }
      ).getPluginCandidates(morningContext)

      expect(vi.getTimerCount()).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves provider registration order in the candidate list', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)

    // Deliberately inverted delays: if order followed completion rather than
    // registration, this would come back reversed.
    for (const [index, delay] of [90, 60, 30, 0].entries()) {
      engine.registerPluginProvider('demo-plugin', {
        id: `ordered-${index}`,
        canProvide: () => true,
        getCandidates: async () => {
          await new Promise((resolve) => setTimeout(resolve, delay))
          return [{ id: `candidate-${index}`, title: `Candidate ${index}`, action: 'open' }]
        }
      } as never)
    }

    const candidates = (await (
      engine as unknown as {
        getPluginCandidates: (context: unknown) => Promise<Array<{ itemId: string }>>
      }
    ).getPluginCandidates(morningContext)) as Array<{ itemId: string }>

    expect(candidates.map((c) => c.itemId)).toEqual([
      'candidate-0',
      'candidate-1',
      'candidate-2',
      'candidate-3'
    ])
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

describe('recommendation app-task gate wait', () => {
  function createStubbedEngine() {
    const engine = new RecommendationEngine(createDbUtils() as never)
    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}|${context.time.dayOfWeek}`
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(1) }))
    })
    return engine
  }

  afterEach(() => {
    appTaskGateMock.isActive.mockReturnValue(false)
    // History too, not just the implementation: the `not.toHaveBeenCalled()`
    // assertion below otherwise sees the previous test's call and fails.
    appTaskGateMock.waitForIdle.mockReset()
    appTaskGateMock.waitForIdle.mockResolvedValue(undefined)
  })

  it('bounds the wait and still produces a result when the gate never drains', async () => {
    appTaskGateMock.isActive.mockReturnValue(true)
    appTaskGateMock.waitForIdle.mockResolvedValue(false)

    const result = await createStubbedEngine().recommend({ limit: 5 })

    // recommend() is what search-core calls on the empty-query path, so an
    // unbounded wait here meant opening CoreBox during an app-index scan hung
    // past the renderer's 400ms give-up and showed nothing.
    const [timeoutArg] = appTaskGateMock.waitForIdle.mock.calls.at(-1) ?? []
    expect(typeof timeoutArg).toBe('number')
    expect(timeoutArg).toBeGreaterThan(0)
    expect(timeoutArg as number).toBeLessThan(400)

    // Yielding is an optimization, not a precondition: a timed-out wait must
    // still compute rather than return nothing.
    expect(result).toBeTruthy()
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('does not wait at all when no app task is active', async () => {
    appTaskGateMock.isActive.mockReturnValue(false)

    await createStubbedEngine().recommend({ limit: 5 })

    expect(appTaskGateMock.waitForIdle).not.toHaveBeenCalled()
  })
})

/**
 * Plugin recommendation candidates used to bypass scoring entirely:
 * `return (priority ?? 50) * 1e5`. That put a default-priority plugin item at 5e6 — above the
 * frequency term of an app the user opens every day (~1e6) and above every recency boost (≤1e5) —
 * from a number the plugin picks for itself and the host cannot verify. It also meant a plugin
 * item ranked identically whether it had been used a hundred times or never.
 */
describe('RecommendationEngine plugin candidate ranking', () => {
  type ScoreFn = (
    candidate: unknown,
    context: unknown,
    semanticSettings: unknown,
    semanticProfile: unknown,
    usagePreferenceProfile: unknown,
    usageAvoidanceProfile: unknown
  ) => Promise<number>

  const semanticOff = {
    localVectorEnabled: false,
    aiRerankEnabled: false,
    aiEmbeddingEnabled: false
  }

  function scoreOf(engine: RecommendationEngine, candidate: unknown): Promise<number> {
    const score = (engine as unknown as { calculateRecommendationScore: ScoreFn })
      .calculateRecommendationScore
    return score.call(engine, candidate, morningContext, semanticOff, null, null, null)
  }

  const pluginCandidate = (
    priority: number,
    usageStats = createUsageStats('open-project', { executeCount: 0, lastExecuted: null })
  ): unknown => ({
    sourceId: 'plugin-recommend:demo',
    itemId: 'open-project',
    sourceType: 'plugin-recommend',
    usageStats,
    source: 'plugin',
    pluginCandidate: {
      providerId: 'demo',
      id: 'open-project',
      title: 'Open Project',
      action: 'open',
      priority
    }
  })

  const heavilyUsedApp = (): unknown => ({
    sourceId: 'app-provider',
    itemId: '/Applications/Daily.app',
    sourceType: 'app',
    usageStats: createUsageStats('/Applications/Daily.app', {
      executeCount: 100,
      lastExecuted: new Date()
    }),
    source: 'frequent'
  })

  it('does not let a plugin outrank a daily-driver app by declaring priority 100', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)

    const appScore = await scoreOf(engine, heavilyUsedApp())
    const pluginScore = await scoreOf(engine, pluginCandidate(100))

    expect(pluginScore).toBeLessThan(appScore)
  })

  it('still orders a plugin its own candidates by priority', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)

    const high = await scoreOf(engine, pluginCandidate(90))
    const low = await scoreOf(engine, pluginCandidate(10))

    expect(high).toBeGreaterThan(low)
  })

  it('lets a plugin item climb once the user actually uses it', async () => {
    // The whole point of removing the short-circuit: usage, not the plugin's own number, is what
    // moves an item up.
    const engine = new RecommendationEngine(createDbUtils() as never)

    const unused = await scoreOf(engine, pluginCandidate(50))
    const used = await scoreOf(
      engine,
      pluginCandidate(
        50,
        createUsageStats('open-project', { executeCount: 40, lastExecuted: new Date() })
      )
    )

    expect(used).toBeGreaterThan(unused)
  })

  it('keeps the host-generated clipboard URL card in its own band', async () => {
    // Not a regression the demotion may take with it: the priority on this card comes from a
    // signal the host observed itself, so it still outranks usage.
    const engine = new RecommendationEngine(createDbUtils() as never)

    const cardScore = await scoreOf(engine, {
      sourceId: '__builtin_clipboard_url__',
      itemId: 'clipboard-url-open:https://example.com',
      sourceType: 'action',
      usageStats: createUsageStats('clipboard-url-open', { executeCount: 0, lastExecuted: null }),
      source: 'context',
      pluginCandidate: {
        id: 'clipboard-url-open:https://example.com',
        title: '打开 URL',
        action: 'open-url',
        priority: 95
      }
    })

    expect(cardScore).toBe(95 * 1e5)
    expect(cardScore).toBeGreaterThan(await scoreOf(engine, heavilyUsedApp()))
  })
})

describe('RecommendationEngine plugin candidate quotas', () => {
  type CollectFn = (context: unknown) => Promise<Array<{ sourceId: string; itemId: string }>>

  function collect(
    engine: RecommendationEngine
  ): Promise<Array<{ sourceId: string; itemId: string }>> {
    return (engine as unknown as { getPluginCandidates: CollectFn }).getPluginCandidates.call(
      engine,
      morningContext
    )
  }

  function registerProvider(engine: RecommendationEngine, id: string, count: number): void {
    engine.registerPluginProvider('demo-plugin', {
      id,
      canProvide: () => true,
      getCandidates: async () =>
        Array.from({ length: count }, (_unused, index) => ({
          id: `${id}-candidate-${index}`,
          title: `Candidate ${index}`,
          action: 'open'
        }))
    } as never)
  }

  it('caps how many candidates one plugin may contribute', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)
    registerProvider(engine, 'greedy', 40)

    await expect(collect(engine)).resolves.toHaveLength(5)
  })

  it('caps the plugins collectively, so well-behaved plugins cannot crowd out built-ins', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)
    // Each is under the per-provider cap; together they are not.
    for (let i = 0; i < 6; i += 1) registerProvider(engine, `provider-${i}`, 5)

    await expect(collect(engine)).resolves.toHaveLength(15)
  })

  it('hydrates plugin candidates with the usage rows the host recorded for them', async () => {
    const dbUtils = createDbUtils()
    dbUtils.getUsageStatsBatch = vi.fn(async () => [
      {
        ...createUsageStats('used-candidate-0', { executeCount: 7 }),
        sourceId: 'plugin-recommend:used',
        itemId: 'used-candidate-0'
      }
    ]) as never

    const engine = new RecommendationEngine(dbUtils as never)
    registerProvider(engine, 'used', 2)

    const candidates = (await collect(engine)) as unknown as Array<{
      itemId: string
      usageStats: { executeCount: number }
    }>

    expect(candidates.find((c) => c.itemId === 'used-candidate-0')?.usageStats.executeCount).toBe(7)
    // The one with no row keeps the empty placeholder rather than inheriting its sibling's.
    expect(candidates.find((c) => c.itemId === 'used-candidate-1')?.usageStats.executeCount).toBe(0)
  })

  it('keeps the candidates when the usage lookup fails', async () => {
    const dbUtils = createDbUtils()
    dbUtils.getUsageStatsBatch = vi.fn(async () => {
      throw new Error('db unavailable')
    }) as never

    const engine = new RecommendationEngine(dbUtils as never)
    registerProvider(engine, 'flaky', 3)

    await expect(collect(engine)).resolves.toHaveLength(3)
  })
})

/**
 * The empty state used to be two grids split by pin state (`Recommend` + `Pinned`, both titled in
 * hardcoded English). It is now two tiers split by *reason*: a one-row grid of things reached for
 * out of habit, then a list of things the host is proposing, where there is room for the reason
 * line that makes them make sense.
 */
describe('RecommendationEngine empty-state tiers', () => {
  type LayoutFn = (
    options: unknown,
    items: unknown[]
  ) => {
    grid?: { columns: number }
    sections?: Array<{ id: string; title?: string; layout: string; itemIds: string[] }>
  }

  function layoutOf(items: unknown[]): ReturnType<LayoutFn> {
    const engine = new RecommendationEngine(createDbUtils() as never)
    return (engine as unknown as { buildContainerLayout: LayoutFn }).buildContainerLayout.call(
      engine,
      {},
      items
    )
  }

  const item = (id: string, source: string, pinned = false): unknown => ({
    id,
    meta: {
      recommendation: { source },
      ...(pinned ? { pinned: { isPinned: true } } : {})
    }
  })

  it('puts habitual reasons in a grid and proposed ones in a list', () => {
    const sections = layoutOf([
      item('daily-app', 'frequent'),
      item('at-this-hour', 'time-based'),
      item('plugin-thing', 'plugin')
    ]).sections

    expect(sections?.map((section) => [section.id, section.layout])).toEqual([
      ['habitual', 'grid'],
      ['proposed', 'list']
    ])
    expect(sections?.[0]?.itemIds).toEqual(['daily-app'])
    expect(sections?.[1]?.itemIds).toEqual(['at-this-hour', 'plugin-thing'])
  })

  it('titles both tiers with i18n keys rather than a hardcoded language', () => {
    const sections = layoutOf([item('a', 'frequent'), item('b', 'plugin')]).sections

    expect(sections?.[0]?.title).toBe('$i18n:coreBox.sections.habitual')
    expect(sections?.[1]?.title).toBe('$i18n:coreBox.sections.proposed')
  })

  it('caps the grid at one row and spills the rest into the list', () => {
    const many = Array.from({ length: 10 }, (_unused, index) =>
      item(`frequent-${index}`, 'frequent')
    )

    const { grid, sections } = layoutOf(many)

    expect(grid?.columns).toBe(6)
    expect(sections?.[0]?.itemIds).toHaveLength(6)
    // A second, half-empty grid row reads as noise; the overflow belongs in the list.
    expect(sections?.[1]?.itemIds).toHaveLength(4)
  })

  it('gives pinned entries a grid slot even though they sort last', () => {
    // Pinning is not a score, so pinned items are appended after the ranked ones. Taking the grid
    // in list order would drop the one thing the user asked to always see into the tier below.
    const items = [
      ...Array.from({ length: 8 }, (_unused, index) => item(`frequent-${index}`, 'frequent')),
      item('pinned-app', 'frequent', true)
    ]

    const sections = layoutOf(items).sections

    expect(sections?.[0]?.itemIds?.[0]).toBe('pinned-app')
    expect(sections?.[0]?.itemIds).toHaveLength(6)
  })

  it('emits only the grid when nothing needs explaining', () => {
    const sections = layoutOf([item('a', 'frequent'), item('b', 'frequent')]).sections

    expect(sections?.map((section) => section.id)).toEqual(['habitual'])
  })

  it('emits only the list when nothing is habitual yet', () => {
    // Cold start: no usage history at all, so every card carries a reason.
    const sections = layoutOf([item('a', 'cold-start'), item('b', 'cold-start')]).sections

    expect(sections?.map((section) => [section.id, section.layout])).toEqual([['proposed', 'list']])
  })

  it('emits no sections for an empty result', () => {
    expect(layoutOf([]).sections).toEqual([])
  })
})

/**
 * Files reach the grid through a single freshness gate: `files.ctime` is the filesystem birth
 * time, so re-indexing an old folder cannot make its contents look new and a full scan produces
 * nothing here. Apps need a second gate only because a self-update rebuilds the bundle and
 * refreshes its birthtime.
 */
describe('RecommendationEngine newly added files', () => {
  type CollectFn = (
    limit: number
  ) => Promise<Array<{ sourceId: string; itemId: string; source: string; firstSeenAt?: number }>>

  const fileRow = (path: string, bornAgoMs: number, overrides: Record<string, unknown> = {}) => ({
    id: Math.abs(path.length * 31),
    path,
    name: path.split('/').pop(),
    size: 2048,
    isDir: false,
    ctime: new Date(Date.now() - bornAgoMs),
    mtime: new Date(Date.now() - bornAgoMs),
    ...overrides
  })

  function engineWith(rows: unknown[], usage: unknown[] = []) {
    const dbUtils = createDbUtils()
    const getRecentlyCreatedFiles = vi.fn(async () => rows)
    Object.assign(dbUtils, {
      getRecentlyCreatedFiles,
      getUsageStatsBatch: vi.fn(async () => usage)
    })
    const engine = new RecommendationEngine(dbUtils as never)
    const collect: CollectFn = (limit) =>
      (engine as unknown as { getNewlyAddedFileItems: CollectFn }).getNewlyAddedFileItems.call(
        engine,
        limit
      )
    return { engine, collect, getRecentlyCreatedFiles }
  }

  it('asks the database for a bounded, time-filtered window instead of scanning the index', async () => {
    // The file index is routinely tens of thousands of rows and this runs on the empty-query path.
    const { collect, getRecentlyCreatedFiles } = engineWith([])

    await collect(4)

    expect(getRecentlyCreatedFiles).toHaveBeenCalledTimes(1)
    const [createdAfter, limit] = getRecentlyCreatedFiles.mock.calls[0] as unknown as [Date, number]
    expect(createdAfter).toBeInstanceOf(Date)
    expect(Date.now() - createdAfter.getTime()).toBeCloseTo(7 * DAY_MS, -4)
    expect(limit).toBeGreaterThan(4)
  })

  it('carries the birth time as firstSeenAt so novelty scores it like a new app', async () => {
    const bornAgo = 2 * HOUR_MS
    const { collect } = engineWith([fileRow('/Users/x/Downloads/report.pdf', bornAgo)])

    const [candidate] = await collect(4)

    expect(candidate).toMatchObject({ sourceId: 'file-provider', source: 'newly-added' })
    expect(Date.now() - (candidate.firstSeenAt ?? 0)).toBeCloseTo(bornAgo, -4)
  })

  it('drops build output before it can consume the slot budget', async () => {
    const { collect } = engineWith([
      fileRow('/Users/x/code/node_modules/react/index.js', HOUR_MS),
      fileRow('/Users/x/code/dist/bundle.js', HOUR_MS),
      fileRow('/Users/x/code/.git/COMMIT_EDITMSG.txt', HOUR_MS),
      fileRow('/Users/x/Downloads/keeper.pdf', HOUR_MS)
    ])

    const candidates = await collect(4)

    expect(candidates.map((candidate) => candidate.itemId)).toEqual([
      '/Users/x/Downloads/keeper.pdf'
    ])
  })

  it('never returns more than the slot budget', async () => {
    const { collect } = engineWith(
      Array.from({ length: 30 }, (_unused, index) =>
        fileRow(`/Users/x/Downloads/file-${index}.pdf`, HOUR_MS)
      )
    )

    await expect(collect(4)).resolves.toHaveLength(4)
  })

  it('hydrates the usage row so an already-opened file stops being news', async () => {
    // Novelty is gated on executeCount === 0; without the real row every file would look untouched.
    const { collect } = engineWith(
      [fileRow('/Users/x/Downloads/seen.pdf', HOUR_MS)],
      [
        {
          ...createUsageStats('/Users/x/Downloads/seen.pdf', { executeCount: 3 }),
          sourceId: 'file-provider',
          itemId: '/Users/x/Downloads/seen.pdf'
        }
      ]
    )

    const [candidate] = await collect(4)

    expect(
      (candidate as unknown as { usageStats: { executeCount: number } }).usageStats.executeCount
    ).toBe(3)
  })

  it('degrades to [] when the lookup fails', async () => {
    const dbUtils = createDbUtils()
    Object.assign(dbUtils, {
      getRecentlyCreatedFiles: vi.fn(async () => {
        throw new Error('db unavailable')
      })
    })
    const engine = new RecommendationEngine(dbUtils as never)

    await expect(
      (engine as unknown as { getNewlyAddedFileItems: CollectFn }).getNewlyAddedFileItems.call(
        engine,
        4
      )
    ).resolves.toEqual([])
  })
})
