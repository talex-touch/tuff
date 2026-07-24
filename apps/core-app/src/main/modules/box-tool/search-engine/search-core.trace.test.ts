import type { TuffQuery } from '@talex-touch/utils'
import { IndexedSourceReconcileReasons, TuffInputType } from '@talex-touch/utils'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appProviderPrepareForShutdownSpy,
  appProviderSetRuntimeDelegateSpy,
  fileProviderPrepareForShutdownSpy,
  fileProviderSetMutationDelegateSpy,
  fileProviderSetPersistencePortSpy,
  fileProviderSetResetDelegateSpy,
  infoSpy,
  searchIndexWriterGetFilePersistencePortSpy,
  searchIndexWriterShutdownSpy,
  transportOnSpy,
  warnSpy
} = vi.hoisted(() => ({
  appProviderPrepareForShutdownSpy: vi.fn(async () => undefined),
  appProviderSetRuntimeDelegateSpy: vi.fn(),
  fileProviderPrepareForShutdownSpy: vi.fn(async () => undefined),
  fileProviderSetMutationDelegateSpy: vi.fn(),
  fileProviderSetPersistencePortSpy: vi.fn(),
  fileProviderSetResetDelegateSpy: vi.fn(),
  infoSpy: vi.fn(),
  searchIndexWriterGetFilePersistencePortSpy: vi.fn(() => null),
  searchIndexWriterShutdownSpy: vi.fn(async () => undefined),
  transportOnSpy: vi.fn(),
  warnSpy: vi.fn()
}))

interface SearchCoreTraceHarness {
  logSearchTrace: (params: {
    event: string
    sessionId: string
    query: TuffQuery
    timings: Record<string, number>
    result: Record<string, number>
    sourceStats: Array<Record<string, unknown>>
    includeDetails: boolean
  }) => void
  _recordSearchMetrics: (params: {
    sessionId: string
    query: TuffQuery
    totalDuration: number
    firstResultMs: number
    firstResultCount: number
    sortingDuration: number
    usageStatsDuration: number
    completionDuration: number
    stageDurations: Record<string, number>
    sourceStats: Array<Record<string, unknown>>
    resultCount: number
    providerFilter?: string
  }) => void
}

const sentryServiceMock = vi.hoisted(() => ({
  isTelemetryEnabled: vi.fn(() => false),
  isEnabled: vi.fn(() => false),
  queueNexusTelemetry: vi.fn(),
  recordSearchMetrics: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: infoSpy,
    warn: warnSpy,
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }))
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

vi.mock('../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    FILE_ADDED: 'file-system/file-added',
    FILE_CHANGED: 'file-system/file-changed',
    FILE_UNLINKED: 'file-system/file-unlinked',
    DIRECTORY_ADDED: 'file-system/directory-added',
    DIRECTORY_UNLINKED: 'file-system/directory-unlinked',
    FILE_WATCH_ROOT_RECOVERED: 'file-system/watch-root-recovered'
  },
  touchEventBus: {
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  ProviderDeactivatedEvent: class {}
}))

vi.mock('../../../db/utils', () => ({
  createDbUtils: () => null
}))

vi.mock('../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    getStats: () => ({ queued: 3, processing: true, currentTaskLabel: 'analytics.cleanup' })
  }
}))

vi.mock('../../../service/app-task-gate', () => ({
  appTaskGate: {
    getSnapshot: () => ({
      activeCount: 1,
      activeLabels: {
        'AppProvider.fullSync': 1
      }
    })
  }
}))

vi.mock('../../../utils/perf-monitor', () => ({
  perfMonitor: {
    getRecentEventLoopLagSnapshot: () => ({ lagMs: 2048, severity: 'error', at: 1700000000000 })
  }
}))

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: vi.fn(() => ({})),
    getAuxDb: vi.fn(() => ({})),
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
    type: 'plugin',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../../sentry', () => ({
  getSentryService: () => sentryServiceMock
}))

vi.mock('../../storage', () => ({
  storageModule: {},
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
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
    type: 'app',
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: appProviderPrepareForShutdownSpy,
    setIndexedSourceRuntimeDelegate: appProviderSetRuntimeDelegateSpy
  }
}))
vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: { id: 'everything-provider', type: 'file', onSearch: vi.fn() }
}))
vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    id: 'file-provider',
    type: 'file',
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: fileProviderPrepareForShutdownSpy,
    setFilePersistencePort: fileProviderSetPersistencePortSpy,
    setIndexedSourceRuntimeMutationDelegate: fileProviderSetMutationDelegateSpy,
    setIndexedSourceRuntimeResetDelegate: fileProviderSetResetDelegateSpy
  }
}))
vi.mock('../addon/preview', () => ({
  previewProvider: { id: 'preview-provider', type: 'preview', onSearch: vi.fn() }
}))
vi.mock('../addon/system/main-window-provider', () => ({
  mainWindowProvider: { id: 'main-window-provider', type: 'system', onSearch: vi.fn() }
}))
vi.mock('../addon/system/system-actions-provider', () => ({
  systemActionsProvider: { id: 'system-actions-provider', type: 'system', onSearch: vi.fn() }
}))
vi.mock('../addon/context-actions/context-actions-provider', () => ({
  contextActionsProvider: {
    id: 'context-actions',
    type: 'system',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Image],
    onSearch: vi.fn()
  }
}))

vi.mock('../core-box/window', () => ({
  windowManager: {
    current: null
  }
}))

vi.mock('./query-completion-service', () => ({
  QueryCompletionService: class {}
}))

vi.mock('./recommendation/recommendation-engine', () => ({
  RecommendationEngine: class {}
}))

vi.mock('./search-gather', () => ({
  gatherAggregator: vi.fn()
}))

vi.mock('./search-index-service', () => ({
  SearchIndexService: class {
    warmup = vi.fn(async () => {})
    preloadPinyin = vi.fn()
  }
}))

vi.mock('./search-index-writer', () => ({
  LegacySearchIndexWriter: class {},
  SourceScopedIndexWriterRouter: class {},
  searchIndexWriter: {
    getFilePersistencePort: searchIndexWriterGetFilePersistencePortSpy,
    shutdown: searchIndexWriterShutdownSpy
  }
}))

vi.mock('./search-logger', () => ({
  searchLogger: {
    isEnabled: () => true,
    logSearchPhase: vi.fn(),
    searchSessionStart: vi.fn(),
    searchProviders: vi.fn(),
    searchUpdate: vi.fn(),
    searchSessionEnd: vi.fn()
  }
}))

vi.mock('./time-stats-aggregator', () => ({
  TimeStatsAggregator: class {}
}))

vi.mock('./usage-stats-cache', () => ({
  UsageStatsCache: class {},
  getUsageStatsBatchCached: vi.fn()
}))

vi.mock('./usage-stats-queue', () => ({
  UsageStatsQueue: class {}
}))

vi.mock('./usage-summary-service', () => ({
  UsageSummaryService: class {
    stop = vi.fn()
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendToWindow: vi.fn(),
    on: transportOnSpy
  }))
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'en-US'),
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

type SearchEngineCoreInstance = InstanceType<typeof import('./search-core').SearchEngineCore>
type TouchEventModule = typeof import('../../../core/eventbus/touch-event')

let TalexEvents: TouchEventModule['TalexEvents']
let touchEventBus: TouchEventModule['touchEventBus']
let testCore: SearchEngineCoreInstance
let destroyPromise: Promise<void> | undefined

const destroyTestCore = async (): Promise<void> => {
  destroyPromise ??= testCore.destroy()
  await destroyPromise
}

describe('search-core search-trace', () => {
  beforeEach(async () => {
    vi.resetModules()
    ;({ TalexEvents, touchEventBus } = await import('../../../core/eventbus/touch-event'))
    const { SearchEngineCore } = await import('./search-core')
    testCore = SearchEngineCore.getInstance()
    destroyPromise = undefined

    infoSpy.mockClear()
    warnSpy.mockClear()
    sentryServiceMock.isTelemetryEnabled.mockReturnValue(false)
    sentryServiceMock.isEnabled.mockReturnValue(false)
    sentryServiceMock.queueNexusTelemetry.mockClear()
    sentryServiceMock.recordSearchMetrics.mockClear()
    transportOnSpy.mockClear()
    appProviderPrepareForShutdownSpy.mockClear()
    appProviderSetRuntimeDelegateSpy.mockClear()
    fileProviderPrepareForShutdownSpy.mockClear()
    fileProviderSetMutationDelegateSpy.mockClear()
    fileProviderSetPersistencePortSpy.mockClear()
    fileProviderSetResetDelegateSpy.mockClear()
    searchIndexWriterGetFilePersistencePortSpy.mockClear()
    searchIndexWriterShutdownSpy.mockClear()
    vi.mocked(touchEventBus.on).mockClear()
    vi.mocked(touchEventBus.off).mockClear()
  })

  afterEach(async () => {
    await destroyTestCore()
  })

  it('routes file system events through the indexed source runtime bridge', async () => {
    const getSource = vi.fn(() => ({
      shouldHandleWatchEvent: vi.fn(() => true)
    }))
    const reconcileSource = vi.fn(async () => ({
      sourceId: 'file-provider',
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1,
      completedAt: 2
    }))
    const routeWatchEventWithResult = vi.fn(async () => ({
      deltas: [],
      matchedSources: 1,
      handledSources: 1,
      failedSources: 0,
      appliedDeltas: 0,
      failedDeltas: 0,
      errors: []
    }))
    const core = testCore as unknown as {
      indexingRuntime: {
        routeWatchEventWithResult: typeof routeWatchEventWithResult
        getSource: typeof getSource
        reconcileSource: typeof reconcileSource
        beginShutdown: () => void
        abortAndDrainSourceScans: (sourceId: string) => Promise<void>
        drainAdmittedTasks: () => Promise<void>
        drainSourceMutations: (sourceId: string) => Promise<void>
        clear: () => void
      }
      indexedSourceEventRouter: { subscribe: () => void }
      destroy: () => void
    }
    core.indexingRuntime = {
      routeWatchEventWithResult,
      getSource,
      reconcileSource,
      beginShutdown: vi.fn(),
      abortAndDrainSourceScans: vi.fn(async () => undefined),
      drainAdmittedTasks: vi.fn(async () => undefined),
      drainSourceMutations: vi.fn(async () => undefined),
      clear: vi.fn()
    }

    core.indexedSourceEventRouter.subscribe()

    expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_ADDED, expect.any(Function))
    expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_CHANGED, expect.any(Function))
    expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_UNLINKED, expect.any(Function))
    expect(touchEventBus.on).toHaveBeenCalledWith(
      TalexEvents.FILE_WATCH_ROOT_RECOVERED,
      expect.any(Function)
    )

    const changedHandlers = vi
      .mocked(touchEventBus.on)
      .mock.calls.filter(([event]) => event === TalexEvents.FILE_CHANGED)
      .map(([, handler]) => handler)
    for (const changedHandler of changedHandlers) {
      changedHandler?.({
        name: TalexEvents.FILE_CHANGED,
        filePath: '/tmp/a.md'
      } as unknown as Parameters<typeof changedHandler>[0])
    }
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(routeWatchEventWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'file-provider',
        action: 'change',
        path: '/tmp/a.md'
      })
    )
    expect(routeWatchEventWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'app-provider',
        action: 'change',
        path: '/tmp/a.md'
      })
    )

    const recoveredHandler = vi
      .mocked(touchEventBus.on)
      .mock.calls.find(([event]) => event === TalexEvents.FILE_WATCH_ROOT_RECOVERED)?.[1]
    recoveredHandler?.({
      name: TalexEvents.FILE_WATCH_ROOT_RECOVERED,
      filePath: '/tmp/recovered'
    } as unknown as Parameters<NonNullable<typeof recoveredHandler>>[0])
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(getSource).toHaveBeenCalledWith('file-provider')
    expect(reconcileSource).toHaveBeenCalledWith(
      'file-provider',
      expect.objectContaining({
        reason: IndexedSourceReconcileReasons.WatchRootRecovered,
        roots: [
          expect.objectContaining({
            sourceId: 'file-provider',
            path: '/tmp/recovered',
            permissionState: 'granted',
            reason: IndexedSourceReconcileReasons.WatchRootRecovered
          })
        ]
      })
    )

    await destroyTestCore()
    expect(fileProviderSetResetDelegateSpy).toHaveBeenCalledWith(null)
    expect(touchEventBus.off).toHaveBeenCalledWith(TalexEvents.FILE_ADDED, expect.any(Function))
    expect(touchEventBus.off).toHaveBeenCalledWith(TalexEvents.FILE_CHANGED, expect.any(Function))
    expect(touchEventBus.off).toHaveBeenCalledWith(TalexEvents.FILE_UNLINKED, expect.any(Function))
    expect(touchEventBus.off).toHaveBeenCalledWith(
      TalexEvents.FILE_WATCH_ROOT_RECOVERED,
      expect.any(Function)
    )
  })

  it('结构化日志不输出 query 明文并包含争用快照字段', () => {
    const query: TuffQuery = {
      text: 'top secret query',
      inputs: [{ type: TuffInputType.Text, content: 'clipboard payload' }]
    }

    const core = testCore as unknown as SearchCoreTraceHarness
    core.logSearchTrace({
      event: 'session.start',
      sessionId: 'session-trace-test',
      query,
      timings: { parseMs: 12.3, providerSelectMs: 45.6, mergeRankMs: 78.9, totalMs: 136.8 },
      result: { firstCount: 3, totalCount: 3 },
      sourceStats: [
        {
          providerId: 'app-provider',
          status: 'success',
          duration: 34,
          resultCount: 3
        }
      ],
      includeDetails: true
    })

    expect(infoSpy).toHaveBeenCalled()
    const line = String(infoSpy.mock.calls.at(-1)?.[0] ?? '')
    expect(line).toContain('search-trace/v1')
    expect(line).not.toContain('top secret query')
    expect(line).toContain('"hash"')
    expect(line).toContain('"dbQueue"')
    expect(line).toContain('"loopLag"')
    expect(line).toContain('"appTaskGate"')
  })

  it('搜索 telemetry 上报 provider 状态与首屏耗时且不包含 query 明文', () => {
    sentryServiceMock.isTelemetryEnabled.mockReturnValue(true)
    const core = testCore as unknown as SearchCoreTraceHarness
    const query: TuffQuery = {
      text: 'private search text',
      inputs: [{ type: TuffInputType.Text, content: 'clipboard payload' }]
    }

    core._recordSearchMetrics({
      sessionId: 'session-telemetry-test',
      query,
      totalDuration: 950,
      firstResultMs: 120,
      firstResultCount: 2,
      sortingDuration: 17,
      usageStatsDuration: 9,
      completionDuration: 4,
      stageDurations: {
        parseDuration: 3,
        providerAggregationDuration: 28,
        mergeRankDuration: 17
      },
      sourceStats: [
        {
          providerId: 'app-provider',
          status: 'success',
          duration: 44,
          resultCount: 2
        },
        {
          providerId: 'everything-provider',
          status: 'timeout',
          duration: 500,
          resultCount: 0
        }
      ],
      resultCount: 3,
      providerFilter: 'app'
    })

    expect(sentryServiceMock.queueNexusTelemetry).toHaveBeenCalledTimes(1)
    const payload = sentryServiceMock.queueNexusTelemetry.mock.calls[0][0]
    expect(JSON.stringify(payload)).not.toContain('private search text')
    expect(payload).toMatchObject({
      eventType: 'search',
      searchQuery: undefined,
      searchDurationMs: 950,
      searchResultCount: 3,
      providerTimings: {
        'app-provider': 44,
        'everything-provider': 500
      },
      metadata: {
        firstResultMs: 120,
        firstResultCount: 2,
        providerTimeoutCount: 1,
        providerFilter: 'app',
        providerStatus: {
          'app-provider': 'success',
          'everything-provider': 'timeout'
        }
      }
    })
  })

  it('注册统一 indexing diagnostics transport handler', async () => {
    const core = testCore
    core.init({
      app: {
        channel: {
          keyManager: {}
        }
      }
    } as never)

    const eventName = CoreBoxEvents.search.indexingDiagnostics.toEventName()
    const handler = transportOnSpy.mock.calls.find(
      (call) => call[0].toEventName() === eventName
    )?.[1]

    expect(handler).toBeTypeOf('function')
    expect(fileProviderSetResetDelegateSpy).toHaveBeenCalledWith(expect.any(Function))

    const diagnostics = await handler()

    expect(diagnostics.summary.total).toBe(5)
    expect(diagnostics.sources.map((source) => source.descriptor.id)).toEqual([
      'app-provider',
      'file-provider',
      'everything-provider',
      'quicklinks',
      'browser-bookmarks'
    ])
  })
})
