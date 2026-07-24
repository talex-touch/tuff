import type { IProviderActivate, TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type * as schema from '../../../db/schema'

type PinnedItem = typeof schema.pinnedItems.$inferSelect
type ItemUsageStat = typeof schema.itemUsageStats.$inferSelect
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

const state = vi.hoisted(() => {
  const transportHandlers = new Map<unknown, (...args: never[]) => unknown>()
  const searchUpdateCompletion = { current: Promise.withResolvers<void>() }

  return {
    transportHandlers,
    searchUpdateCompletion,
    addUsageLog: vi.fn(async () => undefined),
    appProviderPrepareForShutdown: vi.fn(async () => undefined),
    appProviderRuntimeDelegate: vi.fn(),
    appRuntimeAbortAndDrain: vi.fn<(sourceId: string, timeoutMs?: number) => Promise<void>>(
      async () => undefined
    ),
    appRuntimeDrainMutations: vi.fn(async () => undefined),
    clearIndexingRuntime: vi.fn(),
    createDbUtils: vi.fn(),
    fileProviderMutationDelegate: vi.fn(),
    fileProviderPersistencePort: vi.fn(),
    fileProviderPrepareForShutdown: vi.fn(async () => undefined),
    fileProviderResetDelegate: vi.fn(),
    forceFlushUsageQueue: vi.fn(async () => undefined),
    getAllPinnedItems: vi.fn<() => Promise<PinnedItem[]>>(async () => []),
    getUsageStatsBatch: vi.fn<() => Promise<ItemUsageStat[]>>(async () => []),
    incrementUsageStats: vi.fn(async () => undefined),
    incrementUsageSummary: vi.fn(async () => undefined),
    incrementUsageTrendDaily: vi.fn(() => Promise.resolve()),
    indexingRuntimeBeginShutdown: vi.fn(),
    indexingRuntimeDrainAdmittedTasks: vi.fn(async () => undefined),
    indexingRuntimeSetStore: vi.fn(),
    indexingRuntimeSetTaskStateStore: vi.fn(),
    indexingRuntimeSetWriterRouter: vi.fn(),
    invalidateRecommendationCache: vi.fn(),
    invalidateUsageStatsCache: vi.fn(),
    registerCoreIndexedSources: vi.fn(),
    sendToWindow: vi.fn((_windowId: unknown, event: { toEventName: () => string }) => {
      if (event.toEventName() === CoreBoxEvents.search.update.toEventName()) {
        state.searchUpdateCompletion.current.resolve()
      }
      return Promise.resolve()
    }),
    togglePin: vi.fn(async () => true),
    touchEventOff: vi.fn(),
    touchEventOn: vi.fn(),
    usageQueueEnqueue: vi.fn(),
    writerShutdown: vi.fn(async () => undefined)
  }
})

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    }))
  }))
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'ALL_MODULES_LOADED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED',
    FILE_ADDED: 'FILE_ADDED',
    FILE_CHANGED: 'FILE_CHANGED',
    FILE_UNLINKED: 'FILE_UNLINKED',
    FILE_WATCH_ROOT_RECOVERED: 'FILE_WATCH_ROOT_RECOVERED',
    PROVIDER_DEACTIVATED: 'PROVIDER_DEACTIVATED'
  },
  ProviderDeactivatedEvent: class {},
  touchEventBus: {
    emit: vi.fn(),
    off: state.touchEventOff,
    on: state.touchEventOn,
    once: vi.fn()
  }
}))

vi.mock('../../../db/utils', () => ({ createDbUtils: state.createDbUtils }))
vi.mock('../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    getStats: vi.fn(() => ({ queued: 0, processing: false, currentTaskLabel: null }))
  }
}))
vi.mock('../../../service/app-task-gate', () => ({
  appTaskGate: { getSnapshot: vi.fn(() => ({ activeCount: 0, activeLabels: {} })) }
}))
vi.mock('../../../utils/perf-context', () => ({ enterPerfContext: vi.fn(() => () => {}) }))
vi.mock('../../../utils/perf-monitor', () => ({
  perfMonitor: { getRecentEventLoopLagSnapshot: vi.fn(() => null) }
}))
vi.mock('../../analytics', () => ({ analyticsModule: { recordSearchMetrics: vi.fn() } }))
vi.mock('../../database', () => ({
  databaseModule: {
    getAuxDb: vi.fn(() => ({})),
    getDb: vi.fn(() => ({})),
    getSearchDb: vi.fn(() => ({})),
    getSearchClient: vi.fn(() => ({})),
    getSearchDatabaseFilePath: vi.fn(() => ':memory:'),
    isSearchSplitEnabled: vi.fn(() => false),
    isSearchDbReady: vi.fn(() => false)
  }
}))
vi.mock('../../plugin/adapters/plugin-features-adapter', () => ({
  default: {
    id: 'plugin-features',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'plugin'
  }
}))
vi.mock('../../sentry', () => ({
  getSentryService: vi.fn(() => ({ isTelemetryEnabled: vi.fn(() => false) }))
}))
vi.mock('../../storage', () => ({
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
  storageModule: {},
  isMainStorageReady: vi.fn(() => false),
  subscribeMainConfig: vi.fn(() => () => {}),
  OnboardingGateError: class OnboardingGateError extends Error {
    constructor(
      readonly decision: {
        state: 'blocked' | 'degraded'
        reason: string
        recoverable: boolean
      }
    ) {
      super(decision.reason)
    }
  },
  onboardingGate: {
    evaluate: vi.fn(() => ({ state: 'allowed' })),
    waitForDecision: vi.fn(async () => ({ state: 'allowed' })),
    subscribe: vi.fn(() => () => {})
  }
}))
vi.mock('../addon/apps/app-provider', () => ({
  appProvider: {
    id: 'app-provider',
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: state.appProviderPrepareForShutdown,
    setIndexedSourceRuntimeDelegate: state.appProviderRuntimeDelegate,
    supportedInputTypes: ['text'],
    type: 'app'
  }
}))
vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: {
    buildUnavailableNotice: vi.fn(() => null),
    id: 'everything-provider',
    isSearchReady: vi.fn(() => false),
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    buildStartupDegradedNotice: vi.fn(() => null),
    hasSearchFilters: vi.fn(() => false),
    id: 'file-provider',
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: state.fileProviderPrepareForShutdown,
    setFilePersistencePort: state.fileProviderPersistencePort,
    setIndexedSourceRuntimeMutationDelegate: state.fileProviderMutationDelegate,
    setIndexedSourceRuntimeResetDelegate: state.fileProviderResetDelegate,
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../addon/files/native-file-search-provider', () => ({
  linuxNativeFileProvider: { id: 'linux-file-provider', onSearch: vi.fn(), type: 'file' },
  macSpotlightFileProvider: { id: 'mac-file-provider', onSearch: vi.fn(), type: 'file' }
}))
vi.mock('../addon/preview', () => ({
  previewProvider: {
    id: 'preview-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'preview'
  }
}))
vi.mock('../addon/system/main-window-provider', () => ({
  mainWindowProvider: {
    id: 'main-window-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'command'
  }
}))
vi.mock('../addon/system/system-actions-provider', () => ({
  systemActionsProvider: {
    id: 'system-actions-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'command'
  }
}))
vi.mock('../addon/system/windows-shell-file-provider', () => ({
  windowsShellFileProvider: {
    id: 'windows-shell-file-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../core-box/window', () => ({
  windowManager: { current: { window: { id: 7, isDestroyed: () => false } } }
}))
vi.mock('./indexing-runtime', () => ({
  indexingRuntime: {
    abortAndDrainSourceScans: state.appRuntimeAbortAndDrain,
    beginShutdown: state.indexingRuntimeBeginShutdown,
    clear: state.clearIndexingRuntime,
    drainAdmittedTasks: state.indexingRuntimeDrainAdmittedTasks,
    drainSourceMutations: state.appRuntimeDrainMutations,
    resetSourceRuntimeState: vi.fn(),
    setSourceWriterRouter: state.indexingRuntimeSetWriterRouter,
    setStore: state.indexingRuntimeSetStore,
    setTaskStateStore: state.indexingRuntimeSetTaskStateStore
  }
}))
vi.mock('./indexing-runtime-sources', () => ({
  registerCoreIndexedSources: state.registerCoreIndexedSources
}))
vi.mock('./search-index-writer', () => ({
  LegacySearchIndexWriter: class {},
  SourceScopedIndexWriterRouter: class {},
  searchIndexWriter: {
    getFilePersistencePort: vi.fn(() => null),
    initialize: vi.fn(async () => undefined),
    shutdown: state.writerShutdown
  }
}))
vi.mock('./indexing-store-adapter', () => ({ SearchIndexStoreAdapter: class {} }))
vi.mock('./indexing-task-state-store', () => ({ SqliteIndexingTaskStateStore: class {} }))
vi.mock('./query-completion-service', () => ({
  QueryCompletionService: class {
    injectCompletionWeights = vi.fn(async () => undefined)
    recordCompletion = vi.fn(async () => undefined)
  }
}))
vi.mock('./recommendation/recommendation-engine', () => ({
  RecommendationEngine: class {
    invalidateCache = state.invalidateRecommendationCache
    recommend = vi.fn(async () => ({ containerLayout: undefined, duration: 0, items: [] }))
  }
}))
vi.mock('./search-activity', () => ({ markSearchActivity: vi.fn() }))
vi.mock('./search-index-service', () => ({
  SearchIndexService: class {
    preloadPinyin = vi.fn()
    warmup = vi.fn(async () => undefined)
  }
}))
vi.mock('./search-logger', () => ({
  searchLogger: {
    gathererStart: vi.fn(),
    providerCall: vi.fn(),
    providerError: vi.fn(),
    providerResult: vi.fn(),
    providerTimeout: vi.fn(),
    isEnabled: vi.fn(() => false),
    logSearchPhase: vi.fn(),
    searchProviders: vi.fn(),
    searchSessionEnd: vi.fn(),
    searchSessionStart: vi.fn(),
    searchUpdate: vi.fn()
  }
}))
vi.mock('./search-provider-config', () => ({ getSearchProviderUserConfigs: vi.fn(() => []) }))
vi.mock('./time-stats-aggregator', () => ({ TimeStatsAggregator: class {} }))
vi.mock('./usage-stats-cache', () => ({
  getUsageStatsBatchCached: state.getUsageStatsBatch,
  UsageStatsCache: class {
    invalidate = state.invalidateUsageStatsCache
  }
}))
vi.mock('./usage-stats-queue', () => ({
  UsageStatsQueue: class {
    enqueue = state.usageQueueEnqueue
    forceFlush = state.forceFlushUsageQueue
  }
}))
vi.mock('./usage-summary-service', () => ({
  UsageSummaryService: class {
    start = vi.fn()
    stop = vi.fn()
  }
}))
vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      isRegistered: vi.fn(() => false),
      unregister: vi.fn(),
      register: vi.fn(),
      start: vi.fn()
    }))
  }
}))
vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: (event: unknown, handler: (...args: never[]) => unknown) => {
      state.transportHandlers.set(event, handler)
    },
    sendToWindow: state.sendToWindow
  }))
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'en-US'),
    getPath: vi.fn(() => '/tmp'),
    commandLine: {
      appendSwitch: vi.fn()
    }
  },
  BrowserWindow: class BrowserWindow {},
  nativeTheme: {},
  powerSaveBlocker: {
    start: vi.fn(() => 1),
    stop: vi.fn(),
    isStarted: vi.fn(() => false)
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 100, height: 100 }
    }))
  },
  WebContentsView: class WebContentsView {}
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

import type { SearchEngineCore } from './search-core'

let core: SearchEngineCore
let searchIndexCommitHub: typeof import('./search-index-commit-hub').searchIndexCommitHub

function buildItem(id: string, providerId: string, title: string): TuffItem {
  return {
    id,
    kind: 'app',
    render: { basic: { title }, mode: 'default' },
    scoring: { final: 1 },
    source: { id: providerId, name: providerId, type: 'application' }
  }
}

function buildProvider(id: string, onSearch: () => Promise<TuffSearchResult>) {
  return {
    id,
    name: id,
    onSearch,
    priority: 'fast' as const,
    supportedInputTypes: ['text'],
    type: 'app'
  }
}

describe('SearchEngineCore facade contracts', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    state.transportHandlers.clear()
    state.searchUpdateCompletion.current = Promise.withResolvers<void>()
    const [searchIndexCommitHubModule, searchCoreModule] = await Promise.all([
      import('./search-index-commit-hub'),
      import('./search-core')
    ])
    searchIndexCommitHub = searchIndexCommitHubModule.searchIndexCommitHub
    core = searchCoreModule.SearchEngineCore.getInstance()
    state.createDbUtils.mockReturnValue({
      addUsageLog: state.addUsageLog,
      getAllPinnedItems: state.getAllPinnedItems,
      getUsageStatsBatch: state.getUsageStatsBatch,
      incrementUsageStats: state.incrementUsageStats,
      incrementUsageSummary: state.incrementUsageSummary,
      incrementUsageTrendDaily: state.incrementUsageTrendDaily,
      isPinned: vi.fn(async () => false),
      togglePin: state.togglePin
    })
    state.getAllPinnedItems.mockResolvedValue([])
    state.getUsageStatsBatch.mockResolvedValue([])
    state.togglePin.mockResolvedValue(true)
    core.init({ app: { channel: {} } } as never)
  })

  afterEach(async () => {
    const lifecycle = core as unknown as { destroying: boolean }
    if (!lifecycle.destroying) await core.destroy()
  })

  it('injects the App runtime delegate through SearchCore initialization', () => {
    expect(state.appProviderRuntimeDelegate).toHaveBeenCalledWith(
      expect.objectContaining({
        scan: expect.any(Function),
        reconcile: expect.any(Function),
        applyDelta: expect.any(Function)
      })
    )
  })

  it('deduplicates activations and limits the public provider pool to active providers', () => {
    const alpha = buildProvider('contract-alpha', vi.fn())
    const beta = buildProvider('contract-beta', vi.fn())
    core.registerProvider(alpha as never)
    core.registerProvider(beta as never)

    core.activateProviders([
      { id: 'contract-beta', meta: { feature: 'beta' } },
      { id: 'contract-alpha', meta: { feature: 'alpha' } },
      { id: 'contract-beta', meta: { feature: 'beta' } }
    ] as IProviderActivate[])

    expect(core.getActiveProviders().map((provider) => provider.id)).toEqual([
      'contract-beta',
      'contract-alpha'
    ])
    expect(core.getActivationState()).toEqual([
      { id: 'contract-beta', meta: { feature: 'beta' } },
      { id: 'contract-alpha', meta: { feature: 'alpha' } }
    ])
  })

  it('merges healthy provider results, ranks the exact match first, and isolates a failed provider', async () => {
    const exactItem = buildItem('exact-item', 'first-provider', 'merge')
    const partialItem = buildItem('partial-item', 'second-provider', 'merge archive')
    const first = buildProvider(
      'first-provider',
      vi.fn(async () => ({ items: [exactItem] }) as never)
    )
    const second = buildProvider(
      'second-provider',
      vi.fn(async () => ({ items: [partialItem] }) as never)
    )
    const broken = buildProvider(
      'broken-provider',
      vi.fn(async () => Promise.reject(new Error('offline')))
    )
    core.registerProvider(first as never)
    core.registerProvider(second as never)
    core.registerProvider(broken as never)
    core.activateProviders([
      { id: 'first-provider' },
      { id: 'second-provider' },
      { id: 'broken-provider' }
    ] as IProviderActivate[])
    state.getAllPinnedItems.mockResolvedValue([
      {
        itemId: 'exact-item',
        order: 0,
        pinnedAt: new Date(),
        sourceId: 'first-provider',
        sourceType: 'application'
      }
    ])
    state.getUsageStatsBatch.mockResolvedValue([
      {
        cancelCount: 0,
        createdAt: new Date(),
        executeCount: 3,
        itemId: 'exact-item',
        lastCancelled: null,
        lastExecuted: null,
        lastSearched: null,
        searchCount: 8,
        sourceId: 'first-provider',
        sourceType: 'application',
        updatedAt: new Date()
      }
    ])

    const snapshots: TuffSearchResult[] = []
    const result = await core.search({ inputs: [], text: 'merge' } as TuffQuery, {
      caller: { kind: 'core-box', id: 'core-box:contract' },
      sink: {
        snapshot: (snapshot) => {
          snapshots.push(snapshot)
        }
      }
    })

    expect(result.items.map((item) => item.id)).toEqual(['exact-item', 'partial-item'])
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'first-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'second-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'broken-provider', status: 'error' })
      ])
    )
    expect(snapshots).toEqual([
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'exact-item',
            meta: expect.objectContaining({
              pinned: expect.objectContaining({ isPinned: true }),
              usageStats: expect.objectContaining({ executeCount: 3, searchCount: 8 })
            })
          })
        ])
      })
    ])
  })

  it('records execution usage through the facade with the source-qualified item identity', async () => {
    const item = buildItem('executed-item', 'usage-provider', 'Open report')

    await core.recordExecute('session-usage-1', item)

    expect(state.addUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'execute',
        itemId: 'executed-item',
        sessionId: 'session-usage-1',
        source: 'application'
      })
    )
    expect(state.incrementUsageSummary).toHaveBeenCalledWith('executed-item')
    expect(state.usageQueueEnqueue).toHaveBeenCalledWith(
      'usage-provider',
      'executed-item',
      'application',
      'execute'
    )
    expect(state.incrementUsageTrendDaily).toHaveBeenCalledWith(
      'usage-provider',
      'executed-item',
      expect.any(Date)
    )
  })

  it('completes concurrent UI and AI searches with isolated sinks and activation snapshots', async () => {
    const uiSearch = vi.fn(
      async () =>
        ({
          items: [buildItem('ui-only-item', 'ui-provider', 'UI result')]
        }) as never
    )
    const aiSearch = vi.fn(
      async () =>
        ({
          items: [buildItem('ai-only-item', 'ai-provider', 'AI result')]
        }) as never
    )
    const uiActivations = [{ id: 'ui-provider', meta: { scope: 'ui' } }] as IProviderActivate[]
    const aiActivations = [{ id: 'ai-provider', meta: { scope: 'ai' } }] as IProviderActivate[]
    const uiDeliveries: Array<{ type: 'start' | 'snapshot' | 'complete'; sessionId: string }> = []

    core.registerProvider(buildProvider('ui-provider', uiSearch) as never)
    core.registerProvider(buildProvider('ai-provider', aiSearch) as never)

    const uiExecution = core.startSearch(
      { inputs: [], text: 'concurrent UI request' } as TuffQuery,
      {
        caller: { kind: 'core-box', id: 'core-box:facade-contract' },
        activations: uiActivations,
        sink: {
          start: (sessionId) => {
            uiDeliveries.push({ type: 'start', sessionId })
          },
          snapshot: (result) => {
            uiDeliveries.push({ type: 'snapshot', sessionId: result.sessionId! })
          },
          complete: ({ searchId, cancelled }) => {
            expect(cancelled).toBeUndefined()
            uiDeliveries.push({ type: 'complete', sessionId: searchId })
          }
        }
      }
    )
    const aiExecution = core.startSearch(
      { inputs: [], text: 'concurrent AI request' } as TuffQuery,
      {
        caller: { kind: 'ai-agent', id: 'agent:facade-contract' },
        activations: aiActivations
      }
    )

    const [uiResult, aiResult] = await Promise.all([uiExecution.result, aiExecution.result])
    await Promise.all([uiExecution.completed, aiExecution.completed])

    expect(uiExecution.sessionId).not.toBe(aiExecution.sessionId)
    expect(uiResult).toMatchObject({
      activate: uiActivations,
      items: [expect.objectContaining({ id: 'ui-only-item' })],
      sessionId: uiExecution.sessionId
    })
    expect(aiResult).toMatchObject({
      activate: aiActivations,
      items: [expect.objectContaining({ id: 'ai-only-item' })],
      sessionId: aiExecution.sessionId
    })
    expect(uiSearch).toHaveBeenCalledTimes(1)
    expect(aiSearch).toHaveBeenCalledTimes(1)
    expect(uiDeliveries).toEqual([
      { type: 'start', sessionId: uiExecution.sessionId },
      { type: 'snapshot', sessionId: uiExecution.sessionId },
      { type: 'complete', sessionId: uiExecution.sessionId }
    ])
    expect(state.sendToWindow).not.toHaveBeenCalled()
  })

  it('materializes each cache hit as a fresh detached search session result', async () => {
    const search = vi.fn(
      async () =>
        ({
          items: [buildItem('cached-item', 'cache-provider', 'Cached result')]
        }) as never
    )
    const snapshots: TuffSearchResult[] = []
    const query = { inputs: [], text: 'facade cache identity contract' } as TuffQuery

    core.registerProvider(buildProvider('cache-provider', search) as never)
    core.activateProviders([{ id: 'cache-provider' }] as IProviderActivate[])

    const first = core.startSearch(query, {
      caller: { kind: 'core-box', id: 'core-box:cache-first' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    const firstResult = await first.result
    await first.completed
    firstResult.items[0].render.basic!.title = 'Mutated first result'

    const second = core.startSearch(query, {
      caller: { kind: 'ai-agent', id: 'agent:cache-second' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    const secondResult = await second.result
    await second.completed

    expect(search).toHaveBeenCalledTimes(1)
    expect(first.sessionId).not.toBe(second.sessionId)
    expect(firstResult).toMatchObject({ sessionId: first.sessionId })
    expect(secondResult).toMatchObject({
      items: [expect.objectContaining({ id: 'cached-item' })],
      sessionId: second.sessionId
    })
    expect(secondResult).not.toBe(firstResult)
    expect(secondResult.items).not.toBe(firstResult.items)
    expect(secondResult.items[0]).not.toBe(firstResult.items[0])
    expect(secondResult.items[0].render.basic?.title).toBe('Cached result')
    expect(secondResult.sources).not.toBe(firstResult.sources)
    expect(snapshots.map((result) => result.sessionId)).toEqual([first.sessionId, second.sessionId])
  })

  it('does not cache a result that completed after its search revision was superseded', () => {
    const harness = core as unknown as {
      cacheSearchResult: (cacheKey: string, result: TuffSearchResult, revision: number) => void
      searchCache: Map<string, unknown>
    }
    const searchRevision = searchIndexCommitHub.getRevision()
    searchIndexCommitHub.markCommitted(['file-provider'])

    harness.cacheSearchResult(
      'stale-search-revision',
      {
        items: [buildItem('stale-item', 'stale-provider', 'Stale result')],
        sources: []
      } as unknown as TuffSearchResult,
      searchRevision
    )

    expect(harness.searchCache.has('stale-search-revision')).toBe(false)
  })

  it('does not reuse an identical query cache entry after an index commit revision advances', async () => {
    const search = vi.fn(
      async () =>
        ({ items: [buildItem('revision-item', 'revision-provider', 'Revision result')] }) as never
    )
    const query = { inputs: [], text: 'revision cache contract' } as TuffQuery
    core.registerProvider(buildProvider('revision-provider', search) as never)
    core.activateProviders([{ id: 'revision-provider' }] as IProviderActivate[])

    const first = core.startSearch(query, { caller: { kind: 'core-box', id: 'revision-first' } })
    await first.result
    await first.completed
    searchIndexCommitHub.markCommitted(['file-provider'])

    const second = core.startSearch(query, { caller: { kind: 'core-box', id: 'revision-second' } })
    await second.result
    await second.completed

    expect(search).toHaveBeenCalledTimes(2)
  })

  it('cleans initialized index and provider resources when the facade is destroyed', async () => {
    const providerDestroy = vi.fn()
    core.registerProvider({
      ...buildProvider(
        'destroyable-provider',
        vi.fn(async () => ({ items: [] }) as never)
      ),
      onDestroy: providerDestroy
    } as never)
    const togglePin = [...state.transportHandlers.entries()].find(([event]) => {
      const transportEvent = event as { toEventName?: () => string }
      return transportEvent.toEventName?.() === CoreBoxEvents.item.togglePin.toEventName()
    })?.[1] as
      | ((payload: { itemId: string; sourceId: string; sourceType: string }) => Promise<unknown>)
      | undefined

    expect(togglePin).toBeTypeOf('function')
    await expect(
      togglePin?.({ itemId: 'item-1', sourceId: 'provider-1', sourceType: 'app' })
    ).resolves.toEqual({
      isPinned: true,
      success: true
    })

    await core.destroy()

    expect(state.togglePin).toHaveBeenCalledWith('provider-1', 'item-1', 'app')
    expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
    expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
    expect(state.fileProviderResetDelegate).toHaveBeenLastCalledWith(null)
    expect(state.forceFlushUsageQueue).toHaveBeenCalledTimes(1)
    expect(providerDestroy).toHaveBeenCalledTimes(1)
    expect(state.touchEventOff).toHaveBeenCalledWith('FILE_ADDED', expect.any(Function))
  })

  it.each([
    {
      name: 'Runtime admitted task',
      reject: () =>
        state.indexingRuntimeDrainAdmittedTasks.mockRejectedValueOnce(
          new Error('admitted task drain failed')
        )
    },
    {
      name: 'App source mutation',
      reject: () =>
        state.appRuntimeDrainMutations.mockRejectedValueOnce(new Error('app mutation drain failed'))
    },
    {
      name: 'File producer',
      reject: () =>
        state.fileProviderPrepareForShutdown.mockRejectedValueOnce(new Error('file drain failed'))
    }
  ])(
    'fails closed when the $name drain rejects and allows a later teardown retry',
    async ({ reject }) => {
      const coreHarness = core as unknown as {
        providerRegistry: { destroy: () => Promise<void> }
      }
      const providerRegistryDestroy = vi.spyOn(coreHarness.providerRegistry, 'destroy')
      state.appProviderRuntimeDelegate.mockClear()
      state.fileProviderResetDelegate.mockClear()
      state.fileProviderMutationDelegate.mockClear()
      state.fileProviderPersistencePort.mockClear()

      reject()

      await expect(core.destroy()).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

      expect(providerRegistryDestroy).not.toHaveBeenCalled()
      expect(state.appProviderRuntimeDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderResetDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderMutationDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderPersistencePort).not.toHaveBeenCalledWith(null)
      expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
      expect(state.writerShutdown).not.toHaveBeenCalled()

      await core.destroy()

      expect(providerRegistryDestroy).toHaveBeenCalledTimes(1)
      expect(state.appProviderRuntimeDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderResetDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderMutationDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderPersistencePort).toHaveBeenCalledWith(null)
      expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
      expect(state.writerShutdown).toHaveBeenCalledTimes(1)
      providerRegistryDestroy.mockRestore()
    }
  )

  it.each([
    { name: 'App', sourceId: 'app-provider' },
    { name: 'File', sourceId: 'file-provider' }
  ])(
    'fails closed when the $name source scan abort drain times out, then succeeds after that scan releases',
    async ({ sourceId }) => {
      const scanDrainStarted = Promise.withResolvers<void>()
      const releaseTimedOutDrain = Promise.withResolvers<void>()
      const scanReleased = Promise.withResolvers<void>()
      let retryAfterRelease = false
      const coreHarness = core as unknown as {
        providerRegistry: { destroy: () => Promise<void> }
      }
      const providerRegistryDestroy = vi.spyOn(coreHarness.providerRegistry, 'destroy')
      state.appProviderRuntimeDelegate.mockClear()
      state.fileProviderResetDelegate.mockClear()
      state.fileProviderMutationDelegate.mockClear()
      state.fileProviderPersistencePort.mockClear()
      state.clearIndexingRuntime.mockClear()
      state.writerShutdown.mockClear()
      state.appRuntimeAbortAndDrain.mockImplementation(async (drainedSourceId: string) => {
        if (drainedSourceId !== sourceId) return
        if (!retryAfterRelease) {
          scanDrainStarted.resolve()
          await releaseTimedOutDrain.promise
          throw new Error(`INDEXED_SOURCE_SCAN_DRAIN_TIMEOUT:${sourceId}`)
        }
        await scanReleased.promise
      })

      try {
        const destroy = core.destroy()
        await scanDrainStarted.promise

        expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(1, 'app-provider')
        expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(2, 'file-provider')

        releaseTimedOutDrain.resolve()
        await expect(destroy).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

        expect(providerRegistryDestroy).not.toHaveBeenCalled()
        expect(state.appProviderRuntimeDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderResetDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderMutationDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderPersistencePort).not.toHaveBeenCalledWith(null)
        expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
        expect(state.writerShutdown).not.toHaveBeenCalled()

        retryAfterRelease = true
        scanReleased.resolve()
        await expect(core.destroy()).resolves.toBeUndefined()

        expect(providerRegistryDestroy).toHaveBeenCalledTimes(1)
        expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
        expect(state.writerShutdown).toHaveBeenCalledTimes(1)
      } finally {
        state.appRuntimeAbortAndDrain.mockImplementation(async () => undefined)
        providerRegistryDestroy.mockRestore()
      }
    }
  )

  it('stops App producers, aborts active App scans, and drains App mutations before clearing Runtime or shutting down the writer', async () => {
    const lifecycle: string[] = []
    const appProducerStopStarted = Promise.withResolvers<void>()
    const appProducerStop = Promise.withResolvers<void>()
    const appProducerStopped = Promise.withResolvers<void>()
    const initialAppScanController = new AbortController()
    const initialAppScanSettled = Promise.withResolvers<void>()
    const appRuntimeDrainStarted = Promise.withResolvers<void>()
    const appRuntimeDrain = Promise.withResolvers<void>()
    const appRuntimeDrained = Promise.withResolvers<void>()
    const appMutationDrainStarted = Promise.withResolvers<void>()
    const appMutationDrain = Promise.withResolvers<void>()
    const fileShutdownPreparationStarted = Promise.withResolvers<void>()
    const fileShutdownPreparation = Promise.withResolvers<void>()
    const fileShutdownPrepared = Promise.withResolvers<void>()
    const harness = core as unknown as {
      initialAppScanController: AbortController | null
      initialAppScanPromise: Promise<void> | null
    }

    initialAppScanController.signal.addEventListener(
      'abort',
      () => {
        lifecycle.push('app-scan-aborted')
        initialAppScanSettled.resolve()
      },
      { once: true }
    )
    harness.initialAppScanController = initialAppScanController
    harness.initialAppScanPromise = initialAppScanSettled.promise
    state.appProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('app-producer-stop-started')
      appProducerStopStarted.resolve()
      await appProducerStop.promise
      lifecycle.push('app-producer-stopped')
      appProducerStopped.resolve()
    })
    state.appRuntimeAbortAndDrain.mockImplementationOnce(async () => {
      lifecycle.push('app-runtime-drain-started')
      appRuntimeDrainStarted.resolve()
      await appRuntimeDrain.promise
      lifecycle.push('app-runtime-drained')
      appRuntimeDrained.resolve()
    })
    state.appRuntimeDrainMutations.mockImplementationOnce(async () => {
      lifecycle.push('app-mutation-drain-started')
      appMutationDrainStarted.resolve()
      await appMutationDrain.promise
      lifecycle.push('app-mutation-drained')
    })
    state.fileProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('file-shutdown-preparation-started')
      fileShutdownPreparationStarted.resolve()
      await fileShutdownPreparation.promise
      lifecycle.push('file-shutdown-prepared')
      fileShutdownPrepared.resolve()
    })
    state.clearIndexingRuntime.mockImplementationOnce(() => {
      lifecycle.push('runtime-cleared')
    })
    state.writerShutdown.mockImplementationOnce(async () => {
      lifecycle.push('writer-shut-down')
    })

    const destroy = core.destroy()
    await Promise.all([
      appProducerStopStarted.promise,
      appRuntimeDrainStarted.promise,
      fileShutdownPreparationStarted.promise
    ])

    expect(lifecycle).toEqual([
      'app-producer-stop-started',
      'app-scan-aborted',
      'app-runtime-drain-started',
      'file-shutdown-preparation-started'
    ])
    expect(initialAppScanController.signal.aborted).toBe(true)
    expect(state.appRuntimeAbortAndDrain).toHaveBeenCalledWith('app-provider')
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()

    appProducerStop.resolve()
    fileShutdownPreparation.resolve()
    await Promise.all([appProducerStopped.promise, fileShutdownPrepared.promise])

    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
    expect(state.writerShutdown).not.toHaveBeenCalled()
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()

    appRuntimeDrain.resolve()
    await Promise.all([appRuntimeDrained.promise, appMutationDrainStarted.promise])

    expect(state.appRuntimeDrainMutations).toHaveBeenCalledWith('app-provider')
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
    expect(state.writerShutdown).not.toHaveBeenCalled()

    appMutationDrain.resolve()
    await destroy

    expect(lifecycle).toEqual([
      'app-producer-stop-started',
      'app-scan-aborted',
      'app-runtime-drain-started',
      'file-shutdown-preparation-started',
      'app-producer-stopped',
      'file-shutdown-prepared',
      'app-runtime-drained',
      'app-mutation-drain-started',
      'app-mutation-drained',
      'runtime-cleared',
      'writer-shut-down'
    ])
  })

  it('rejects initialization after destruction as a terminal lifecycle', async () => {
    await core.destroy()

    expect(() => core.init({ app: { channel: {} } } as never)).toThrow('SEARCH_CORE_DESTROYED')
  })

  it('closes Runtime admission before producer shutdown and waits for admitted tasks and both source drains before clearing Runtime or its writer', async () => {
    const lifecycle: string[] = []
    const appScanController = new AbortController()
    const appScanSettled = Promise.withResolvers<void>()
    const appProducerStopped = Promise.withResolvers<void>()
    const fileShutdownStarted = Promise.withResolvers<void>()
    const releaseFileShutdown = Promise.withResolvers<void>()
    const fileShutdownPrepared = Promise.withResolvers<void>()
    const admittedDrainStarted = Promise.withResolvers<void>()
    const releaseAdmittedDrain = Promise.withResolvers<void>()
    const admittedDrainFinished = Promise.withResolvers<void>()
    const sourceDrainsStarted = Promise.withResolvers<void>()
    const harness = core as unknown as {
      initialAppScanController: AbortController | null
      initialAppScanPromise: Promise<void> | null
    }
    let sourceDrainCount = 0
    const recordSourceDrain = async (sourceId?: string): Promise<undefined> => {
      lifecycle.push(`source-drain:${sourceId}`)
      sourceDrainCount += 1
      if (sourceDrainCount === 2) sourceDrainsStarted.resolve()
      return undefined
    }

    appScanController.signal.addEventListener(
      'abort',
      () => {
        lifecycle.push('app-scan-stopped')
        appScanSettled.resolve()
      },
      { once: true }
    )
    harness.initialAppScanController = appScanController
    harness.initialAppScanPromise = appScanSettled.promise
    state.indexingRuntimeBeginShutdown.mockImplementationOnce(() => {
      lifecycle.push('admission-closed')
    })
    state.appProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('app-producer-stopped')
      appProducerStopped.resolve()
    })
    state.fileProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('file-shutdown-started')
      fileShutdownStarted.resolve()
      await releaseFileShutdown.promise
      lifecycle.push('file-shutdown-prepared')
      fileShutdownPrepared.resolve()
    })
    state.indexingRuntimeDrainAdmittedTasks.mockImplementationOnce(async () => {
      lifecycle.push('admitted-drain-started')
      admittedDrainStarted.resolve()
      await releaseAdmittedDrain.promise
      lifecycle.push('admitted-drain-finished')
      admittedDrainFinished.resolve()
    })
    state.appRuntimeDrainMutations
      .mockImplementationOnce(recordSourceDrain)
      .mockImplementationOnce(recordSourceDrain)
    state.clearIndexingRuntime.mockImplementationOnce(() => {
      lifecycle.push('runtime-cleared')
    })
    state.writerShutdown.mockImplementationOnce(async () => {
      lifecycle.push('writer-shut-down')
    })

    const destroy = core.destroy()
    await Promise.all([
      appProducerStopped.promise,
      appScanSettled.promise,
      fileShutdownStarted.promise,
      admittedDrainStarted.promise
    ])

    expect(lifecycle[0]).toBe('admission-closed')
    expect(lifecycle).toContain('app-producer-stopped')
    expect(lifecycle).toContain('app-scan-stopped')
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()

    releaseAdmittedDrain.resolve()
    await admittedDrainFinished.promise
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
    expect(state.writerShutdown).not.toHaveBeenCalled()

    releaseFileShutdown.resolve()
    await Promise.all([fileShutdownPrepared.promise, sourceDrainsStarted.promise])

    expect(state.appRuntimeDrainMutations).toHaveBeenNthCalledWith(1, 'app-provider')
    expect(state.appRuntimeDrainMutations).toHaveBeenNthCalledWith(2, 'file-provider')
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
    expect(state.writerShutdown).not.toHaveBeenCalled()

    await destroy

    expect(lifecycle.slice(-2)).toEqual(['runtime-cleared', 'writer-shut-down'])
  })

  it('rethrows a writer shutdown failure and retries the terminal teardown', async () => {
    state.writerShutdown.mockRejectedValueOnce(new Error('writer shutdown failed'))

    await expect(core.destroy()).rejects.toThrow('writer shutdown failed')

    expect(state.writerShutdown).toHaveBeenCalledTimes(1)

    await expect(core.destroy()).resolves.toBeUndefined()

    expect(state.writerShutdown).toHaveBeenCalledTimes(2)
  })
})
