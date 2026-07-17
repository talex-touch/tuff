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
    clearIndexingRuntime: vi.fn(),
    createDbUtils: vi.fn(),
    fileProviderResetDelegate: vi.fn(),
    forceFlushUsageQueue: vi.fn(async () => undefined),
    getAllPinnedItems: vi.fn<() => Promise<PinnedItem[]>>(async () => []),
    getUsageStatsBatch: vi.fn<() => Promise<ItemUsageStat[]>>(async () => []),
    incrementUsageStats: vi.fn(async () => undefined),
    incrementUsageSummary: vi.fn(async () => undefined),
    incrementUsageTrendDaily: vi.fn(() => Promise.resolve()),
    indexingRuntimeSetStore: vi.fn(),
    indexingRuntimeSetTaskStateStore: vi.fn(),
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
    usageQueueEnqueue: vi.fn()
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
  databaseModule: { getAuxDb: vi.fn(() => ({})), getDb: vi.fn(() => ({})) }
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
  subscribeMainConfig: vi.fn(() => () => {})
}))
vi.mock('../addon/apps/app-provider', () => ({
  appProvider: { id: 'app-provider', onSearch: vi.fn(), supportedInputTypes: ['text'], type: 'app' }
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
    clear: state.clearIndexingRuntime,
    resetSourceRuntimeState: vi.fn(),
    setStore: state.indexingRuntimeSetStore,
    setTaskStateStore: state.indexingRuntimeSetTaskStateStore
  }
}))
vi.mock('./indexing-runtime-sources', () => ({
  registerCoreIndexedSources: state.registerCoreIndexedSources
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

import { SearchEngineCore } from './search-core'

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
  const core = SearchEngineCore.getInstance()

  beforeEach(() => {
    core.destroy()
    vi.clearAllMocks()
    state.transportHandlers.clear()
    state.searchUpdateCompletion.current = Promise.withResolvers<void>()
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

  afterEach(() => {
    core.destroy()
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

    const result = await core.search({ inputs: [], text: 'merge' } as TuffQuery)
    await state.searchUpdateCompletion.current.promise

    expect(result.items.map((item) => item.id)).toEqual(['exact-item', 'partial-item'])
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'first-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'second-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'broken-provider', status: 'error' })
      ])
    )
    expect(state.sendToWindow).toHaveBeenCalledWith(
      7,
      CoreBoxEvents.search.update,
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
    )
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

  it('cleans initialized index and provider resources when the facade is destroyed', async () => {
    const providerDestroy = vi.fn()
    core.registerProvider({
      ...buildProvider(
        'destroyable-provider',
        vi.fn(async () => ({ items: [] }) as never)
      ),
      onDestroy: providerDestroy
    } as never)
    const togglePin = state.transportHandlers.get(CoreBoxEvents.item.togglePin) as
      | ((payload: { itemId: string; sourceId: string; sourceType: string }) => Promise<unknown>)
      | undefined

    expect(togglePin).toBeTypeOf('function')
    await expect(
      togglePin?.({ itemId: 'item-1', sourceId: 'provider-1', sourceType: 'app' })
    ).resolves.toEqual({
      isPinned: true,
      success: true
    })

    core.destroy()

    expect(state.togglePin).toHaveBeenCalledWith('provider-1', 'item-1', 'app')
    expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
    expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
    expect(state.fileProviderResetDelegate).toHaveBeenLastCalledWith(null)
    expect(state.forceFlushUsageQueue).toHaveBeenCalledTimes(1)
    expect(providerDestroy).toHaveBeenCalledTimes(1)
    expect(state.touchEventOff).toHaveBeenCalledWith('FILE_ADDED', expect.any(Function))
  })
})
