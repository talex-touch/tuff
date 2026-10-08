import type { TuffItem } from '@talex-touch/utils'
import type * as sqliteRetry from '../../../../db/sqlite-retry'
import type { RecommendationHistoryEvent } from '../../../../db/utils'
import { BEHAVIOR_DECAY_LAMBDA } from '../../../../db/utils'
import type * as ItemRebuilderModule from './item-rebuilder'
import type { ScoredItem } from './recommendation-engine'
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

vi.mock('../../../../db/sqlite-retry', async (importOriginal) => ({
  // Only the retry wrapper is stubbed; the busy classifier stays real, because the
  // scheduler under test reads it and a partial mock must still export it.
  ...(await importOriginal<typeof sqliteRetry>()),
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
  COLD_START_BASE_SCORE,
  RecommendationEngine
} from './recommendation-engine'
import type { UsageBehaviorRow } from '../usage-utils'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import {
  createUsageLimitError,
  emptyUsageLimits,
  notifyUsageLimitsChanged
} from '../../../ai/usage-ledger/usage-limits'

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

/**
 * Disposers for plugin providers registered by any test in this file.
 *
 * `registerPluginProvider` now also claims `plugin-recommend:<id>` in the process-wide source
 * registry, so a test that only drops its engine would leak the claim and redden the next test's
 * registration with "already registered". Registering through this helper keeps the registry clean.
 */
const pluginProviderDisposers: Array<() => void> = []

afterEach(() => {
  while (pluginProviderDisposers.length) pluginProviderDisposers.pop()?.()
})

function registerPluginProvider(
  engine: RecommendationEngine,
  pluginName: string,
  provider: Record<string, unknown>
): () => void {
  const dispose = engine.registerPluginProvider(pluginName, provider as never)
  pluginProviderDisposers.push(dispose)
  return dispose
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
    ),
    getRecommendationHistory: vi.fn(async (): Promise<RecommendationHistoryEvent[]> => []),
    // The scorer's single behaviour read. Returning [] means "no key has evidence", which is the
    // honest state for a suite that never seeded executions: the pass then reads as cold start.
    getUsageBehaviorBatch: vi.fn(
      async (_keys: Array<{ sourceId: string; itemId: string }>): Promise<UsageBehaviorRow[]> => []
    )
  }
}

/** A behaviour row as `getUsageBehaviorBatch` returns it: dated execution facts, or a zero row. */
function createBehaviorRow(
  itemId: string,
  overrides: Partial<{
    executeCount: number
    executeCount30: number
    executeCount7: number
    activeDays30: number
    lastExecutedAt: number | null
    decayedExecuteScore30: number
  }> = {}
): UsageBehaviorRow {
  return {
    sourceId: 'app-provider',
    itemId,
    executeCount: overrides.executeCount ?? 0,
    executeCount30: overrides.executeCount30 ?? 0,
    executeCount7: overrides.executeCount7 ?? 0,
    activeDays30: overrides.activeDays30 ?? 0,
    activeDays7: 0,
    lastExecutedAt: overrides.lastExecutedAt ?? null,
    decayedExecuteScore30: overrides.decayedExecuteScore30 ?? 0,
    hourDistribution30: Array.from({ length: 24 }, () => 0),
    dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
    timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 }
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
  installedAgoMsByFileId: Record<number, number>,
  identityByFileId: Record<number, { appIdentity?: string; bundleId?: string }> = {}
) {
  return {
    ...createDbUtils(),
    getFilesByType: vi.fn(async () => apps),
    getFileExtensionsByFileIds: vi.fn(async (fileIds: number[], keys?: string[]) =>
      fileIds.flatMap((fileId) => {
        if (keys?.includes('appIdentity') || keys?.includes('bundleId')) {
          const identity = identityByFileId[fileId]
          if (!identity) return []
          return [
            ...(identity.appIdentity
              ? [{ fileId, key: 'appIdentity', value: identity.appIdentity }]
              : []),
            ...(identity.bundleId ? [{ fileId, key: 'bundleId', value: identity.bundleId }] : [])
          ]
        }
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
    getBuiltinDestinationCandidates: vi.fn(() => []),
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

/**
 * Renders everything except `dropped`, which is the shape a real partial rebuild
 * has: the sources that fail contribute nothing and the rest come back whole.
 * The cold-start and fallback rebuilds run through here too, so anything not
 * named by `dropped` survives on those paths as well.
 */
function createPartialRebuilder(dropped: string[]) {
  const missing = new Set(dropped)
  return {
    rebuildItems: vi.fn(
      async (items: Array<{ itemId: string; sourceId: string; source: string; score: number }>) =>
        items
          .filter((item) => !missing.has(item.itemId))
          .map((item) => ({
            id: item.itemId,
            source: { id: item.sourceId, type: 'app', name: item.sourceId },
            kind: 'app',
            render: { mode: 'default', basic: { title: item.itemId } },
            scoring: { final: item.score },
            meta: { recommendation: { source: item.source, score: item.score } }
          }))
    )
  }
}

/** Candidates the scorer accepts, all on one source type and one usage profile. */
function createCandidates(itemIds: string[]) {
  return itemIds.map((itemId) => ({
    sourceId: 'app-provider',
    itemId,
    sourceType: 'app',
    usageStats: createUsageStats(itemId, { executeCount: 5 })
  }))
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

/**
 * A persisted-cache handle that behaves like the table it stands for: a row is stored and read back
 * under the exact key the engine asked for, and nothing else. That is what lets a test assert
 * context/pin isolation and same-key reuse without naming a key — an assertion on the key string
 * would freeze the schema segment and go green while reuse broke.
 */
function createKeyedCacheStore() {
  const store = new Map<string, RecommendationCacheRecord>()
  const dbUtils = createDbUtils()

  dbUtils.getRecommendationCache.mockImplementation(async (cacheKey: string) => {
    return store.get(cacheKey) ?? null
  })
  dbUtils.setRecommendationCache = vi.fn(
    async (cacheKey: string, items: unknown[], expiresAt: Date) => {
      store.set(cacheKey, {
        cacheKey,
        recommendedItems: JSON.stringify(items),
        createdAt: new Date(),
        expiresAt
      })
    }
  ) as never

  return { dbUtils, store }
}

/**
 * An engine whose candidate pool is exactly what the test hands in. The cache tests are about which
 * key a pass reads and writes, not about how a candidate was recalled.
 */
function createStubbedCandidateEngine(
  dbUtils: ReturnType<typeof createDbUtils>,
  contexts: ContextSignal[],
  { items = [], pinned = [] }: { items?: unknown[]; pinned?: unknown[] } = {}
) {
  const engine = new RecommendationEngine(dbUtils as never)
  const getCandidates = vi.fn(async () => ({ items, perf: candidatePerf(items.length) }))
  const fallbackContext = contexts[contexts.length - 1] ?? morningContext

  Object.assign(engine as unknown as Record<string, unknown>, {
    contextProvider: {
      getCurrentContext: vi.fn(async () => contexts.shift() ?? fallbackContext),
      generateCacheKey: (signal: ContextSignal) =>
        `${signal.time.timeSlot}|${signal.time.dayOfWeek}`
    },
    scheduleTrendBackfill: vi.fn(),
    getPinnedItems: vi.fn(async () => pinned),
    getCandidates
  })

  return { engine, getCandidates }
}

describe('RecommendationEngine', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
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
    // A cached ranking is only valid for the time slot it was computed under. The harness stores and
    // reads rows under the engine's own key, so the assertion is about isolation, not about the key
    // spelling: an engine that reused the morning row for the afternoon context would fail here.
    const { dbUtils } = createKeyedCacheStore()
    const { engine, getCandidates } = createStubbedCandidateEngine(
      dbUtils,
      [morningContext, afternoonContext],
      { items: createCandidates(['fresh-afternoon-app']) }
    )

    const morning = await engine.recommend({ limit: 1 })
    const afternoon = await engine.recommend({ limit: 1 })

    expect(morning.fromCache).toBe(false)
    expect(morning.items[0]?.id).toBe('fresh-afternoon-app')
    // The afternoon context has an empty cache, so the ranking is recomputed rather than replayed.
    expect(afternoon.items[0]?.id).toBe('fresh-afternoon-app')
    expect(getCandidates).toHaveBeenCalledTimes(2)
    expect(dbUtils.getRecommendationCache.mock.calls[0]?.[0]).not.toBe(
      dbUtils.getRecommendationCache.mock.calls[1]?.[0]
    )
  })

  it('reuses the persisted ranking for the same context and pinned set', async () => {
    // The positive half of the isolation contract. The second engine has an empty memory cache, so
    // only the row the first one wrote can answer it: a cold start that ignored the persisted
    // ranking, or keyed it differently, would recompute.
    const { dbUtils, store } = createKeyedCacheStore()
    const first = createStubbedCandidateEngine(dbUtils, [morningContext], {
      items: createCandidates(['ranked-app'])
    })

    await first.engine.recommend({ limit: 1 })
    expect(store.size).toBe(1)

    const second = createStubbedCandidateEngine(dbUtils, [morningContext], {
      items: createCandidates(['ranked-app'])
    })
    const warm = await second.engine.recommend({ limit: 1 })

    expect(warm.fromCache).toBe(true)
    expect(warm.items[0]?.id).toBe('ranked-app')
    expect(second.getCandidates).not.toHaveBeenCalled()
  })

  it('never reads back a ranking persisted under an earlier cache schema', async () => {
    // The key carries a schema segment, and bumping it is how a shipped candidate-set change
    // invalidates every row already on disk: the previous version's ranking must not be replayed by
    // the current engine, or an upgrade keeps serving the old empty state until the TTL expires.
    const { dbUtils, store } = createKeyedCacheStore()
    const first = createStubbedCandidateEngine(dbUtils, [morningContext], {
      items: createCandidates(['fresh-app'])
    })

    await first.engine.recommend({ limit: 1 })
    const [storedKey] = [...store.keys()]
    expect(storedKey).toBeDefined()

    // Relocate the row onto the same key one schema version older, and nothing else: a reader that
    // ignored the version segment would answer with it.
    const legacyKey = storedKey!.replace(/^reco-v\d+/, 'reco-v1')
    const row = store.get(storedKey!)!
    store.delete(storedKey!)
    store.set(legacyKey, {
      ...row,
      cacheKey: legacyKey,
      recommendedItems: JSON.stringify([
        {
          id: 'legacy-app',
          source: { id: 'app-provider', type: 'app', name: 'app-provider' },
          kind: 'app',
          render: { mode: 'default', basic: { title: 'legacy-app' } },
          meta: { recommendation: { source: 'frequent' } }
        }
      ])
    })

    const second = createStubbedCandidateEngine(dbUtils, [morningContext], {
      items: createCandidates(['fresh-app'])
    })
    const fresh = await second.engine.recommend({ limit: 1 })

    expect(fresh.fromCache).toBe(false)
    expect(fresh.items.map((item) => item.id)).toEqual(['fresh-app'])
    expect(second.getCandidates).toHaveBeenCalledTimes(1)
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
    expect(ids[0]).toBe('pinned-app')
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

    expect(result.items.map((item) => item.id)).toEqual(['pinned-app', 'high-scored'])
  })

  it('separates persisted recommendation cache by pinned items', async () => {
    // Same time context, different pinned set: the second pass must not read the first pass's
    // ranking, because the two answer different questions about what the user pinned.
    const { dbUtils, store } = createKeyedCacheStore()
    const pinnedSets = [
      [
        {
          sourceId: 'pinned-source',
          itemId: 'pinned-app',
          sourceType: 'app',
          usageStats: createUsageStats('pinned-app')
        }
      ],
      []
    ]
    const engine = new RecommendationEngine(dbUtils as never)
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

    const withPin = await engine.recommend({ limit: 1 })
    const withoutPin = await engine.recommend({ limit: 1 })

    expect(withPin.items[0]?.id).toBe('pinned-app')
    expect(withoutPin.items[0]?.id).toBe('fresh-app')
    // Two different pinned sets wrote two rows under this one time context, and neither answer
    // was read back for the other.
    expect(store.size).toBe(2)
    expect(getCandidates).toHaveBeenCalledTimes(2)
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
    // Ranking now reads real dated behaviour, not the lifetime count: the heavy app must carry a
    // 30-day ledger row or it scores zero like everything else (R9).
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (): Promise<UsageBehaviorRow[]> =>
        ['com.apple.Terminal', 'com.microsoft.VSCode', 'discord'].map((itemId) =>
          createBehaviorRow(itemId, {
            executeCount: itemId === 'discord' ? 20 : 1,
            executeCount30: itemId === 'discord' ? 12 : 1,
            executeCount7: itemId === 'discord' ? 5 : 0,
            activeDays30: itemId === 'discord' ? 5 : 1,
            decayedExecuteScore30: itemId === 'discord' ? 9 : 1,
            lastExecutedAt: Date.now() - 3 * DAY_MS
          })
        )
    )
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
            usageStats: createUsageStats('com.apple.Terminal', { executeCount: 1 }),
            behavior: createBehaviorRow('com.apple.Terminal', {
              executeCount: 1,
              executeCount30: 1,
              activeDays30: 1,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            })
          },
          {
            sourceId: 'app-provider',
            itemId: 'com.microsoft.VSCode',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('com.microsoft.VSCode', { executeCount: 1 }),
            behavior: createBehaviorRow('com.microsoft.VSCode', {
              executeCount: 1,
              executeCount30: 1,
              activeDays30: 1,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            })
          },
          {
            sourceId: 'app-provider',
            itemId: 'discord',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('discord', { executeCount: 5 }),
            // The heavy app's lead is dated behaviour, not the lifetime count: ranking reads
            // `behavior`, so a fixture without it scores exactly like an unused row (R9).
            behavior: createBehaviorRow('discord', {
              executeCount: 20,
              executeCount30: 12,
              executeCount7: 5,
              activeDays30: 5,
              decayedExecuteScore30: 9,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            })
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

  it.each([
    { layer: 'AI embedding', settings: { aiRerankEnabled: false, aiEmbeddingEnabled: true } },
    { layer: 'AI rerank', settings: { aiRerankEnabled: true, aiEmbeddingEnabled: false } }
  ])(
    'turns the $layer layer off until the AI usage limit resets, without counting a failure',
    async ({ settings }) => {
      vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
      const resetsAt = Date.parse('2026-05-04T16:00:00.000Z')
      const refusal = createUsageLimitError('embedding.generate', {
        key: 'requestsPerDay',
        used: 10,
        max: 10,
        resetsAt
      })
      intelligenceSdkMock.embeddingGenerate.mockRejectedValue(refusal)
      intelligenceSdkMock.ragRerank.mockRejectedValue(refusal)

      const engine = new RecommendationEngine(createDbUtils() as never)
      const internals = engine as unknown as {
        semanticAiCooldownUntil: number
        semanticAiFailures: number
        isSemanticAiInCooldown: () => boolean
      }
      Object.assign(engine as unknown as Record<string, unknown>, {
        contextProvider: {
          getCurrentContext: vi.fn(async () => devFocusCodeContext),
          generateCacheKey: (context: ContextSignal) =>
            `${context.time.timeSlot}:${context.time.dayOfWeek}:usage-limit`
        },
        getRecommendationSemanticSettings: vi.fn(async () => ({
          localVectorEnabled: false,
          ...settings
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

      // The non-semantic ranking stands.
      expect(result.items.map((item) => item.id)).toEqual(['discord', 'com.apple.Terminal'])
      // Off until the limit's local reset, not for the 5-minute failure cooldown …
      expect(internals.semanticAiCooldownUntil).toBe(resetsAt)
      expect(internals.semanticAiFailures).toBe(0)
      vi.setSystemTime(resetsAt - 1)
      expect(internals.isSemanticAiInCooldown()).toBe(true)
      // … and back on once it resets.
      vi.setSystemTime(resetsAt)
      expect(internals.isSemanticAiInCooldown()).toBe(false)
      intelligenceSdkMock.embeddingGenerate.mockReset()
      intelligenceSdkMock.ragRerank.mockReset()
    }
  )

  it('brings the semantic layer back as soon as the limits change, not at the reset', async () => {
    vi.setSystemTime(new Date('2026-05-04T09:00:00.000Z'))
    // A monthly limit: left alone, the layer would stay off until June.
    const resetsAt = Date.parse('2026-05-31T16:00:00.000Z')
    intelligenceSdkMock.embeddingGenerate.mockRejectedValue(
      createUsageLimitError('embedding.generate', {
        key: 'requestsPerMonth',
        used: 10,
        max: 10,
        resetsAt
      })
    )

    const engine = new RecommendationEngine(createDbUtils() as never)
    const internals = engine as unknown as {
      semanticAiCooldownUntil: number
      isSemanticAiInCooldown: () => boolean
    }
    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => devFocusCodeContext),
        generateCacheKey: (context: ContextSignal) =>
          `${context.time.timeSlot}:${context.time.dayOfWeek}:usage-limit-change`
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
          }
        ],
        perf: candidatePerf(1, 1)
      }))
    })

    await engine.recommend({ limit: 10 })
    expect(internals.semanticAiCooldownUntil).toBe(resetsAt)
    expect(internals.isSemanticAiInCooldown()).toBe(true)
    const callsWhilePaused = intelligenceSdkMock.embeddingGenerate.mock.calls.length

    // The user raises or clears the limit in Audit: on again at once, weeks before June.
    notifyUsageLimitsChanged(emptyUsageLimits())
    expect(internals.isSemanticAiInCooldown()).toBe(false)

    // The next recommendation asks the semantic layer again (the paused ranking is not replayed
    // from the cache). Here the limit still binds, so that one call is refused and pauses it
    // again — one refusal, no loop.
    await engine.recommend({ limit: 10 })
    expect(intelligenceSdkMock.embeddingGenerate.mock.calls.length).toBe(callsWhilePaused + 1)
    expect(internals.semanticAiCooldownUntil).toBe(resetsAt)
    intelligenceSdkMock.embeddingGenerate.mockReset()
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
    // Time points are gated on >=10 executions over >=3 distinct days in the 30-day ledger, so the
    // candidate must carry real dated facts. Plain-app keeps a big dated base but no time spread;
    // morning-app trades base for a strong slot match so the time term is what decides it.
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (keys: Array<{ itemId: string }>): Promise<UsageBehaviorRow[]> =>
        keys.map((key) =>
          key.itemId === 'morning-app'
            ? {
                ...createBehaviorRow('morning-app', {
                  executeCount: 12,
                  executeCount30: 12,
                  executeCount7: 4,
                  activeDays30: 5,
                  decayedExecuteScore30: 9,
                  lastExecutedAt: Date.now() - 3 * DAY_MS
                }),
                timeSlotDistribution30: { morning: 12, afternoon: 2, evening: 0, night: 0 }
              }
            : createBehaviorRow('plain-app', {
                executeCount: 100,
                executeCount30: 10,
                executeCount7: 3,
                activeDays30: 4,
                decayedExecuteScore30: 6,
                lastExecutedAt: Date.now() - 3 * DAY_MS
              })
        )
    )
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
            usageStats: createUsageStats('plain-app', { executeCount: 100 }),
            // Equal overall habit to morning-app: same base, same counts, same age. The only
            // difference is the time-of-day spread, so what decides the order is the time term —
            // not a legacy lifetime count, and not recency (which is identical for both) (R5/R9).
            behavior: createBehaviorRow('plain-app', {
              executeCount: 12,
              executeCount30: 12,
              executeCount7: 4,
              activeDays30: 5,
              decayedExecuteScore30: 9,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            })
          },
          {
            sourceId: 'app-provider',
            itemId: 'morning-app',
            sourceType: 'app',
            source: 'frequent',
            usageStats: createUsageStats('morning-app', { executeCount: 1 }),
            behavior: createBehaviorRow('morning-app', {
              executeCount: 12,
              executeCount30: 12,
              executeCount7: 4,
              activeDays30: 5,
              decayedExecuteScore30: 9,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            })
          },
          {
            sourceId: 'app-provider',
            itemId: 'morning-app',
            sourceType: 'app',
            source: 'time-based',
            usageStats: createUsageStats('morning-app', { executeCount: 1 }),
            // Same habit as plain-app, but concentrated in the morning: this dated spread is what
            // earns the time points (the legacy `timeStats` histogram is no longer read) (R5/R9).
            behavior: {
              ...createBehaviorRow('morning-app', {
                executeCount: 12,
                executeCount30: 12,
                executeCount7: 4,
                activeDays30: 5,
                decayedExecuteScore30: 9,
                lastExecutedAt: Date.now() - 3 * DAY_MS
              }),
              timeSlotDistribution30: { morning: 10, afternoon: 2, evening: 0, night: 0 }
            },
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
    // The slot split now lives in the dated 30-day distribution, not the legacy histogram, so each
    // candidate carries its own morning/afternoon spread. The row must be keyed by the candidate's
    // real itemId: a placeholder id would leave the candidate without behaviour (R9).
    const slotRow = (itemId: string, morning: number, afternoon: number) => ({
      ...createBehaviorRow(itemId, {
        executeCount: 12,
        executeCount30: 12,
        executeCount7: 4,
        activeDays30: 4,
        decayedExecuteScore30: 8,
        lastExecutedAt: Date.now() - 3 * DAY_MS
      }),
      hourDistribution30: Array.from({ length: 24 }, () => 0),
      dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
      timeSlotDistribution30: { morning, afternoon, evening: 0, night: 0 }
    })
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (keys: Array<{ itemId: string }>): Promise<UsageBehaviorRow[]> =>
        keys.map((key) =>
          key.itemId === 'morning-app' ? slotRow(key.itemId, 10, 2) : slotRow(key.itemId, 2, 10)
        )
    )
    const engine = new RecommendationEngine(dbUtils as never)
    const contexts = [morningContext, afternoonContext]
    // Both candidates carry identical habit strength (same base/counts/days/age); only the
    // time-of-day spread differs. The engine reads it from `behavior` (the dated 30-day
    // distribution), so the slot switch is what flips the order.
    const getCandidates = vi.fn(async () => ({
      items: [
        {
          sourceId: 'app-provider',
          itemId: 'morning-app',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('morning-app', { executeCount: 4 }),
          behavior: slotRow('morning-app', 10, 2)
        },
        {
          sourceId: 'app-provider',
          itemId: 'afternoon-app',
          sourceType: 'app',
          source: 'frequent',
          usageStats: createUsageStats('afternoon-app', { executeCount: 4 }),
          behavior: slotRow('afternoon-app', 2, 10)
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

    expect(first.items[0]?.scoring?.final).toBeGreaterThan(0)
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
      ]),
      // getTimeBasedTopItems now joins the same dated behaviour read; the healthy row needs real
      // 30-day facts (>=10 exec / >=3 days) AND a slot distribution, or its time score is zero.
      getUsageBehaviorBatch: vi.fn(
        async (keys: Array<{ itemId: string }>): Promise<UsageBehaviorRow[]> =>
          keys.map((key) => ({
            ...createBehaviorRow(key.itemId, {
              executeCount: 12,
              executeCount30: 12,
              executeCount7: 4,
              activeDays30: 4,
              decayedExecuteScore30: 8,
              lastExecutedAt: Date.now() - 3 * DAY_MS
            }),
            timeSlotDistribution30: { morning: 12, afternoon: 0, evening: 0, night: 0 }
          }))
      )
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

  it('refills the grid from the fallback when only part of the ranking rebuilds', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/Cold1.app', 10 * DAY_MS, 1),
        createCatalogApp('/Applications/Cold2.app', 20 * DAY_MS, 2),
        createCatalogApp('/Applications/Cold3.app', 30 * DAY_MS, 3)
      ],
      {}
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getCandidates: vi.fn(async () => ({
        items: createCandidates(['survives', 'broken-a', 'broken-b', 'broken-c']),
        perf: candidatePerf(4)
      })),
      itemRebuilder: createPartialRebuilder(['broken-a', 'broken-b', 'broken-c'])
    })

    const result = await engine.recommend({ limit: 4 })

    // Three of the four scored candidates could not render, and every slot is
    // still filled. Placement is not the claim here: the ranker's absolute scale
    // (~1e5 in this fixture) sits well above the cold-start band whether or not
    // the backfill is re-ranked, so the invariant that makes the survivor's lead
    // deliberate rather than lucky is pinned on its own below.
    expect(result.items.map((item) => item.id)).toEqual([
      'survives',
      '/Applications/Cold1.app',
      '/Applications/Cold2.app',
      '/Applications/Cold3.app'
    ])
  })

  it('ranks backfill under a survivor that scores below the fallback scale', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)
    // The two pools are not on one scale — cold-start items arrive at
    // COLD_START_BASE_SCORE (1e3) and frequent fallbacks at a raw execute count,
    // against a ranker that writes an absolute score. Nothing bounds a scored
    // survivor above them, and merging by raw score would let a rebuild failure
    // promote the backfill over the recommendation that survived it.
    const survivor = { id: 'survivor', source: { id: 'app-provider' }, scoring: { final: 12 } }
    Object.assign(engine as unknown as Record<string, unknown>, {
      resolveFallbackItems: vi.fn(async () => [
        { id: 'cold', source: { id: 'app-provider' }, scoring: { final: 1000 } }
      ])
    })

    const backfilled = await (
      engine as unknown as {
        backfillShortfall: (
          items: unknown[],
          pinned: unknown[],
          limit: number
        ) => Promise<Array<{ id: string; scoring: { final: number } }>>
      }
    ).backfillShortfall([survivor], [], 2)

    expect(backfilled.map((item) => item.id)).toEqual(['survivor', 'cold'])
    // The order above only survives combineRecommendedWithPinned's re-sort
    // because the score says so, so that is what gets asserted.
    expect(backfilled[1]?.scoring.final).toBeLessThan(survivor.scoring.final)
  })

  it('keeps backfill in the fallback band under a normally scored survivor', async () => {
    const engine = new RecommendationEngine(createDbUtils() as never)
    // The ranker's terms are banded by decade — frequency at 1e4, time relevance at 1e5, novelty
    // at 1e7 — and cold-start sits at 1e3 so that it lands under all of them. A survivor with any
    // real usage therefore scores far above the fallback pool, and the rewrite has nothing to
    // correct. Pulling the backfill up to just under such a survivor would still order correctly,
    // but the score is persisted: recommendation_cache would then hold a never-used app at ~3e5,
    // indistinguishable from a daily habit to anyone reading the row.
    const survivor = { id: 'survivor', source: { id: 'app-provider' }, scoring: { final: 3e5 } }
    Object.assign(engine as unknown as Record<string, unknown>, {
      resolveFallbackItems: vi.fn(async () => [
        { id: 'cold-1', source: { id: 'app-provider' }, scoring: { final: 1000 } },
        { id: 'cold-2', source: { id: 'app-provider' }, scoring: { final: 999 } }
      ])
    })

    const backfilled = await (
      engine as unknown as {
        backfillShortfall: (
          items: unknown[],
          pinned: unknown[],
          limit: number
        ) => Promise<Array<{ id: string; scoring: { final: number } }>>
      }
    ).backfillShortfall([survivor], [], 3)

    expect(backfilled.map((item) => item.id)).toEqual(['survivor', 'cold-1', 'cold-2'])
    for (const item of backfilled.slice(1)) {
      expect(item.scoring.final).toBeLessThan(COLD_START_BASE_SCORE)
    }
    expect(backfilled[1]!.scoring.final).toBeGreaterThan(backfilled[2]!.scoring.final)
  })

  it('leaves the fallback untouched when the rebuild filled every slot', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Cold.app', DAY_MS, 1)],
      {}
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getCandidates: vi.fn(async () => ({
        items: createCandidates(['a', 'b']),
        perf: candidatePerf(2)
      })),
      itemRebuilder: createPartialRebuilder([])
    })

    const result = await engine.recommend({ limit: 2 })

    expect(result.items).toHaveLength(2)
    expect(catalog.getFilesByType).not.toHaveBeenCalled()
  })

  it('counts pinned slots against the backfill budget', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/Cold1.app', 10 * DAY_MS, 1),
        createCatalogApp('/Applications/Cold2.app', 20 * DAY_MS, 2)
      ],
      {}
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getPinnedItems: vi.fn(async () => createCandidates(['pinned-app'])),
      getCandidates: vi.fn(async () => ({
        items: createCandidates(['survives', 'broken']),
        perf: candidatePerf(2)
      })),
      itemRebuilder: createPartialRebuilder(['broken'])
    })

    const result = await engine.recommend({ limit: 3 })

    // The pin owns one of the three slots, so the shortfall is one, not two —
    // backfilling against the full limit would push the pin off the grid it is
    // pinned to. The retained pin leads the same sequence used by the grid and list.
    expect(result.items.map((item) => item.id)).toEqual([
      'pinned-app',
      'survives',
      '/Applications/Cold1.app'
    ])
  })

  it('does not read the fallback when pinned slots leave no shortfall', async () => {
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Cold.app', DAY_MS, 1)],
      {}
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getPinnedItems: vi.fn(async () => createCandidates(['pin-a', 'pin-b'])),
      getCandidates: vi.fn(async () => ({
        items: createCandidates(['survives', 'broken']),
        perf: candidatePerf(2)
      })),
      itemRebuilder: createPartialRebuilder(['broken'])
    })

    const result = await engine.recommend({ limit: 3 })

    // Two pins claim two of the three slots and the one survivor fills the
    // third, so there is no shortfall. Sizing the budget against the full limit
    // would fetch and rebuild a cold-start list that combine then discards —
    // invisible in the grid, and a wasted catalog read on every request.
    expect(result.items.map((item) => item.id)).toEqual(['pin-a', 'pin-b', 'survives'])
    expect(catalog.getFilesByType).not.toHaveBeenCalled()
  })

  it('does not spend a backfill slot on something already in the grid', async () => {
    const dbUtils = createDbUtils()
    // The freshest catalog app is the one candidate that did rebuild, so the
    // fallback offers it back under the identity it already occupies.
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/Shared.app', 10 * DAY_MS, 1),
        createCatalogApp('/Applications/Cold2.app', 20 * DAY_MS, 2),
        createCatalogApp('/Applications/Cold3.app', 30 * DAY_MS, 3)
      ],
      {}
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)

    stubDimensions(engine, {
      getCandidates: vi.fn(async () => ({
        items: createCandidates(['/Applications/Shared.app', 'broken']),
        perf: candidatePerf(2)
      })),
      itemRebuilder: createPartialRebuilder(['broken'])
    })

    const result = await engine.recommend({ limit: 3 })

    // Deduping only after the slice would let the repeat consume a slot and
    // silently hand back a short grid, which is the defect being fixed.
    expect(result.items.map((item) => item.id)).toEqual([
      '/Applications/Shared.app',
      '/Applications/Cold2.app',
      '/Applications/Cold3.app'
    ])
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
      registerPluginProvider(engine, 'demo-plugin', {
        id: `provider-${i}`,
        canProvide: () => true,
        onExecute: () => true,
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

  it('drops a provider whose async canProvide refuses, without disturbing the others', async () => {
    // `canProvide` may answer asynchronously. A provider that says no must contribute nothing —
    // not an empty row, and not a reason for another provider's candidates to be dropped.
    const engine = new RecommendationEngine(createDbUtils() as never)
    let refusedCandidatesAsked = 0

    registerPluginProvider(engine, 'demo-plugin', {
      id: 'refusing',
      canProvide: async () => false,
      onExecute: () => true,
      getCandidates: async () => {
        refusedCandidatesAsked += 1
        return [{ id: 'should-never-appear', title: 'Never', action: 'open' }]
      }
    } as never)
    registerPluginProvider(engine, 'demo-plugin', {
      id: 'accepting',
      canProvide: async () => true,
      onExecute: () => true,
      getCandidates: async () => [{ id: 'kept', title: 'Kept', action: 'open' }]
    } as never)

    const candidates = (await (
      engine as unknown as {
        getPluginCandidates: (context: unknown) => Promise<Array<{ itemId: string }>>
      }
    ).getPluginCandidates(morningContext)) as Array<{ itemId: string }>

    expect(candidates.map((c) => c.itemId)).toEqual(['kept'])
    // Refusing before the fetch is the contract: the provider is not asked for candidates at all.
    expect(refusedCandidatesAsked).toBe(0)
  })

  it('times out one slow provider without discarding the others it was polled beside', async () => {
    vi.useFakeTimers()
    try {
      const engine = new RecommendationEngine(createDbUtils() as never)
      registerPluginProvider(engine, 'demo-plugin', {
        id: 'slow',
        canProvide: () => true,
        onExecute: () => true,
        // Never answers: the shared per-provider deadline has to cut it off.
        getCandidates: () => new Promise(() => {})
      } as never)
      registerPluginProvider(engine, 'demo-plugin', {
        id: 'fast',
        canProvide: () => true,
        onExecute: () => true,
        getCandidates: async () => [{ id: 'fast-candidate', title: 'Fast', action: 'open' }]
      } as never)

      const pending = (
        engine as unknown as {
          getPluginCandidates: (context: unknown) => Promise<Array<{ itemId: string }>>
        }
      ).getPluginCandidates(morningContext)
      await vi.advanceTimersByTimeAsync(250)

      const candidates = await pending
      // The hung provider contributes nothing; the healthy one still lands.
      expect(candidates.map((c) => c.itemId)).toEqual(['fast-candidate'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timeout timer when a provider answers in time', async () => {
    // The race armed a 200ms setTimeout per provider and never cleared it on the
    // winning path, leaving a pending timer per call keeping the loop awake (#674).
    vi.useFakeTimers()
    try {
      const engine = new RecommendationEngine(createDbUtils() as never)

      for (let i = 0; i < 3; i++) {
        registerPluginProvider(engine, 'demo-plugin', {
          id: `prompt-${i}`,
          canProvide: () => true,
          onExecute: () => true,
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
      registerPluginProvider(engine, 'demo-plugin', {
        id: `ordered-${index}`,
        canProvide: () => true,
        onExecute: () => true,
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
    const ids = result.items.map((item) => item.id)

    expect(ids[0]).toBe('/Applications/Fresh.app')
    expect(ids.indexOf('/Applications/Habit.app')).toBe(1)
    expect(result.items[0]?.meta?.recommendation).toMatchObject({ source: 'newly-installed' })
  })

  it('ends app novelty on the catalog identity, not the path', async () => {
    // AC11: the first real execution is written under the source-declared catalog identity
    // (`appIdentity`), which differs from the file path. The novelty gate must join on that same
    // bucket — keying on the path would miss the row a first open just wrote and keep suggesting an
    // app the user has already used.
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [createCatalogApp('/Applications/Calc.app', 2 * HOUR_MS, 1)],
      { 1: 2 * HOUR_MS },
      { 1: { appIdentity: 'com.example.calc' } }
    )
    dbUtils.getUsageStatsBatch = vi.fn(async () => [
      {
        ...createUsageStats('com.example.calc', { executeCount: 1 }),
        sourceId: 'app-provider',
        itemId: 'com.example.calc'
      }
    ]) as never
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)
    stubDimensions(engine, {
      getCandidates: vi.fn(async () => ({ items: [], perf: candidatePerf(0, 0) }))
    })

    const newlyInstalled = await (
      engine as unknown as {
        getNewlyInstalledItems: (limit: number) => Promise<Array<{ itemId: string }>>
      }
    ).getNewlyInstalledItems(5)

    expect(newlyInstalled).toEqual([])
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

    // Only Fresh.app passes the gate. The other three still reach the grid, but
    // as cold-start backfill for the nine slots one candidate cannot fill — so
    // membership no longer distinguishes them, and the novelty label does.
    const newlyInstalled = result.items.filter(
      (item) =>
        (item.meta?.recommendation as { source?: string } | undefined)?.source === 'newly-installed'
    )
    expect(newlyInstalled.map((item) => item.id)).toEqual(['/Applications/Fresh.app'])
    expect(result.items[0]?.id).toBe('/Applications/Fresh.app')
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
    // The app has one accepted execution, so it is no longer unused novelty — the novelty boost is
    // gone and it must rank on its (thin) real history, losing to the established habit.
    dbUtils.getUsageStatsBatch = vi.fn(async () => [
      createUsageStats('/Applications/Fresh.app', {
        executeCount: 1,
        lastExecuted: new Date(Date.now() - 3 * HOUR_MS)
      })
    ])
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (keys: Array<{ itemId: string }>): Promise<UsageBehaviorRow[]> =>
        keys.map((key) =>
          key.itemId === '/Applications/Habit.app'
            ? createBehaviorRow(key.itemId, {
                executeCount: 40,
                executeCount30: 14,
                executeCount7: 5,
                activeDays30: 6,
                decayedExecuteScore30: 11,
                lastExecutedAt: Date.now() - 3 * DAY_MS - HOUR_MS
              })
            : createBehaviorRow(key.itemId, {
                executeCount: 1,
                executeCount30: 1,
                executeCount7: 1,
                activeDays30: 1,
                decayedExecuteScore30: 1,
                lastExecutedAt: Date.now() - 3 * DAY_MS - 3 * HOUR_MS
              })
        )
    )
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

    // The executed app is no longer "news": the habit leads, and Fresh carries no novelty label.
    expect(result.items[0]?.id).toBe('/Applications/Habit.app')
    const fresh = result.items.find((item) => item.id === '/Applications/Fresh.app')
    expect((fresh?.meta?.recommendation as { source?: string } | undefined)?.source).not.toBe(
      'newly-installed'
    )
  })

  it('caps unused novelty at one item once the user has real history', async () => {
    // AC11/R6: with behaviour history, the unused-app channel and the unused-file channel together
    // may leave at most ONE exploration item in the list. Extra installs are dropped, not demoted —
    // otherwise a pile of unused apps would compete with the habits the user actually reaches for.
    const dbUtils = createDbUtils()
    const catalog = createCatalogDbUtils(
      [
        createCatalogApp('/Applications/FreshA.app', 2 * HOUR_MS, 1),
        createCatalogApp('/Applications/FreshB.app', 2 * HOUR_MS, 2)
      ],
      { 1: 2 * HOUR_MS, 2: 2 * HOUR_MS }
    )
    const engine = new RecommendationEngine(dbUtils as never, catalog as never)
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (keys: Array<{ itemId: string }>): Promise<UsageBehaviorRow[]> =>
        keys.map((key) =>
          key.itemId === '/Applications/Habit.app'
            ? createBehaviorRow(key.itemId, {
                executeCount: 40,
                executeCount30: 14,
                executeCount7: 5,
                activeDays30: 6,
                decayedExecuteScore30: 11,
                lastExecutedAt: Date.now() - HOUR_MS
              })
            : createBehaviorRow(key.itemId)
        )
    )
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

    const result = await engine.recommend({ limit: 10 })

    const novelty = result.items.filter((item) => {
      const source = (item.meta?.recommendation as { source?: string } | undefined)?.source
      return source === 'newly-installed' || source === 'newly-added'
    })
    // Two fresh installs are available; exactly one may survive, and the habit always does.
    expect(novelty).toHaveLength(1)
    expect(result.items.map((item) => item.id)).toContain('/Applications/Habit.app')
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
    const ids = afterInstall.items.map((item) => item.id)

    // The invalidated row is not handed back, and the ranking the user sees is the freshly
    // computed one: the just-installed app leads it.
    expect(afterInstall.fromCache).toBe(false)
    expect(ids).not.toContain('/Applications/Stale.app')
    expect(ids[0]).toBe('/Applications/Fresh.app')
  })

  it('does not publish the pre-execute snapshot when an execute is accepted during the compute', async () => {
    // AC12: an execute accepted while a recommendation pass is already in flight must not be
    // published as the user's next snapshot. This is the during-compute case, not
    // invalidation-before-read: the pass has already started its behaviour read and is suspended
    // on it when the acceptance lands. The observable is the ranking the user sees: the pre-execute
    // read puts Alpha first, the post-execute read puts Beta first, so a stale publish is visible.
    const dbUtils = createDbUtils()
    const staleRead = Promise.withResolvers<ReturnType<typeof createBehaviorRow>[]>()

    let cachedItems: unknown[] | undefined
    dbUtils.setRecommendationCache = vi.fn(async (_cacheKey: string, items: unknown[]) => {
      cachedItems = items
    })

    const strongRow = (itemId: string) =>
      createBehaviorRow(itemId, {
        executeCount: 5,
        executeCount30: 5,
        executeCount7: 5,
        activeDays30: 3,
        decayedExecuteScore30: 4,
        lastExecutedAt: Date.now() - 3 * DAY_MS
      })
    const weakRow = (itemId: string) =>
      createBehaviorRow(itemId, {
        executeCount: 1,
        executeCount30: 1,
        executeCount7: 1,
        activeDays30: 1,
        decayedExecuteScore30: 1,
        lastExecutedAt: Date.now() - 3 * DAY_MS
      })

    // Suspend on the candidate-pass read (the one that asks for Alpha/Beta), not on a global read
    // count: a pass now reads behaviour from several dimensions, and pinning "read #1" would break
    // on any internal re-ordering.
    let suspended = false
    dbUtils.getUsageBehaviorBatch = vi.fn(
      async (keys: Array<{ sourceId: string; itemId: string }>): Promise<UsageBehaviorRow[]> => {
        if (!suspended && keys.some((key) => key.itemId.includes('Alpha'))) {
          suspended = true
          // The pre-execute snapshot: Alpha is the habit.
          return await staleRead.promise
        }
        // Every later read is the real database after the accepted write: Beta has become the habit.
        return keys.map((key) =>
          key.itemId.includes('Beta') ? strongRow(key.itemId) : weakRow(key.itemId)
        )
      }
    )

    const engine = new RecommendationEngine(dbUtils as never, createCatalogDbUtils([], {}) as never)
    // The real getCandidates runs: its single behaviour read is what we suspend. Only the
    // dimensions that would read other tables are stubbed.
    Object.assign(engine as unknown as Record<string, unknown>, {
      contextProvider: {
        getCurrentContext: vi.fn(async () => morningContext),
        generateCacheKey: () => 'inflight-key'
      },
      scheduleTrendBackfill: vi.fn(),
      getPinnedItems: vi.fn(async () => []),
      getFrequentItems: vi.fn(async () =>
        ['Alpha', 'Beta'].map((name) => ({
          sourceId: 'app-provider',
          itemId: `/Applications/${name}.app`,
          sourceType: 'application',
          usageStats: createUsageStats(`/Applications/${name}.app`, { executeCount: 5 })
        }))
      ),
      getRecentItems: vi.fn(async () => []),
      getTimeBasedTopItems: vi.fn(async () => []),
      getTrendingItems: vi.fn(async () => ({
        items: [],
        perf: { durationMs: 0, rowCount: 0, ready: true }
      })),
      getPluginCandidates: vi.fn(async () => [])
    })

    const inFlight = engine.recommend({ limit: 5 })
    // The pass is suspended inside its behaviour read; now accept the execute.
    await vi.waitFor(() => expect(dbUtils.getUsageBehaviorBatch).toHaveBeenCalled())
    engine.invalidateCache()

    // The stale read lands after the acceptance. It must not be published.
    staleRead.resolve([strongRow('/Applications/Alpha.app'), weakRow('/Applications/Beta.app')])
    const result = await inFlight

    // What the user sees first reflects the post-acceptance facts. A missing generation recheck
    // would publish the pre-execute pass, where Alpha is still the habit.
    expect(result.items.map((item) => item.id)[0]).toBe('/Applications/Beta.app')

    // And the snapshot written to the persistent cache carries the same post-acceptance ranking, so
    // a warm reopen cannot resurrect the pre-execute order.
    expect(cachedItems).toBeDefined()
    expect((cachedItems![0] as { id?: string } | undefined)?.id).toBe('/Applications/Beta.app')
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

  describe('plugin recommendation execute dispatch', () => {
    const CANDIDATE_ID = 'open-project'

    /**
     * Register a provider, then run one recommendation pass so the host takes its candidate
     * snapshot — the snapshot is what dispatch trusts, and the pass is the only thing that fills it.
     */
    async function withRegisteredProvider(
      onExecute: (candidate: unknown, args: unknown) => unknown
    ): Promise<{
      engine: RecommendationEngine
      /** The rebuilt card, as the host published it to the renderer. */
      card: TuffItem
    }> {
      const engine = new RecommendationEngine(createDbUtils() as never)
      registerPluginProvider(engine, 'demo-plugin', {
        id: 'demo-provider',
        canProvide: () => true,
        onExecute,
        getCandidates: async () => [{ id: CANDIDATE_ID, title: 'Open Project', action: 'open' }]
      })
      // Stub every DB-reading dimension but leave `getPluginCandidates` real: the pass must reach
      // it to take the host snapshot the dispatch reads.
      Object.assign(engine as unknown as Record<string, unknown>, {
        contextProvider: {
          getCurrentContext: vi.fn(async () => morningContext),
          generateCacheKey: () => 'plugin-execute-key'
        },
        scheduleTrendBackfill: vi.fn(),
        getPinnedItems: vi.fn(async () => []),
        getFrequentItems: vi.fn(async () => []),
        getRecentItems: vi.fn(async () => []),
        getTimeBasedTopItems: vi.fn(async () => []),
        getTrendingItems: vi.fn(async () => ({
          items: [],
          perf: { durationMs: 0, rowCount: 0, ready: true }
        }))
      })

      const result = await engine.recommend({ limit: 5 })
      const card = result.items.find((item) => item.id === CANDIDATE_ID)
      if (!card) throw new Error('plugin candidate was not rebuilt into a card')
      return { engine, card }
    }

    function executeViaSource(
      _engine: RecommendationEngine,
      card: TuffItem,
      actionId?: string
    ): Promise<{ accepted: boolean }> {
      const entry = recommendationSourceRegistry.resolve(card.source.id)
      if (!entry?.execute) throw new Error('plugin source did not register an execute path')
      return entry.execute({ item: card, actionId })
    }

    it('counts the run when the provider accepts its own candidate', async () => {
      const onExecute = vi.fn(() => true)
      const { engine, card } = await withRegisteredProvider(onExecute)

      const outcome = await executeViaSource(engine, card, 'open')

      expect(outcome.accepted).toBe(true)
      // The provider sees the host-produced candidate, not the renderer's copy.
      expect(onExecute).toHaveBeenCalledWith(
        expect.objectContaining({ id: CANDIDATE_ID, action: 'open' }),
        expect.objectContaining({ item: expect.objectContaining({ id: CANDIDATE_ID }) })
      )
    })

    it('does not count when the provider returns false', async () => {
      const { engine, card } = await withRegisteredProvider(() => false)

      expect((await executeViaSource(engine, card, 'open')).accepted).toBe(false)
    })

    it('does not count when the provider throws', async () => {
      const { engine, card } = await withRegisteredProvider(() => {
        throw new Error('action failed')
      })

      expect((await executeViaSource(engine, card, 'open')).accepted).toBe(false)
    })

    it('does not dispatch a tampered card the provider never proposed', async () => {
      const onExecute = vi.fn(() => true)
      const { engine, card } = await withRegisteredProvider(onExecute)

      // The renderer renames the candidate. Dispatch resolves the snapshot by the original id,
      // finds nothing, and refuses rather than running the provider's action on a forged payload.
      const tampered: TuffItem = {
        ...card,
        meta: { ...card.meta, _originalItemId: 'forged-candidate' }
      }

      expect((await executeViaSource(engine, tampered, 'open')).accepted).toBe(false)
      expect(onExecute).not.toHaveBeenCalled()
    })
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
    semanticProfile: unknown
  ) => Promise<number>

  const semanticOff = {
    localVectorEnabled: false,
    aiRerankEnabled: false,
    aiEmbeddingEnabled: false
  }

  function scoreOf(engine: RecommendationEngine, candidate: unknown): Promise<number> {
    const score = (engine as unknown as { calculateRecommendationScore: ScoreFn })
      .calculateRecommendationScore
    return score.call(engine, candidate, morningContext, semanticOff, null)
  }

  const pluginCandidate = (
    priority: number,
    usageStats = createUsageStats('open-project', { executeCount: 0, lastExecuted: null }),
    behavior?: ReturnType<typeof createBehaviorRow>
  ): unknown => ({
    sourceId: 'plugin-recommend:demo',
    itemId: 'open-project',
    sourceType: 'plugin-recommend',
    usageStats,
    behavior,
    source: 'plugin',
    pluginCandidate: {
      providerId: 'demo',
      id: 'open-project',
      title: 'Open Project',
      action: 'open',
      priority
    }
  })

  // A typed record, not `unknown`: the recency-budget cases spread it, and spreading `unknown`
  // is a compile error rather than a silent widening.
  const heavilyUsedApp = (): Record<string, unknown> => ({
    sourceId: 'app-provider',
    itemId: '/Applications/Daily.app',
    sourceType: 'app',
    usageStats: createUsageStats('/Applications/Daily.app', {
      executeCount: 100,
      lastExecuted: new Date()
    }),
    behavior: createBehaviorRow('/Applications/Daily.app', {
      executeCount: 100,
      executeCount30: 40,
      executeCount7: 12,
      activeDays30: 20,
      decayedExecuteScore30: 36,
      lastExecutedAt: Date.now() - 3 * DAY_MS
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

  it('caps a declared priority so it cannot buy more than five points', async () => {
    // A million is not a habit: the manifest number is bounded at 5/100 of the behaviour scale.
    const engine = new RecommendationEngine(createDbUtils() as never)

    const atHundred = await scoreOf(engine, pluginCandidate(100))
    const atMillion = await scoreOf(engine, pluginCandidate(1_000_000))

    expect(atMillion).toBe(atHundred)
  })

  it('lets a plugin item climb once the user actually uses it', async () => {
    // The whole point of removing the short-circuit: real, dated executions — not the plugin's own
    // number — are what move an item up.
    const engine = new RecommendationEngine(createDbUtils() as never)

    const unused = await scoreOf(engine, pluginCandidate(50))
    const used = await scoreOf(
      engine,
      pluginCandidate(
        50,
        createUsageStats('open-project', { executeCount: 40, lastExecuted: new Date() }),
        createBehaviorRow('open-project', {
          executeCount: 40,
          executeCount30: 20,
          executeCount7: 6,
          activeDays30: 10,
          decayedExecuteScore30: 18,
          lastExecutedAt: Date.now() - 3 * DAY_MS
        })
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

  it('keeps the recency boost inside the automatic 100-point budget', async () => {
    // behaviour base (saturates at 80) + time (maxes at 20) already reach the automatic ceiling of
    // 100 on their own. The recency boost must be folded INTO that budget, not appended after it —
    // otherwise a just-used item would outrank an equally habitual one on nothing but the clock.
    const engine = new RecommendationEngine(createDbUtils() as never)
    const concentratedHours = Array.from({ length: 24 }, () => 0)
    concentratedHours[morningContext.time.hourOfDay] = 1_000
    const strongFacts = {
      executeCount: 5_000,
      executeCount30: 40,
      executeCount7: 12,
      activeDays30: 20,
      decayedExecuteScore30: 30,
      hourDistribution30: concentratedHours,
      dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
      timeSlotDistribution30: {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0
      }
    }
    ;(strongFacts.timeSlotDistribution30 as Record<string, number>)[morningContext.time.timeSlot] =
      40

    const saturatedWithoutRecency = {
      ...heavilyUsedApp(),
      behavior: {
        ...createBehaviorRow('/Applications/Daily.app', {}),
        ...strongFacts,
        lastExecutedAt: null
      }
    }
    const saturatedWithRecency = {
      ...heavilyUsedApp(),
      behavior: {
        ...createBehaviorRow('/Applications/Daily.app', {}),
        ...strongFacts,
        lastExecutedAt: Date.now()
      }
    }

    const withoutRecency = await scoreOf(engine, saturatedWithoutRecency)
    const withRecency = await scoreOf(engine, saturatedWithRecency)

    // behaviour + time alone stop short of the ceiling, so the recency boost is what reaches it...
    expect(withoutRecency).toBeLessThan(100 * 10_000)
    // ...and it is clamped there rather than appended past it.
    expect(withRecency).toBe(100 * 10_000)
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
    registerPluginProvider(engine, 'demo-plugin', {
      id,
      canProvide: () => true,
      onExecute: () => true,
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

  it('rejects a provider without onExecute rather than registering an inert card', () => {
    const engine = new RecommendationEngine(createDbUtils() as never)

    expect(() =>
      registerPluginProvider(engine, 'demo-plugin', {
        id: 'inert',
        canProvide: () => true,
        getCandidates: async () => []
      } as never)
    ).toThrow(/must implement onExecute/)
  })

  it('rejects a duplicate provider id without disturbing the incumbent source', () => {
    // Registration is source-first, so a conflicting id throws before the provider map is
    // touched: the incumbent must keep both its provider and its registered source.
    const engine = new RecommendationEngine(createDbUtils() as never)
    registerProvider(engine, 'dup', 1)
    const incumbent = recommendationSourceRegistry.resolve('plugin-recommend:dup')

    expect(() =>
      registerPluginProvider(engine, 'demo-plugin', {
        id: 'dup',
        canProvide: () => true,
        onExecute: () => true,
        getCandidates: async () => []
      } as never)
    ).toThrow(/already registered/)

    expect(recommendationSourceRegistry.resolve('plugin-recommend:dup')).toBe(incumbent)
  })
})

describe('RecommendationEngine fallback badges', () => {
  /** A stub rebuilder that mirrors the real one: it echoes the candidate's source into the badge. */
  function fallbackEngineWith(behaviorRow: ReturnType<typeof createBehaviorRow>) {
    const dbUtils = createDbUtils()
    dbUtils.getUsageBehaviorBatch = vi.fn(async (): Promise<UsageBehaviorRow[]> => [behaviorRow])
    const engine = new RecommendationEngine(dbUtils as never)
    Object.assign(engine as unknown as Record<string, unknown>, {
      getFrequentItems: vi.fn(async () => [
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Mission Control.app',
          sourceType: 'application',
          usageStats: createUsageStats('/Applications/Mission Control.app', { executeCount: 2 })
        }
      ]),
      itemRebuilder: {
        rebuildItems: async (items: Array<{ itemId: string; source: string; score: number }>) =>
          items.map((item) => ({
            id: item.itemId,
            kind: 'app',
            source: { id: 'app-provider', type: 'application', name: 'apps' },
            render: { mode: 'default', basic: { title: item.itemId } },
            scoring: { final: item.score },
            meta: {
              recommendation: {
                source: item.source,
                score: item.score,
                badge: {
                  text: `$i18n:coreBox.recommendation.badge.${item.source}`,
                  variant: item.source
                }
              }
            }
          }))
      }
    })
    return engine
  }

  const fallbackOf = (engine: RecommendationEngine): Promise<TuffItem[]> =>
    (
      engine as unknown as { getFallbackRecommendations: (limit: number) => Promise<TuffItem[]> }
    ).getFallbackRecommendations(5)

  it('keeps the badge the rebuilder wrote on usage-ranked fallback items', async () => {
    // `getFallbackRecommendations` used to overwrite `meta.recommendation` with a bare
    // `{ source: 'frequent' }` after the rebuild, so every tile the backfill supplied showed no
    // badge while its neighbours read "Frequent" and "Just installed". With real 5/3 dated facts
    // the item legitimately keeps the frequent label.
    const engine = fallbackEngineWith(
      createBehaviorRow('/Applications/Mission Control.app', {
        executeCount: 5,
        executeCount30: 5,
        executeCount7: 3,
        activeDays30: 3,
        decayedExecuteScore30: 4,
        lastExecutedAt: Date.now() - 3 * DAY_MS
      })
    )

    const items = await fallbackOf(engine)

    expect(items).toHaveLength(1)
    expect(items[0]?.meta?.recommendation).toMatchObject({
      source: 'frequent',
      badge: { variant: 'frequent' }
    })
  })

  it('does not let an unqualified fallback item claim the frequent label', async () => {
    // Same rebuild path, but the ledger only supports "recent": the fallback must relabel it rather
    // than keep a habit label the evidence does not reach (R9).
    const engine = fallbackEngineWith(
      createBehaviorRow('/Applications/Mission Control.app', {
        executeCount: 4,
        executeCount30: 4,
        executeCount7: 2,
        activeDays30: 2,
        decayedExecuteScore30: 3,
        lastExecutedAt: Date.now() - 3 * DAY_MS
      })
    )

    const items = await fallbackOf(engine)

    expect(items[0]?.meta?.recommendation).toMatchObject({ source: 'recent' })
  })
})

describe('RecommendationEngine unified recommendation sequence', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  async function sceneEngine(
    contexts: ContextSignal[],
    events: RecommendationHistoryEvent[],
    {
      recall = [],
      pinned = []
    }: {
      recall?: Array<Omit<ScoredItem, 'score' | 'source'>>
      pinned?: Array<Omit<ScoredItem, 'score' | 'source'>>
    } = {},
    dbUtils = createDbUtils()
  ) {
    const engine = new RecommendationEngine(dbUtils as never)
    const { ItemRebuilder } = await vi.importActual<typeof ItemRebuilderModule>('./item-rebuilder')
    const lastContext = contexts.at(-1) ?? morningContext
    const provider = new ContextProvider()
    dbUtils.getRecommendationHistory.mockResolvedValue(events)
    dbUtils.getUsageStatsBatch.mockImplementation(async (keys) =>
      keys.flatMap((key) => {
        const accepted = events.filter(
          (row) => row.sourceId === key.sourceId && row.itemId === key.itemId
        )
        if (accepted.length === 0) return []
        return [
          createUsageStats(key.itemId, {
            executeCount: accepted.length,
            lastExecuted: new Date(Math.max(...accepted.map((row) => row.timestamp)))
          })
        ]
      })
    )
    if (events.length > 0) {
      dbUtils.getUsageBehaviorBatch.mockImplementation(async (keys) =>
        keys.flatMap((key) => {
          const accepted = events.filter(
            (row) => row.sourceId === key.sourceId && row.itemId === key.itemId
          )
          if (accepted.length === 0) return []
          return [
            createBehaviorRow(key.itemId, {
              executeCount: accepted.length,
              executeCount30: accepted.length,
              executeCount7: accepted.filter((row) => row.timestamp >= Date.now() - 7 * DAY_MS)
                .length,
              activeDays30: new Set(accepted.map((row) => new Date(row.timestamp).toDateString()))
                .size,
              lastExecutedAt: Math.max(...accepted.map((row) => row.timestamp)),
              decayedExecuteScore30: accepted.reduce(
                (sum, row) =>
                  sum + Math.exp((-BEHAVIOR_DECAY_LAMBDA * (Date.now() - row.timestamp)) / DAY_MS),
                0
              )
            })
          ]
        })
      )
    }
    stubDimensions(engine, {
      contextProvider: {
        getCurrentContext: async () => contexts.shift() ?? lastContext,
        generateCacheKey: (signal: ContextSignal) => provider.generateCacheKey(signal)
      },
      itemRebuilder: new ItemRebuilder(),
      getFrequentItems: async () => recall,
      getNewlyInstalledItems: async () => [],
      getNewlyAddedFileItems: async () => [],
      getPinnedItems: async () => pinned
    })
    const ids = new Set([
      ...events.map((row) => row.itemId),
      ...recall.map((row) => row.itemId),
      ...pinned.map((row) => row.itemId)
    ])
    recommendationSourceRegistry.unregister('app-provider')
    pluginProviderDisposers.push(
      recommendationSourceRegistry.registerSource({
        sourceId: 'app-provider',
        rebuild: async (requested) =>
          [...requested]
            .reverse()
            .filter((id) => ids.has(id))
            .map(
              (id) =>
                ({
                  id,
                  kind: id.startsWith('file-')
                    ? 'file'
                    : id.startsWith('folder-')
                      ? 'folder'
                      : 'app',
                  source: { id: 'app-provider', type: 'application', name: 'Applications' },
                  render: { mode: 'default', basic: { title: id } }
                }) as TuffItem
            )
      })
    )
    return engine
  }

  function history(
    itemId: string,
    daysAgo: number,
    previousApp: string | null
  ): RecommendationHistoryEvent {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    return {
      sourceId: 'app-provider',
      itemId,
      sourceType: 'application',
      timestamp: date.getTime(),
      previousApp
    }
  }

  const appContext = (bundleId: string, name: string): ContextSignal => ({
    ...morningContext,
    time: { ...morningContext.time, hourOfDay: 9 },
    foregroundApp: { bundleId, name }
  })

  it('recalls a preferred target absent from global candidates and retains its evidence on warm reads', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const events = [
      ...[1, 2, 3, 4, 5].map((day) => history('scene-only', day, 'com.example.editor')),
      ...Array.from({ length: 20 }, (_, index) =>
        history('background', 2 + (index % 8), 'com.example.browser')
      )
    ]
    const engine = await sceneEngine([appContext('com.example.editor', 'Editor')], events)

    const cold = await engine.recommend({ limit: 10 })
    const warm = await engine.recommend({ limit: 10 })
    const coldItem = cold.items.find((item) => item.id === 'scene-only')
    const warmItem = warm.items.find((item) => item.id === 'scene-only')

    expect(coldItem?.meta?.recommendation).toMatchObject({
      source: 'app-context',
      evidence: {
        sourceApp: { bundleId: 'com.example.editor', executeCount: 5, activeDays: 5 },
        yesterday: { executeCount: 1 }
      }
    })
    expect(warm.fromCache).toBe(true)
    expect(warmItem?.meta?.recommendation?.evidence).toEqual(
      coldItem?.meta?.recommendation?.evidence
    )
    expect(warm.items.map((item) => [item.id, item.scoring?.final])).toEqual(
      cold.items.map((item) => [item.id, item.scoring?.final])
    )
  })

  it('keeps app origins isolated even within the same time slot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const events = [
      ...[2, 3, 4, 5, 6].flatMap((day) => [
        history('editor-target', day, 'com.example.editor'),
        history('browser-target', day, 'com.example.browser')
      ])
    ]
    const engine = await sceneEngine(
      [
        appContext('com.example.editor', 'Editor'),
        appContext('com.example.browser', 'Browser'),
        appContext('com.example.editor', 'Editor')
      ],
      events
    )

    const editor = await engine.recommend({ limit: 1 })
    const browser = await engine.recommend({ limit: 1 })
    const editorAgain = await engine.recommend({ limit: 1 })

    expect(editor.items.map((item) => item.id)).toEqual(['editor-target'])
    expect(browser.items.map((item) => item.id)).toEqual(['browser-target'])
    expect(editorAgain.items.map((item) => item.id)).toEqual(['editor-target'])
    expect(browser.items[0]?.meta?.recommendation?.evidence?.sourceApp?.bundleId).toBe(
      'com.example.browser'
    )
  })

  it('preserves learned evidence through persisted cache without reusing a different origin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const events = [
      ...[2, 3, 4, 5, 6].flatMap((day) => [
        history('editor-target', day, 'com.example.editor'),
        history('browser-target', day, 'com.example.browser')
      ])
    ]
    const { dbUtils } = createKeyedCacheStore()
    const original = await sceneEngine(
      [appContext('com.example.editor', 'Editor')],
      events,
      {},
      dbUtils
    )
    const cold = await original.recommend({ limit: 1 })
    const reopened = await sceneEngine(
      [appContext('com.example.editor', 'Editor'), appContext('com.example.browser', 'Browser')],
      events,
      {},
      dbUtils
    )

    const persisted = await reopened.recommend({ limit: 1 })
    const otherOrigin = await reopened.recommend({ limit: 1 })

    expect(persisted.fromCache).toBe(true)
    expect(persisted.items.map((item) => item.id)).toEqual(['editor-target'])
    expect(persisted.items[0]?.meta?.recommendation?.evidence).toEqual(
      cold.items[0]?.meta?.recommendation?.evidence
    )
    expect(otherOrigin.items.map((item) => item.id)).toEqual(['browser-target'])
    expect(otherOrigin.items[0]?.meta?.recommendation?.evidence?.sourceApp?.bundleId).toBe(
      'com.example.browser'
    )
  })

  it('does not let an IDE-to-terminal preset overpower established accepted behavior', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const dbUtils = createDbUtils()
    const known = [
      createBehaviorRow('com.apple.Terminal', {
        executeCount: 1,
        executeCount30: 1,
        activeDays30: 1,
        lastExecutedAt: Date.now() - 3 * DAY_MS,
        decayedExecuteScore30: 1
      }),
      createBehaviorRow('established-workflow', {
        executeCount: 40,
        executeCount30: 40,
        activeDays30: 14,
        lastExecutedAt: Date.now() - HOUR_MS,
        decayedExecuteScore30: 30
      })
    ]
    dbUtils.getUsageBehaviorBatch.mockResolvedValue(known)
    const recall = createCandidates(['com.apple.Terminal', 'established-workflow']).map(
      (row, index) => ({
        ...row,
        usageStats: createUsageStats(row.itemId, { executeCount: known[index].executeCount })
      })
    )
    const engine = await sceneEngine(
      [appContext('com.microsoft.VSCode', 'Visual Studio Code')],
      [],
      { recall },
      dbUtils
    )

    const result = await engine.recommend({ limit: 2 })
    expect(result.items.map((item) => item.id)).toEqual([
      'established-workflow',
      'com.apple.Terminal'
    ])
    expect(result.items[0]?.scoring?.final).toBeGreaterThan(result.items[1]!.scoring!.final!)
  })

  it('does not reuse yesterday recall beyond its clock window or on a different local date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const events = [history('yesterday-only', 1, null)]
    const signal = { ...morningContext, time: { ...morningContext.time, hourOfDay: 9 } }
    const engine = await sceneEngine([signal], events)

    expect((await engine.recommend({ limit: 1 })).items.map((item) => item.id)).toEqual([
      'yesterday-only'
    ])
    vi.setSystemTime(new Date(2026, 9, 6, 10, 31))
    expect((await engine.recommend({ limit: 1 })).items).toEqual([])
    vi.setSystemTime(new Date(2026, 9, 7, 9, 30))
    expect((await engine.recommend({ limit: 1 })).items).toEqual([])
  })

  it('merges scene evidence into an already recalled identity instead of duplicating it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const events = [
      ...[1, 2, 3, 4, 5].map((day) => history('target', day, 'com.example.editor')),
      ...Array.from({ length: 20 }, (_, index) =>
        history('background', 2 + (index % 8), 'com.example.browser')
      )
    ]
    const dbUtils = createDbUtils()
    dbUtils.getUsageBehaviorBatch.mockResolvedValue([
      createBehaviorRow('target', {
        executeCount: 5,
        executeCount30: 5,
        activeDays30: 5,
        lastExecutedAt: events[0]!.timestamp,
        decayedExecuteScore30: 4
      })
    ])
    const engine = await sceneEngine(
      [appContext('com.example.editor', 'Editor')],
      events,
      {
        recall: createCandidates(['target'])
      },
      dbUtils
    )

    const result = await engine.recommend({ limit: 10 })
    const targetItems = result.items.filter((item) => item.id === 'target')
    expect(targetItems).toHaveLength(1)
    expect(targetItems[0]?.meta?.recommendation?.evidence).toMatchObject({
      executeCount: 5,
      sourceApp: { executeCount: 5, activeDays: 5 },
      yesterday: { executeCount: 1 }
    })
  })

  it('uses one pinned-first score-ordered sequence for grid, list and global indices', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const dbUtils = createDbUtils()
    const ids = [
      'file-report',
      'app-second',
      'folder-third',
      'app-fourth',
      'app-fifth',
      'app-sixth'
    ]
    dbUtils.getUsageBehaviorBatch.mockResolvedValue(
      ids.map((id, index) =>
        createBehaviorRow(id, {
          executeCount: 40 - index * 5,
          executeCount30: 40 - index * 5,
          activeDays30: 10,
          lastExecutedAt: Date.now() - HOUR_MS,
          decayedExecuteScore30: 30 - index * 4
        })
      )
    )
    const engine = await sceneEngine(
      [morningContext],
      [],
      {
        recall: createCandidates([...ids].reverse()).map((row) => ({
          ...row,
          usageStats: createUsageStats(row.itemId, {
            executeCount: 40 - ids.indexOf(row.itemId) * 5
          })
        })),
        pinned: createCandidates(['file-pin', 'app-pin'])
      },
      dbUtils
    )

    const result = await engine.recommend({ limit: 10 })
    const ordered = result.items.map((item) => item.id)
    const sections = result.containerLayout?.sections ?? []

    expect(ordered.slice(0, 2)).toEqual(['file-pin', 'app-pin'])
    expect(ordered.slice(2)).toEqual(ids)
    expect(new Set(ordered).size).toBe(ordered.length)
    expect(sections.map((section) => [section.id, section.layout, section.title])).toEqual([
      ['habitual', 'grid', '$i18n:coreBox.sections.habitual'],
      ['proposed', 'list', '$i18n:coreBox.sections.proposed']
    ])
    expect(sections[0]?.itemIds).toEqual(ordered.slice(0, 5))
    expect(sections[1]?.itemIds).toEqual(ordered.slice(5))
    expect(sections.flatMap((section) => section.itemIds)).toEqual(ordered)
    expect(result.items[0]?.kind).toBe('file')
    expect(result.items[2]?.kind).toBe('file')
    expect(result.items[4]?.kind).toBe('folder')
  })

  it('allows a single accepted execution into a short grid without calling it frequent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30))
    const dbUtils = createDbUtils()
    dbUtils.getUsageBehaviorBatch.mockResolvedValue([
      createBehaviorRow('single-use', {
        executeCount: 1,
        executeCount30: 1,
        activeDays30: 1,
        lastExecutedAt: Date.now() - HOUR_MS,
        decayedExecuteScore30: 1
      })
    ])
    const engine = await sceneEngine(
      [morningContext],
      [],
      {
        recall: createCandidates(['single-use']).map((row) => ({
          ...row,
          usageStats: createUsageStats(row.itemId, { executeCount: 1 })
        }))
      },
      dbUtils
    )

    const result = await engine.recommend({ limit: 10 })
    expect(result.items.map((item) => item.id)).toEqual(['single-use'])
    expect(
      result.containerLayout?.sections?.map((section) => [section.id, section.itemIds])
    ).toEqual([['habitual', ['single-use']]])
    expect(result.items[0]?.meta?.recommendation?.source).not.toBe('frequent')
    expect(result.items[0]?.meta?.recommendation?.evidence?.lastExecutedAt).toBe(
      Date.now() - HOUR_MS
    )
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

  it('drops an already-opened file so it stops being news', async () => {
    // First real open ends the novelty claim (AC11): the file must be reached through behaviour,
    // not through the "newly added" channel, so it is not returned at all.
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

    await expect(collect(4)).resolves.toEqual([])
  })

  it('still returns an untouched file with its (empty) usage row', async () => {
    // Positive control for the drop above: an un-opened file is still news, and it carries the
    // stats row so the scorer can tell "never opened" from "row missing".
    const { collect } = engineWith(
      [fileRow('/Users/x/Downloads/fresh.pdf', HOUR_MS)],
      [
        {
          ...createUsageStats('/Users/x/Downloads/fresh.pdf', {
            executeCount: 0,
            lastExecuted: null
          }),
          sourceId: 'file-provider',
          itemId: '/Users/x/Downloads/fresh.pdf'
        }
      ]
    )

    const [candidate] = await collect(4)

    expect(candidate?.itemId).toBe('/Users/x/Downloads/fresh.pdf')
    expect(
      (candidate as unknown as { usageStats: { executeCount: number } }).usageStats.executeCount
    ).toBe(0)
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
