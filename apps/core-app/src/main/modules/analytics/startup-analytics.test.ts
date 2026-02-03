import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StartupMetrics } from './types'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    isPackaged: false
  }
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

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => ({ entries: [], maxEntries: 10, lastUpdated: Date.now() })),
  saveMainConfig: vi.fn()
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
    getEnvOrDefault: (_key: string, fallback: string) => fallback,
    getTelemetryApiBase: () => 'http://example.test',
    normalizeBaseUrl: (value: string) => value
  }
})

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
    ;(analytics as unknown as { flushQueuedReports: () => Promise<void> }).flushQueuedReports =
      vi.fn()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => ''
    })
    vi.stubGlobal('fetch', fetchMock)

    await analytics.reportMetrics('http://example.test')

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request[1].body as string)
    expect(body.metadata.startupSummary).toBeDefined()
    expect(body.metadata.moduleSummary).toBeDefined()
    expect(body.metadata.startupSummary.samples).toBe(2)
    expect(body.metadata.moduleSummary['module-a'].avgLoadTime).toBe(100)
  })
})
