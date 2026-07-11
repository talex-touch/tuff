import type {
  IGatherController,
  ISearchProvider,
  TuffAggregatorCallback,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
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
  subscribeMainConfig: vi.fn(() => () => {})
}))

vi.mock('../addon/apps/app-provider', () => ({
  appProvider: {
    id: 'app-provider',
    type: 'app',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
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
  currentGatherController: IGatherController | null
  latestSessionId: string | null
  searchCache: Map<string, unknown>
  searchFirstResultMetrics: Map<string, unknown>
  search: (query: TuffQuery) => Promise<TuffSearchResult>
  cancelSearch: (searchId: string) => void
  orchestrateSearchQuery: (query: TuffQuery) => Promise<{
    providerFilter?: string
    cacheKey: string
    durationMs: number
    providerConfigSignature: string
  }>
  getActiveProviders: () => ISearchProvider<ProviderContext>[]
  aggregateProvidersForQuery: (
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    options: { providerFilter?: string }
  ) => { providers: ISearchProvider<ProviderContext>[]; durationMs: number }
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
  getTransport: () => { sendToWindow: typeof sendToWindowMock }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

function eventNameOf(event: unknown): string {
  if (
    event &&
    typeof event === 'object' &&
    'toEventName' in event &&
    typeof event.toEventName === 'function'
  ) {
    return event.toEventName()
  }
  return String(event)
}

describe('search-core gather completion ordering', () => {
  beforeEach(() => {
    gatherAggregatorMock.mockReset()
    sendToWindowMock.mockReset().mockImplementation(async (_windowId, event, payload) => {
      sentEvents.push({
        eventName: eventNameOf(event),
        payload: payload as Record<string, unknown>,
        mergeSettled
      })
    })
    sentEvents.length = 0
    mergeSettled = false
  })

  it('publishes one cancelled end only after the running update callback settles', async () => {
    const query: TuffQuery = { text: 'cancel ordered search', inputs: [] }
    const updateMergeStarted = createDeferred()
    const updateMergeRelease = createDeferred()
    const abortController = new AbortController()
    let capturedCallback: TuffAggregatorCallback | null = null

    const gatherController: IGatherController = {
      abort: vi.fn(() => abortController.abort()),
      promise: Promise.resolve(0),
      signal: abortController.signal
    }
    gatherAggregatorMock.mockImplementation((_providers, _params, onUpdate) => {
      capturedCallback = onUpdate
      return gatherController
    })

    const core = SearchEngineCore.getInstance() as unknown as SearchCoreOrderingHarness
    core.currentGatherController = null
    core.latestSessionId = null
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
    core.getTransport = vi.fn(() => ({ sendToWindow: sendToWindowMock }))
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

    const searchPromise = core.search(query)
    await vi.waitFor(() => expect(capturedCallback).toBeTypeOf('function'))

    await capturedCallback!({
      newResults: [],
      totalCount: 0,
      isDone: false,
      sourceStats: [],
      layer: 'fast'
    })
    const initialResult = await searchPromise
    const searchId = initialResult.sessionId!

    const subsequentResult = new TuffSearchResultBuilder(query)
      .setItems([
        {
          id: 'late-result',
          source: { id: 'provider-late', type: 'file' },
          render: { mode: 'default', basic: { title: 'Late result' } }
        }
      ])
      .build()
    const runningUpdate = Promise.resolve(
      capturedCallback!({
        newResults: [subsequentResult],
        totalCount: 1,
        isDone: false,
        sourceStats: [],
        layer: 'deferred'
      })
    )

    await updateMergeStarted.promise
    core.cancelSearch(searchId)
    const endCountBeforeMergeSettled = sentEvents.filter(
      (event) => event.eventName === CoreBoxEvents.search.end.toEventName()
    ).length

    updateMergeRelease.resolve()
    await runningUpdate
    await capturedCallback!({
      newResults: [],
      totalCount: 1,
      isDone: true,
      cancelled: true,
      sourceStats: []
    })

    const endEvents = sentEvents.filter(
      (event) => event.eventName === CoreBoxEvents.search.end.toEventName()
    )

    expect(endCountBeforeMergeSettled).toBe(0)
    expect(gatherController.abort).toHaveBeenCalledTimes(1)
    expect(sentEvents.map((event) => event.eventName)).toEqual([
      CoreBoxEvents.search.end.toEventName()
    ])
    expect(endEvents).toHaveLength(1)
    expect(endEvents[0]).toMatchObject({
      mergeSettled: true,
      payload: {
        searchId,
        cancelled: true,
        sources: []
      }
    })
  })
})
