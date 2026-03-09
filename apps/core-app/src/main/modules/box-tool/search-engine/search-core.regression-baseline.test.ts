import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {},
  touchEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  ProviderDeactivatedEvent: class {}
}))

vi.mock('../../../db/utils', () => ({
  createDbUtils: () => null
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
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
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
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
    onSearch: vi.fn()
  }
}))

vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    id: 'file-provider',
    type: 'file',
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
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
    supportedInputTypes: [TuffInputType.Text, TuffInputType.Files],
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

import { SearchEngineCore } from './search-core'

type StageSample = {
  scenario: 'plain-text' | 'provider-filter' | 'clipboard-input'
  parseMs: number
  providersMs: number
  mergeRankMs: number
  providersMatched: number
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

async function measureScenario(scenario: StageSample['scenario']): Promise<StageSample> {
  const core = SearchEngineCore.getInstance() as unknown as {
    orchestrateSearchQuery: (
      query: TuffQuery
    ) => Promise<{ providerFilter?: string; durationMs: number }>
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
    providersMatched: providerResult.providers.length
  }
}

describe('search-core regression baseline (roadmap 06-C)', () => {
  it('collects stage duration samples for plain/@provider/clipboard scenarios', async () => {
    const samples = await Promise.all([
      measureScenario('plain-text'),
      measureScenario('provider-filter'),
      measureScenario('clipboard-input')
    ])

    const plain = samples.find((item) => item.scenario === 'plain-text')
    const provider = samples.find((item) => item.scenario === 'provider-filter')
    const clipboard = samples.find((item) => item.scenario === 'clipboard-input')

    expect(plain?.providersMatched).toBe(MOCK_PROVIDERS.length)
    expect(provider?.providersMatched).toBeGreaterThan(0)
    expect(provider?.providersMatched).toBeLessThan(MOCK_PROVIDERS.length)
    expect(clipboard?.providersMatched).toBe(3)

    for (const sample of samples) {
      expect(sample.parseMs).toBeGreaterThanOrEqual(0)
      expect(sample.providersMs).toBeGreaterThanOrEqual(0)
      expect(sample.mergeRankMs).toBeGreaterThanOrEqual(0)
    }

    console.log(`ROADMAP_06C_BASELINE=${JSON.stringify(samples)}`)
  })
})
