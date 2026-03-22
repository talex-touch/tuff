import type { TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { infoSpy, warnSpy } = vi.hoisted(() => ({
  infoSpy: vi.fn(),
  warnSpy: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: infoSpy,
    warn: warnSpy,
    error: vi.fn()
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
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    isEnabled: () => false,
    queueNexusTelemetry: vi.fn(),
    recordSearchMetrics: vi.fn()
  })
}))

vi.mock('../../storage', () => ({
  storageModule: {},
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
  subscribeMainConfig: vi.fn(() => () => {})
}))

vi.mock('../addon/apps/app-provider', () => ({
  appProvider: { id: 'app-provider', type: 'app', onSearch: vi.fn() }
}))
vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: { id: 'everything-provider', type: 'file', onSearch: vi.fn() }
}))
vi.mock('../addon/files/file-provider', () => ({
  fileProvider: { id: 'file-provider', type: 'file', onSearch: vi.fn() }
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
  UsageSummaryService: class {}
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendToWindow: vi.fn(),
    on: vi.fn()
  }))
}))

import { SearchEngineCore } from './search-core'

describe('search-core search-trace', () => {
  beforeEach(() => {
    infoSpy.mockClear()
    warnSpy.mockClear()
  })

  it('结构化日志不输出 query 明文并包含争用快照字段', () => {
    const query: TuffQuery = {
      text: 'top secret query',
      inputs: [{ type: TuffInputType.Text, content: 'clipboard payload' }]
    }

    const core = SearchEngineCore.getInstance() as any
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
})
