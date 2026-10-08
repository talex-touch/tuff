import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StartupMetrics } from './types'
import { StorageList } from '@talex-touch/utils/common/storage/constants'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    isPackaged: false
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn()
  },
  MessageChannelMain: vi.fn()
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  const patched = {
    ...actual,
    uptime: () => 123
  }
  return {
    ...patched,
    default: patched
  }
})

const { getMainConfigMock, saveMainConfigMock } = vi.hoisted(() => ({
  getMainConfigMock: vi.fn((_file?: unknown): unknown => ({
    entries: [],
    maxEntries: 10,
    lastUpdated: Date.now()
  })),
  saveMainConfigMock: vi.fn((_file?: unknown, _value?: unknown): void => {})
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => {
      throw new Error('db unavailable')
    }
  }
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    getBooleanEnv: () => true,
    getEnvOrDefault: (_key: string, fallback: string) => fallback
  }
})

const { networkRequestMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: networkRequestMock
  })
}))

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'http://example.test'
}))

vi.mock('./telemetry-client', () => ({
  getOrCreateTelemetryClientId: () => 'client-1'
}))

let StartupAnalytics: typeof import('./startup-analytics').StartupAnalytics

beforeAll(async () => {
  ;({ StartupAnalytics } = await import('./startup-analytics'))
})

const makeMetrics = (params: {
  sessionId: string
  totalStartupTime: number
  modulesLoadTime: number
  rendererStart: number
  rendererReady: number
  moduleDetails: Array<{ name: string; loadTime: number; order: number }>
}): StartupMetrics => ({
  sessionId: params.sessionId,
  timestamp: 1000,
  platform: 'darwin',
  arch: 'arm64',
  version: '1.0.0',
  electronVersion: '27.0.0',
  nodeVersion: '22.0.0',
  isPackaged: false,
  mainProcess: {
    processCreationTime: 0,
    electronReadyTime: 10,
    modulesLoadTime: params.modulesLoadTime,
    totalModules: params.moduleDetails.length,
    moduleDetails: params.moduleDetails
  },
  renderer: {
    startTime: params.rendererStart,
    readyTime: params.rendererReady
  },
  totalStartupTime: params.totalStartupTime
})

describe('StartupAnalytics averages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('computes startup averages and module summary', () => {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 })
    const entryA = makeMetrics({
      sessionId: 'a',
      totalStartupTime: 1000,
      modulesLoadTime: 400,
      rendererStart: 10,
      rendererReady: 210,
      moduleDetails: [
        { name: 'module-a', loadTime: 100, order: 0 },
        { name: 'module-b', loadTime: 300, order: 1 }
      ]
    })
    const entryB = makeMetrics({
      sessionId: 'b',
      totalStartupTime: 2000,
      modulesLoadTime: 600,
      rendererStart: 20,
      rendererReady: 320,
      moduleDetails: [{ name: 'module-a', loadTime: 200, order: 0 }]
    })

    const result = (
      analytics as unknown as {
        computeStartupAverages: (entries: StartupMetrics[]) => {
          startupSummary: {
            samples: number
            avgTotalStartupTime: number
            avgModulesLoadTime: number
            avgRendererReadyTime: number
          }
          moduleSummary: Record<string, { avgLoadTime: number; count: number }>
        }
      }
    ).computeStartupAverages([entryA, entryB])

    expect(result.startupSummary.samples).toBe(2)
    expect(result.startupSummary.avgTotalStartupTime).toBe(1500)
    expect(result.startupSummary.avgModulesLoadTime).toBe(500)
    expect(result.startupSummary.avgRendererReadyTime).toBe(250)
    expect(result.moduleSummary['module-a']).toEqual({ avgLoadTime: 150, count: 2 })
    expect(result.moduleSummary['module-b']).toEqual({ avgLoadTime: 300, count: 1 })
  })

  it('includes startupSummary and moduleSummary in payload', async () => {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 })
    const current = makeMetrics({
      sessionId: 'current',
      totalStartupTime: 1200,
      modulesLoadTime: 500,
      rendererStart: 10,
      rendererReady: 210,
      moduleDetails: [{ name: 'module-a', loadTime: 120, order: 0 }]
    })
    const previous = makeMetrics({
      sessionId: 'previous',
      totalStartupTime: 800,
      modulesLoadTime: 400,
      rendererStart: 5,
      rendererReady: 155,
      moduleDetails: [{ name: 'module-a', loadTime: 80, order: 0 }]
    })

    ;(analytics as unknown as { currentMetrics: StartupMetrics }).currentMetrics = current
    vi.spyOn(analytics, 'getHistory').mockReturnValue({
      entries: [previous],
      maxEntries: 10,
      lastUpdated: Date.now()
    })
    ;(
      analytics as unknown as { ensureOutboxFlushTask: (endpoint: string) => void }
    ).ensureOutboxFlushTask = vi.fn()

    await analytics.reportMetrics('http://example.test')

    const { saveMainConfig } = await import('../storage')
    const saveMock = vi.mocked(saveMainConfig)
    const queueCall = saveMock.mock.calls.find(
      ([key]) => key === StorageList.STARTUP_ANALYTICS_REPORT_QUEUE
    )
    expect(queueCall).toBeDefined()
    const queued = queueCall?.[1] as Array<{
      payload: {
        metadata: {
          startupSummary?: { samples?: number }
          moduleSummary?: Record<string, { avgLoadTime?: number }>
        }
      }
    }>
    expect(Array.isArray(queued)).toBe(true)
    expect(queued.length).toBeGreaterThan(0)
    const body = queued[queued.length - 1].payload

    expect(body.metadata.startupSummary).toBeDefined()
    expect(body.metadata.moduleSummary).toBeDefined()
    expect(body.metadata.startupSummary?.samples).toBe(2)
    expect(body.metadata.moduleSummary?.['module-a']?.avgLoadTime).toBe(100)
  })

  it('registers startup outbox flush task only once', () => {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 }) as unknown as {
      ensureOutboxFlushTask: (endpoint: string) => void
      pollingService: {
        isRegistered: (id: string) => boolean
        register: (...args: unknown[]) => void
        start: () => void
      }
      startupReportEndpoint: string | null
    }

    let registered = false
    const registerMock = vi.fn(() => {
      registered = true
    })
    const startMock = vi.fn()
    analytics.pollingService = {
      isRegistered: () => registered,
      register: registerMock,
      start: startMock
    }

    analytics.ensureOutboxFlushTask('http://example.test/a')
    analytics.ensureOutboxFlushTask('http://example.test/b')

    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(analytics.startupReportEndpoint).toBe('http://example.test/b')
  })
})

interface AnalyticsInternals {
  startTime: number
  autoFinalizePromise: Promise<void> | null
  ensureOutboxFlushTask: (endpoint: string) => void
}

describe('StartupAnalytics total startup time', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const createAnalytics = (): {
    analytics: import('./startup-analytics').StartupAnalytics
    internals: AnalyticsInternals
  } => {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 })
    const internals = analytics as unknown as AnalyticsInternals
    internals.ensureOutboxFlushTask = vi.fn()
    return { analytics, internals }
  }

  const mainProcessMetrics = (processCreationTime: number) => ({
    processCreationTime,
    electronReadyTime: processCreationTime + 50,
    modulesLoadTime: 300,
    totalModules: 1,
    moduleDetails: [{ name: 'module-a', loadTime: 100, order: 0 }]
  })

  it('measures cold start once and ignores renderer handshakes after finalize', async () => {
    const { analytics, internals } = createAnalytics()
    const processCreationTime = internals.startTime - 200

    analytics.setMainProcessMetrics(mainProcessMetrics(processCreationTime))
    analytics.setRendererProcessMetrics({
      startTime: processCreationTime + 100,
      readyTime: processCreationTime + 900
    })

    expect(analytics.getCurrentMetrics()?.totalStartupTime).toBe(900)
    await internals.autoFinalizePromise

    // A renderer reload replays the handshake against the same main-process singleton
    analytics.setRendererProcessMetrics({
      startTime: processCreationTime + 8_000_000,
      readyTime: processCreationTime + 8_000_200
    })

    const metrics = analytics.getCurrentMetrics()
    expect(metrics?.totalStartupTime).toBe(900)
    expect(metrics?.renderer.readyTime).toBe(processCreationTime + 900)
    expect(analytics.getPerformanceSummary()?.rating).toBe('excellent')
  })

  it('clamps startup duration when the wall clock moves backwards', async () => {
    const { analytics, internals } = createAnalytics()

    analytics.setMainProcessMetrics(mainProcessMetrics(internals.startTime))
    analytics.setRendererProcessMetrics({
      startTime: internals.startTime - 200,
      readyTime: internals.startTime - 100
    })

    expect(analytics.getCurrentMetrics()?.totalStartupTime).toBe(0)
    await internals.autoFinalizePromise
  })

  it('falls back to the analytics start time when process creation time is unusable', async () => {
    const { analytics, internals } = createAnalytics()

    analytics.setRendererProcessMetrics({
      startTime: internals.startTime + 100,
      readyTime: internals.startTime + 500
    })
    analytics.setMainProcessMetrics(mainProcessMetrics(0))

    expect(analytics.getCurrentMetrics()?.totalStartupTime).toBe(500)
    await internals.autoFinalizePromise
  })
})

describe('StartupAnalytics outbox flush budget', () => {
  const REPORT_QUEUE_FILE = StorageList.STARTUP_ANALYTICS_REPORT_QUEUE

  function makeQueueItem(index: number) {
    return {
      payload: {
        metadata: { kind: 'startup' },
        sessionId: `s-${index}`
      },
      endpoint: 'http://example.test/report',
      createdAt: Date.now() - 1000 * (index + 1)
    }
  }

  function seedQueue(count: number) {
    const queue = Array.from({ length: count }, (_, index) => makeQueueItem(index))
    getMainConfigMock.mockImplementation((file?: unknown) =>
      file === REPORT_QUEUE_FILE ? queue : { entries: [], maxEntries: 10, lastUpdated: Date.now() }
    )
    return queue
  }

  afterEach(() => {
    vi.clearAllMocks()
    getMainConfigMock.mockImplementation(() => ({
      entries: [],
      maxEntries: 10,
      lastUpdated: Date.now()
    }))
  })

  it('stops the round after the first failure instead of one timeout per item', async () => {
    const queue = seedQueue(8)
    networkRequestMock.mockRejectedValue(new Error('network unavailable'))

    const analytics = new StartupAnalytics()
    await (
      analytics as unknown as { flushQueuedReports: (endpoint: string) => Promise<void> }
    ).flushQueuedReports('http://example.test/report')

    // Every queued item used to be attempted, each costing a full 12s request
    // timeout against an endpoint already known to be unreachable.
    expect(networkRequestMock).toHaveBeenCalledTimes(1)
    expect(queue.length).toBe(8)
  })

  it('carries every unattempted item back into the queue', async () => {
    seedQueue(8)
    networkRequestMock.mockRejectedValue(new Error('network unavailable'))

    const analytics = new StartupAnalytics()
    await (
      analytics as unknown as { flushQueuedReports: (endpoint: string) => Promise<void> }
    ).flushQueuedReports('http://example.test/report')

    // saveReportQueue replaces the queue wholesale, so breaking out of the loop
    // early must not silently drop the items the round never reached.
    const saved = saveMainConfigMock.mock.calls.find(
      ([file]) => file === REPORT_QUEUE_FILE
    )?.[1] as unknown[] | undefined
    expect(saved).toHaveLength(8)
  })
})

describe('StartupAnalytics telemetry consent', () => {
  const historyDocument = () => ({ entries: [], maxEntries: 10, lastUpdated: Date.now() })
  let consentEnabled = true

  beforeEach(() => {
    consentEnabled = true
    getMainConfigMock.mockImplementation((file) =>
      file === StorageList.SENTRY_CONFIG ? { enabled: consentEnabled } : historyDocument()
    )
  })

  afterEach(() => {
    getMainConfigMock.mockImplementation(() => historyDocument())
    vi.clearAllMocks()
  })

  function makeAnalytics() {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 })
    ;(analytics as unknown as { currentMetrics: StartupMetrics }).currentMetrics = makeMetrics({
      sessionId: 'consent',
      totalStartupTime: 1000,
      modulesLoadTime: 400,
      rendererStart: 10,
      rendererReady: 210,
      moduleDetails: [{ name: 'module-a', loadTime: 100, order: 0 }]
    })
    vi.spyOn(analytics, 'getHistory').mockReturnValue(historyDocument())
    const ensureOutboxFlushTask = vi.fn()
    ;(
      analytics as unknown as { ensureOutboxFlushTask: (endpoint: string) => void }
    ).ensureOutboxFlushTask = ensureOutboxFlushTask
    return { analytics, ensureOutboxFlushTask }
  }

  it('does not queue a startup report while telemetry upload is switched off', async () => {
    consentEnabled = false
    const { analytics, ensureOutboxFlushTask } = makeAnalytics()

    await analytics.reportMetrics('http://example.test')

    const queued = saveMainConfigMock.mock.calls.find(
      ([key]) => key === StorageList.STARTUP_ANALYTICS_REPORT_QUEUE
    )
    expect(queued).toBeUndefined()
    expect(ensureOutboxFlushTask).not.toHaveBeenCalled()
    expect(getMainConfigMock).toHaveBeenCalledWith(StorageList.SENTRY_CONFIG)
  })

  it('still queues the report while the switch is on (positive control)', async () => {
    const { analytics, ensureOutboxFlushTask } = makeAnalytics()

    await analytics.reportMetrics('http://example.test')

    const queued = saveMainConfigMock.mock.calls.find(
      ([key]) => key === StorageList.STARTUP_ANALYTICS_REPORT_QUEUE
    )
    expect(queued).toBeDefined()
    expect(ensureOutboxFlushTask).toHaveBeenCalledWith('http://example.test')
  })

  it('discards queued startup reports instead of uploading them once the switch is off', async () => {
    consentEnabled = false
    const { analytics } = makeAnalytics()
    const list = vi.fn(async () => [
      {
        id: 7,
        endpoint: 'http://example.test/api/telemetry/record',
        payload: { eventType: 'visit', metadata: { kind: 'startup' } },
        createdAt: Date.now(),
        retryCount: 32,
        lastError: null
      },
      {
        id: 8,
        endpoint: 'http://example.test/api/telemetry/batch',
        payload: { metadata: { kind: 'sentry.nexus.batch' }, events: [] },
        createdAt: Date.now(),
        retryCount: 0,
        lastError: null
      }
    ])
    const remove = vi.fn(async () => {})
    ;(analytics as unknown as { getReportQueueStore: () => unknown }).getReportQueueStore = () => ({
      list,
      remove,
      markAttempt: vi.fn(),
      prune: vi.fn()
    })

    await (
      analytics as unknown as { flushQueuedReports: (endpoint: string) => Promise<void> }
    ).flushQueuedReports('http://example.test/api/telemetry/record')

    expect(networkRequestMock).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(7)
    // The Sentry batch rows belong to the Sentry service's own purge, not to this one.
    expect(remove).not.toHaveBeenCalledWith(8)
  })
})

describe('StartupAnalytics outbox failure codes and idempotency', () => {
  const STARTUP_KEY = 'startup:1f0b2a3c-aaaa-4bbb-8ccc-000000000001'

  afterEach(() => {
    vi.clearAllMocks()
    getMainConfigMock.mockImplementation(() => ({
      entries: [],
      maxEntries: 10,
      lastUpdated: Date.now()
    }))
  })

  function dbItem(id: number, idempotencyKey?: string) {
    return {
      id,
      endpoint: 'http://example.test/api/telemetry/record',
      payload: {
        eventType: 'visit',
        clientId: 'client-1',
        metadata: idempotencyKey ? { kind: 'startup', idempotencyKey } : { kind: 'startup' }
      },
      createdAt: Date.now() - 1000,
      retryCount: 0,
      lastError: null
    }
  }

  async function flushDb(items: ReturnType<typeof dbItem>[]) {
    const analytics = new StartupAnalytics({ enabled: true })
    const store = {
      list: vi.fn(async () => items),
      remove: vi.fn(async () => {}),
      markAttempt: vi.fn(async () => {}),
      prune: vi.fn(async () => {})
    }
    ;(analytics as unknown as { getReportQueueStore: () => unknown }).getReportQueueStore = () =>
      store
    await (
      analytics as unknown as { flushQueuedReports: (endpoint: string) => Promise<void> }
    ).flushQueuedReports('http://example.test/api/telemetry/record')
    return store
  }

  const requestHeaders = (call = 0): Record<string, string> =>
    (networkRequestMock.mock.calls[call]?.[0] as { headers: Record<string, string> }).headers

  it('records the network error code on the outbox row instead of nothing', async () => {
    networkRequestMock.mockRejectedValue(
      Object.assign(new Error('NETWORK_TIMEOUT after 12000ms'), { code: 'NETWORK_TIMEOUT' })
    )
    const store = await flushDb([dbItem(7, STARTUP_KEY)])
    expect(store.markAttempt).toHaveBeenCalledWith(7, 'NETWORK_TIMEOUT')
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('turns an HTTP status failure into HTTP_<status>', async () => {
    networkRequestMock.mockRejectedValue(
      Object.assign(new Error('NETWORK_HTTP_STATUS_403'), { status: 403 })
    )
    const store = await flushDb([dbItem(8, STARTUP_KEY)])
    expect(store.markAttempt).toHaveBeenCalledWith(8, 'HTTP_403')
  })

  it('sends the report key as X-Idempotency-Key so a retry is de-duplicated server-side', async () => {
    networkRequestMock.mockResolvedValue({ status: 200, data: '' })
    const store = await flushDb([dbItem(9, STARTUP_KEY), dbItem(10)])
    expect(requestHeaders(0)['X-Idempotency-Key']).toBe(STARTUP_KEY)
    expect(requestHeaders(1)['X-Idempotency-Key']).toBeUndefined()
    expect(store.remove).toHaveBeenCalledTimes(2)
  })

  it('stamps every queued report with a startup:<sessionId> key', async () => {
    const analytics = new StartupAnalytics({ enabled: true, maxHistory: 5 })
    ;(analytics as unknown as { currentMetrics: StartupMetrics }).currentMetrics = makeMetrics({
      sessionId: 'session-abc-123',
      totalStartupTime: 1000,
      modulesLoadTime: 400,
      rendererStart: 10,
      rendererReady: 210,
      moduleDetails: []
    })
    vi.spyOn(analytics, 'getHistory').mockReturnValue({
      entries: [],
      maxEntries: 10,
      lastUpdated: Date.now()
    })
    ;(
      analytics as unknown as { ensureOutboxFlushTask: (endpoint: string) => void }
    ).ensureOutboxFlushTask = vi.fn()

    await analytics.reportMetrics('http://example.test')

    const queued = saveMainConfigMock.mock.calls.find(
      ([key]) => key === StorageList.STARTUP_ANALYTICS_REPORT_QUEUE
    )?.[1] as Array<{ payload: { metadata: { idempotencyKey?: string } } }>
    expect(queued?.[0]?.payload.metadata.idempotencyKey).toBe('startup:session-abc-123')
  })
})

describe('resolveStartupReportFailureCode', () => {
  it('prefers a stable code, then an HTTP status, then a code-shaped message', async () => {
    const { resolveStartupReportFailureCode } = await import('./startup-analytics')
    expect(
      resolveStartupReportFailureCode(Object.assign(new Error('x'), { code: 'NETWORK_TIMEOUT' }))
    ).toBe('NETWORK_TIMEOUT')
    expect(resolveStartupReportFailureCode(Object.assign(new Error('x'), { status: 429 }))).toBe(
      'HTTP_429'
    )
    expect(resolveStartupReportFailureCode(new Error('NETWORK_UNAVAILABLE'))).toBe(
      'NETWORK_UNAVAILABLE'
    )
    expect(resolveStartupReportFailureCode(new Error('connect ECONNREFUSED 1.2.3.4:443'))).toBe(
      'STARTUP_REPORT_FAILED'
    )
    expect(resolveStartupReportFailureCode('string error')).toBe('STARTUP_REPORT_FAILED')
    expect(resolveStartupReportFailureCode(null)).toBe('STARTUP_REPORT_FAILED')
  })
})
