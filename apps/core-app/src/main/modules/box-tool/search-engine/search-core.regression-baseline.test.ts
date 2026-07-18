import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  everythingReadyMock,
  fileHasSearchFiltersMock,
  fileStartupNoticeMock,
  appSettingsMock,
  providerDestroyMock
} = vi.hoisted(() => ({
  everythingReadyMock: vi.fn(() => false),
  fileHasSearchFiltersMock: vi.fn(() => false),
  fileStartupNoticeMock: vi.fn<() => TuffItem | null>(() => null),
  appSettingsMock: { value: { beginner: { init: true } } as Record<string, unknown> },
  providerDestroyMock: vi.fn()
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
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Image, TuffInputType.Files],
    onSearch: vi.fn()
  }
}))

vi.mock('../../sentry', () => ({
  getSentryService: () => null
}))

vi.mock('../../storage', () => ({
  storageModule: {},
  getMainConfig: vi.fn(() => appSettingsMock.value),
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
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn(),
    isSearchReady: everythingReadyMock,
    buildUnavailableNotice: vi.fn(() => null)
  }
}))

vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    id: 'file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: vi.fn(async () => undefined),
    hasSearchFilters: fileHasSearchFiltersMock,
    buildStartupDegradedNotice: fileStartupNoticeMock,
    setFilePersistencePort: vi.fn(),
    setIndexedSourceRuntimeMutationDelegate: vi.fn(),
    setIndexedSourceRuntimeResetDelegate: vi.fn()
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
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/context-actions/context-actions-provider', () => ({
  contextActionsProvider: {
    id: 'context-actions',
    type: 'system',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Image],
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
  SearchIndexService: class {}
}))

vi.mock('./search-logger', () => ({
  searchLogger: {
    isEnabled: () => false,
    logSearchPhase: vi.fn(),
    searchSessionStart: vi.fn(),
    searchProviders: vi.fn()
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

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendToWindow: vi.fn()
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

import { SearchEngineCore } from './search-core'

type StageSample = {
  scenario: 'plain-text' | 'provider-filter' | 'clipboard-input'
  parseMs: number
  providersMs: number
  mergeRankMs: number
  providersMatched: number
  providerIds: string[]
}

const MOCK_PROVIDERS = [
  {
    id: 'app-provider',
    type: 'app',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  },
  {
    id: 'file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn()
  },
  {
    id: 'everything-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn()
  },
  {
    id: 'windows-shell-file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text],
    onSearch: vi.fn()
  },
  {
    id: 'plugin-features',
    type: 'plugin',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Image, TuffInputType.Files],
    onSearch: vi.fn()
  }
] as const

function createItems(size = 24): TuffItem[] {
  const items: TuffItem[] = []
  for (let i = 0; i < size; i++) {
    items.push({
      id: `item-${i}`,
      kind: i % 2 === 0 ? 'feature' : 'app',
      source: {
        id: i % 2 === 0 ? 'plugin-features' : 'app-provider',
        type: i % 2 === 0 ? 'plugin' : 'app'
      },
      render: {
        basic: {
          title: `Regression Item ${i}`
        }
      },
      meta: {},
      scoring: {
        frequency: (i % 5) + 1,
        recency: size - i
      }
    } as unknown as TuffItem)
  }
  return items
}

function createQuery(scenario: StageSample['scenario']): TuffQuery {
  if (scenario === 'plain-text') {
    return { text: 'open settings', inputs: [] } as TuffQuery
  }
  if (scenario === 'provider-filter') {
    return { text: '@file report', inputs: [] } as TuffQuery
  }
  return {
    text: 'translate clipboard',
    inputs: [
      { type: TuffInputType.Image, content: 'data:image/png;base64,AA==' },
      { type: TuffInputType.Files, content: '[\"/tmp/demo.txt\"]' }
    ]
  } as TuffQuery
}

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

afterEach(() => {
  everythingReadyMock.mockReset().mockReturnValue(false)
  fileHasSearchFiltersMock.mockReset().mockReturnValue(false)
  fileStartupNoticeMock.mockReset().mockReturnValue(null)
  providerDestroyMock.mockReset()
  appSettingsMock.value = { beginner: { init: true } }
})

async function measureScenario(scenario: StageSample['scenario']): Promise<StageSample> {
  const core = SearchEngineCore.getInstance() as unknown as {
    orchestrateSearchQuery: (
      query: TuffQuery
    ) => Promise<{ providerFilter?: string; cacheKey: string; durationMs: number }>
    aggregateProvidersForQuery: (
      providers: typeof MOCK_PROVIDERS,
      query: TuffQuery,
      options: { providerFilter?: string }
    ) => { providers: typeof MOCK_PROVIDERS; durationMs: number }
    mergeAndRankItems: (args: {
      sessionId: string
      query: TuffQuery
      items: TuffItem[]
      signal: AbortSignal
      includeCompletion: boolean
    }) => Promise<{ mergeRankDuration: number }>
  }

  const query = createQuery(scenario)
  const parseResult = await core.orchestrateSearchQuery(query)
  const providerResult = core.aggregateProvidersForQuery(MOCK_PROVIDERS, query, {
    providerFilter: parseResult.providerFilter
  })
  const mergeResult = await core.mergeAndRankItems({
    sessionId: `roadmap-06c-${scenario}`,
    query,
    items: createItems(),
    signal: new AbortController().signal,
    includeCompletion: false
  })

  return {
    scenario,
    parseMs: Number(parseResult.durationMs.toFixed(3)),
    providersMs: Number(providerResult.durationMs.toFixed(3)),
    mergeRankMs: Number(mergeResult.mergeRankDuration.toFixed(3)),
    providersMatched: providerResult.providers.length,
    providerIds: providerResult.providers.map((provider) => provider.id)
  }
}

describe('search-core regression baseline (roadmap 06-C)', () => {
  it('collects stage duration samples for plain/@provider/clipboard scenarios', async () => {
    const samples = await withPlatform('win32', () =>
      Promise.all([
        measureScenario('plain-text'),
        measureScenario('provider-filter'),
        measureScenario('clipboard-input')
      ])
    )

    const plain = samples.find((item) => item.scenario === 'plain-text')
    const provider = samples.find((item) => item.scenario === 'provider-filter')
    const clipboard = samples.find((item) => item.scenario === 'clipboard-input')

    expect(plain?.providerIds).toEqual([
      'app-provider',
      'file-provider',
      'windows-shell-file-provider',
      'plugin-features'
    ])
    expect(provider?.providersMatched).toBeGreaterThan(0)
    expect(provider?.providersMatched).toBeLessThan(MOCK_PROVIDERS.length)
    expect(clipboard?.providerIds).toEqual(['file-provider', 'plugin-features'])

    for (const sample of samples) {
      expect(sample.parseMs).toBeGreaterThanOrEqual(0)
      expect(sample.providersMs).toBeGreaterThanOrEqual(0)
      expect(sample.mergeRankMs).toBeGreaterThanOrEqual(0)
    }

    console.log(`ROADMAP_06C_BASELINE=${JSON.stringify(samples)}`)
  })

  it('routes Windows plain file search to Everything when ready', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      aggregateProvidersForQuery: (
        providers: typeof MOCK_PROVIDERS,
        query: TuffQuery,
        options: { providerFilter?: string }
      ) => { providers: typeof MOCK_PROVIDERS; durationMs: number }
    }
    everythingReadyMock.mockReturnValue(true)

    await withPlatform('win32', async () => {
      const result = core.aggregateProvidersForQuery(
        MOCK_PROVIDERS,
        { text: 'report', inputs: [] } as TuffQuery,
        {}
      )

      expect(result.providers.map((provider) => provider.id)).toEqual([
        'app-provider',
        'everything-provider',
        'windows-shell-file-provider',
        'plugin-features'
      ])
    })
  })

  it('applies saved provider enablement and order to the default provider pool', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      registerProvider: (provider: (typeof MOCK_PROVIDERS)[number]) => void
      unregisterProvider: (providerId: string) => void
      getActiveProviders: () => Array<{ id: string }>
    }
    for (const provider of MOCK_PROVIDERS) {
      core.registerProvider(provider)
    }
    appSettingsMock.value = {
      beginner: { init: true },
      searchProviders: {
        providers: [
          { providerId: 'plugin-features', enabled: true, order: 1 },
          { providerId: 'file-provider', enabled: false, order: 2 },
          { providerId: 'app-provider', enabled: true, order: 3 }
        ]
      }
    }

    try {
      expect(
        core
          .getActiveProviders()
          .map((provider) => provider.id)
          .slice(0, 3)
      ).toEqual(['plugin-features', 'app-provider', 'everything-provider'])
      expect(core.getActiveProviders().map((provider) => provider.id)).not.toContain(
        'file-provider'
      )
    } finally {
      for (const provider of MOCK_PROVIDERS) {
        core.unregisterProvider(provider.id)
      }
    }
  })

  it('routes Windows structured file search and Everything fallback to file-provider', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      aggregateProvidersForQuery: (
        providers: typeof MOCK_PROVIDERS,
        query: TuffQuery,
        options: { providerFilter?: string }
      ) => { providers: typeof MOCK_PROVIDERS; durationMs: number }
    }

    await withPlatform('win32', async () => {
      fileHasSearchFiltersMock.mockReturnValue(true)
      const filtered = core.aggregateProvidersForQuery(
        MOCK_PROVIDERS,
        { text: 'ext:pdf report', inputs: [] } as TuffQuery,
        { providerFilter: 'file' }
      )
      expect(filtered.providers.map((provider) => provider.id)).toEqual([
        'file-provider',
        'windows-shell-file-provider'
      ])

      everythingReadyMock.mockReturnValue(true)
      fileHasSearchFiltersMock.mockReturnValue(false)
      const fileCategory = core.aggregateProvidersForQuery(
        MOCK_PROVIDERS,
        { text: 'report', inputs: [] } as TuffQuery,
        { providerFilter: 'file' }
      )
      expect(fileCategory.providers.map((provider) => provider.id)).toEqual([
        'everything-provider',
        'windows-shell-file-provider'
      ])

      fileHasSearchFiltersMock.mockReturnValue(false)
      everythingReadyMock.mockReturnValue(false)
      const fallback = core.aggregateProvidersForQuery(
        MOCK_PROVIDERS,
        { text: 'report', inputs: [] } as TuffQuery,
        {}
      )
      expect(fallback.providers.map((provider) => provider.id)).toEqual([
        'app-provider',
        'file-provider',
        'windows-shell-file-provider',
        'plugin-features'
      ])
    })
  })

  it('does not append a File Index warming notice while the file provider startup is degraded', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      appendCompatibilityNotice: (
        items: TuffItem[],
        query: TuffQuery,
        providerFilter?: string
      ) => TuffItem[]
    }
    const notice = {
      id: 'file-provider:startup-degraded:report',
      kind: 'notification',
      source: { id: 'file-provider', type: 'file' },
      render: { basic: { title: 'File startup degraded' } },
      scoring: { final: 0.05 }
    } as unknown as TuffItem
    const item = createItems(1)[0]
    fileStartupNoticeMock.mockReturnValue(notice)

    await withPlatform('win32', async () => {
      const result = core.appendCompatibilityNotice(
        [item],
        { text: 'report', inputs: [] } as TuffQuery,
        'file'
      )

      expect(result.map((entry) => entry.id)).toEqual([item.id])
      expect(fileStartupNoticeMock).not.toHaveBeenCalled()
    })
  })

  it('keeps Windows shell file entries available for @file queries', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      orchestrateSearchQuery: (
        query: TuffQuery
      ) => Promise<{ providerFilter?: string; cacheKey: string; durationMs: number }>
      aggregateProvidersForQuery: (
        providers: typeof MOCK_PROVIDERS,
        query: TuffQuery,
        options: { providerFilter?: string }
      ) => { providers: typeof MOCK_PROVIDERS; durationMs: number }
    }

    await withPlatform('win32', async () => {
      everythingReadyMock.mockReturnValue(true)
      const query = { text: '@file 回收站', inputs: [] } as TuffQuery
      const parsed = await core.orchestrateSearchQuery(query)
      const result = core.aggregateProvidersForQuery(MOCK_PROVIDERS, query, {
        providerFilter: parsed.providerFilter
      })

      expect(parsed.providerFilter).toBe('file')
      expect(query.text).toBe('回收站')
      expect(result.providers.map((provider) => provider.id)).toEqual([
        'everything-provider',
        'windows-shell-file-provider'
      ])
    })
  })

  it('does not add Windows shell entries to explicit @file-provider queries', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      aggregateProvidersForQuery: (
        providers: typeof MOCK_PROVIDERS,
        query: TuffQuery,
        options: { providerFilter?: string }
      ) => { providers: typeof MOCK_PROVIDERS; durationMs: number }
    }

    await withPlatform('win32', async () => {
      const result = core.aggregateProvidersForQuery(
        MOCK_PROVIDERS,
        { text: '回收站', inputs: [] } as TuffQuery,
        { providerFilter: 'file-provider' }
      )

      expect(result.providers.map((provider) => provider.id)).toEqual(['file-provider'])
    })
  })

  it('uses distinct cache keys for same text with different inputs', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      orchestrateSearchQuery: (
        query: TuffQuery
      ) => Promise<{ providerFilter?: string; cacheKey: string; durationMs: number }>
    }

    const textOnly = await core.orchestrateSearchQuery({
      text: 'translate clipboard',
      inputs: []
    } as TuffQuery)
    const imageInput = await core.orchestrateSearchQuery({
      text: 'translate clipboard',
      inputs: [{ type: TuffInputType.Image, content: 'data:image/png;base64,AA==' }]
    } as TuffQuery)
    const fileInput = await core.orchestrateSearchQuery({
      text: 'translate clipboard',
      inputs: [{ type: TuffInputType.Files, content: '[\"/tmp/demo.txt\"]' }]
    } as TuffQuery)

    expect(new Set([textOnly.cacheKey, imageInput.cacheKey, fileInput.cacheKey]).size).toBe(3)
  })

  it('includes provider enablement in search cache keys', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      orchestrateSearchQuery: (
        query: TuffQuery
      ) => Promise<{ providerFilter?: string; cacheKey: string; durationMs: number }>
    }

    const enabled = await core.orchestrateSearchQuery({
      text: 'open settings',
      inputs: []
    } as TuffQuery)
    appSettingsMock.value = {
      beginner: { init: true },
      searchProviders: {
        providers: [{ providerId: 'app-provider', enabled: false, order: 1 }]
      }
    }
    const disabled = await core.orchestrateSearchQuery({
      text: 'open settings',
      inputs: []
    } as TuffQuery)

    expect(enabled.cacheKey).not.toBe(disabled.cacheKey)
  })

  it('destroys registered providers during search engine destroy', async () => {
    const core = SearchEngineCore.getInstance() as unknown as {
      registerProvider: (provider: (typeof MOCK_PROVIDERS)[number]) => void
      destroy: () => Promise<void>
    }

    core.registerProvider({
      id: 'destroyable-system-provider',
      type: 'system',
      supportedInputTypes: [TuffInputType.Text],
      onSearch: vi.fn(),
      onDestroy: providerDestroyMock
    } as unknown as (typeof MOCK_PROVIDERS)[number])

    await core.destroy()

    expect(providerDestroyMock).toHaveBeenCalledTimes(1)
  })
})
