import type {
  IGatherController,
  ISearchProvider,
  TuffAggregatorCallback,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderContext } from './types'

const { gatherAggregatorMock, sendToWindowMock, sentEvents, windowManagerMock } = vi.hoisted(
  () => ({
    gatherAggregatorMock: vi.fn(),
    sendToWindowMock: vi.fn(async (..._args: unknown[]) => {}),
    sentEvents: [] as Array<{
      eventName: string
      payload: Record<string, unknown>
      mergeSettled: boolean
    }>,
    windowManagerMock: {
      current: {
        window: {
          id: 42,
          isDestroyed: () => false
        }
      }
    }
  })
)

let mergeSettled = false

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  })
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

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendToWindow: sendToWindowMock,
    on: vi.fn()
  }))
}))

vi.mock('../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {},
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
    getStats: () => ({ queued: 0, processing: false, currentTaskLabel: null })
  }
}))

vi.mock('../../../service/app-task-gate', () => ({
  appTaskGate: {
    getSnapshot: () => ({ activeCount: 0, activeLabels: {} })
  }
}))

vi.mock('../../../utils/perf-monitor', () => ({
  perfMonitor: {
    getRecentEventLoopLagSnapshot: () => null
  }
}))

vi.mock('../../database', () => ({
  databaseModule: {}
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
  getSentryService: () => null
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
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: vi.fn(async () => undefined),
    setIndexedSourceRuntimeDelegate: vi.fn()
  }
}))

vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: {
    id: 'everything-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    id: 'file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: vi.fn(async () => undefined),
    setFilePersistencePort: vi.fn(),
    setIndexedSourceRuntimeMutationDelegate: vi.fn(),
    setIndexedSourceRuntimeResetDelegate: vi.fn()
  }
}))

vi.mock('../addon/files/native-file-search-provider', () => ({
  linuxNativeFileProvider: {
    id: 'linux-native-file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  },
  macSpotlightFileProvider: {
    id: 'mac-spotlight-file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/preview', () => ({
  previewProvider: {
    id: 'preview-provider',
    type: 'preview',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/system/main-window-provider', () => ({
  mainWindowProvider: {
    id: 'main-window-provider',
    type: 'command',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/system/system-actions-provider', () => ({
  systemActionsProvider: {
    id: 'system-actions-provider',
    type: 'command',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/system/windows-shell-file-provider', () => ({
  windowsShellFileProvider: {
    id: 'windows-shell-file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  }
}))

vi.mock('../core-box/window', () => ({
  windowManager: windowManagerMock
}))

vi.mock('./query-completion-service', () => ({
  QueryCompletionService: class {}
}))

vi.mock('./recommendation/recommendation-engine', () => ({
  RecommendationEngine: class {}
}))

vi.mock('./search-gather', () => ({
  gatherAggregator: gatherAggregatorMock
}))

vi.mock('./search-index-service', () => ({
  SearchIndexService: class {}
}))

vi.mock('./search-index-writer', () => ({
  LegacySearchIndexWriter: class {},
  SourceScopedIndexWriterRouter: class {},
  searchIndexWriter: {
    getFilePersistencePort: vi.fn(() => null),
    shutdown: vi.fn(async () => undefined)
  }
}))

vi.mock('./search-logger', () => ({
  searchLogger: {
    isEnabled: () => false,
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
  UsageSummaryService: class {}
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

interface SearchCoreOrderingHarness {
  searchCache: Map<string, unknown>
  searchFirstResultMetrics: Map<string, unknown>
  startSearch: (
    query: TuffQuery,
    context: {
      caller: { kind: 'core-box' | 'ai-agent'; id: string }
      sink: {
        start: (sessionId: string) => void
        snapshot: (result: TuffSearchResult) => void
        complete: (payload: { searchId: string; cancelled?: boolean }) => void
      }
    }
  ) => {
    sessionId: string
    result: Promise<TuffSearchResult>
    completed: Promise<void>
  }
  cancelSearch: (searchId: string, caller: { kind: 'core-box'; id: string }) => boolean
  destroy: () => Promise<void>
  orchestrateSearchQuery: () => Promise<{
    providerFilter?: string
    cacheKey: string
    durationMs: number
    providerConfigSignature: string
  }>
  getActiveProviders: () => ISearchProvider<ProviderContext>[]
  aggregateProvidersForQuery: () => {
    providers: ISearchProvider<ProviderContext>[]
    durationMs: number
  }
  mergeAndRankItems: (args: { items: TuffItem[] }) => Promise<{
    sortedItems: TuffItem[]
    sortingDuration: number
    usageStatsDuration: number
    completionDuration: number
    mergeRankDuration: number
  }>
  appendCompatibilityNotice: (items: TuffItem[]) => TuffItem[]
  cacheSearchResult: () => void
  _recordSearchUsage: () => Promise<void>
  _recordSearchResults: () => Promise<void>
  logSearchTrace: () => void
  _recordSearchMetrics: () => void
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

describe('search-core gather completion ordering', () => {
  const core = SearchEngineCore.getInstance() as unknown as SearchCoreOrderingHarness

  beforeEach(async () => {
    await core.destroy()
    gatherAggregatorMock.mockReset()
    sentEvents.length = 0
    mergeSettled = false
    core.searchCache.clear()
    core.searchFirstResultMetrics.clear()
    core.orchestrateSearchQuery = vi.fn(async () => ({
      cacheKey: 'gather-ordering-test',
      durationMs: 0,
      providerConfigSignature: 'test-signature'
    }))
    core.getActiveProviders = vi.fn(() => [])
    core.aggregateProvidersForQuery = vi.fn(() => ({ providers: [], durationMs: 0 }))
    core.appendCompatibilityNotice = vi.fn((items) => items)
    core.cacheSearchResult = vi.fn()
    core._recordSearchUsage = vi.fn(async () => {})
    core._recordSearchResults = vi.fn(async () => {})
    core.logSearchTrace = vi.fn()
    core._recordSearchMetrics = vi.fn()
  })

  it('aborts only the named session and publishes its one cancelled completion after an in-flight merge', async () => {
    const query: TuffQuery = { text: 'cancel ordered search', inputs: [] }
    const updateMergeStarted = createDeferred()
    const updateMergeRelease = createDeferred()
    const callbacks: TuffAggregatorCallback[] = []
    const controllers = [
      {
        abort: vi.fn(),
        promise: Promise.resolve(0),
        signal: new AbortController().signal
      },
      {
        abort: vi.fn(),
        promise: Promise.resolve(0),
        signal: new AbortController().signal
      }
    ] satisfies IGatherController[]

    gatherAggregatorMock.mockImplementation((_providers, _params, onUpdate) => {
      callbacks.push(onUpdate)
      return controllers[callbacks.length - 1]
    })
    core.mergeAndRankItems = vi.fn(async ({ items }) => {
      if (items.length > 0) {
        updateMergeStarted.resolve()
        await updateMergeRelease.promise
        mergeSettled = true
      }
      return {
        sortedItems: items,
        sortingDuration: 0,
        usageStatsDuration: 0,
        completionDuration: 0,
        mergeRankDuration: 0
      }
    })

    const delivered: Array<{
      sessionId: string
      type: string
      cancelled?: boolean
      mergeSettled?: boolean
    }> = []
    const caller = { kind: 'core-box' as const, id: 'core-box:ordering' }
    const first = core.startSearch(query, {
      caller,
      sink: {
        start: (sessionId) => {
          delivered.push({ sessionId, type: 'session' })
        },
        snapshot: (result) => {
          delivered.push({ sessionId: result.sessionId!, type: 'snapshot' })
        },
        complete: ({ searchId, cancelled }) => {
          delivered.push({ sessionId: searchId, type: 'complete', cancelled, mergeSettled })
        }
      }
    })
    await vi.waitFor(() => expect(callbacks).toHaveLength(1))
    await callbacks[0]({
      newResults: [],
      totalCount: 0,
      isDone: false,
      sourceStats: [],
      layer: 'fast'
    })
    await first.result

    const second = core.startSearch(query, {
      caller: { kind: 'ai-agent', id: 'agent:ordering' },
      sink: {
        start: (sessionId) => {
          delivered.push({ sessionId, type: 'session' })
        },
        snapshot: (result) => {
          delivered.push({ sessionId: result.sessionId!, type: 'snapshot' })
        },
        complete: ({ searchId, cancelled }) => {
          delivered.push({ sessionId: searchId, type: 'complete', cancelled, mergeSettled })
        }
      }
    })
    await vi.waitFor(() => expect(callbacks).toHaveLength(2))
    await callbacks[1]({
      newResults: [],
      totalCount: 0,
      isDone: false,
      sourceStats: [],
      layer: 'fast'
    })
    await second.result

    const lateResult = new TuffSearchResultBuilder(query)
      .setItems([
        {
          id: 'late-result',
          source: { id: 'provider-late', type: 'file' },
          render: { mode: 'default', basic: { title: 'Late result' } }
        }
      ])
      .build()
    const runningUpdate = callbacks[0]({
      newResults: [lateResult],
      totalCount: 1,
      isDone: false,
      sourceStats: [],
      layer: 'deferred'
    })

    await updateMergeStarted.promise
    expect(core.cancelSearch(first.sessionId, caller)).toBe(true)
    expect(controllers[0].abort).toHaveBeenCalledTimes(1)
    expect(controllers[1].abort).not.toHaveBeenCalled()
    expect(
      delivered.filter((entry) => entry.sessionId === first.sessionId && entry.type === 'complete')
    ).toHaveLength(0)

    updateMergeRelease.resolve()
    await runningUpdate
    await callbacks[0]({
      newResults: [],
      totalCount: 1,
      isDone: true,
      cancelled: true,
      sourceStats: []
    })
    await first.completed

    await callbacks[1]({ newResults: [], totalCount: 0, isDone: true, sourceStats: [] })
    await second.completed

    expect(
      delivered.filter((entry) => entry.sessionId === first.sessionId && entry.type === 'complete')
    ).toEqual([expect.objectContaining({ cancelled: true, mergeSettled: true })])
    expect(
      delivered.filter((entry) => entry.sessionId === second.sessionId && entry.type === 'complete')
    ).toEqual([expect.objectContaining({ cancelled: undefined })])
  })
})
