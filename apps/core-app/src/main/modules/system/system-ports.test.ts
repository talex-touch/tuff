import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { registerSystemPorts, resetSystemPorts } from './system-ports'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, context?: unknown) => unknown>(),
  getAppMetrics: vi.fn(),
  getAllWebContents: vi.fn(),
  getVersion: vi.fn(() => '2.5.0-test'),
  getPath: vi.fn(() => '/tmp/tuff-test'),
  getActiveApp: vi.fn(async () => null),
  getDb: vi.fn(() => {
    throw new Error('db-not-ready')
  })
}))

vi.mock('electron', () => ({
  app: {
    getAppMetrics: mocks.getAppMetrics,
    getVersion: mocks.getVersion,
    getPath: mocks.getPath
  },
  webContents: {
    getAllWebContents: mocks.getAllWebContents
  }
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    app: {
      window: {
        window: {
          isDestroyed: () => false,
          webContents: { id: 1 }
        }
      }
    },
    transport: {
      on: vi.fn((event: { toEventName?: () => string } | string, handler) => {
        const key = typeof event === 'string' ? event : (event.toEventName?.() ?? String(event))
        mocks.handlers.set(key, handler)
        return vi.fn()
      })
    }
  }))
}))

vi.mock('../../core/native-runtime-threads', () => ({
  getNativeRuntimeBudget: vi.fn(() => [])
}))

vi.mock('../../core/worker-thread-registry', () => ({
  sampleWorkerThreads: vi.fn(async () => [])
}))

vi.mock('../../utils/perf-monitor', () => ({
  perfMonitor: {
    getRecentEventLoopLagSnapshot: vi.fn(() => null)
  }
}))

vi.mock('../../utils/workflow-debug', () => ({
  appendWorkflowDebugLog: vi.fn()
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn()
  }))
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: mocks.getDb
  }
}))

vi.mock('./active-app', () => ({
  activeAppService: {
    getActiveApp: mocks.getActiveApp
  }
}))

import { PerformanceReportModule } from './performance-report'
import { TuffDashboardModule } from './tuff-dashboard'

describe('system-ports integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    resetSystemPorts()
    mocks.getAppMetrics.mockReturnValue([
      {
        pid: 100,
        type: 'Utility',
        name: 'tuff-plugin-host',
        serviceName: undefined,
        cpu: { percentCPUUsage: 1.5, idleWakeupsPerSecond: 1 },
        memory: { workingSetSize: 100, peakWorkingSetSize: 120 },
        creationTime: 1000
      },
      {
        pid: 101,
        type: 'Utility',
        name: 'Tuff Pi Agent Runtime',
        serviceName: undefined,
        cpu: { percentCPUUsage: 2.0, idleWakeupsPerSecond: 1 },
        memory: { workingSetSize: 200, peakWorkingSetSize: 220 },
        creationTime: 1000
      },
      {
        pid: 102,
        type: 'Utility',
        name: 'Tuff OCR Runtime',
        serviceName: undefined,
        cpu: { percentCPUUsage: 0.5, idleWakeupsPerSecond: 1 },
        memory: { workingSetSize: 80, peakWorkingSetSize: 90 },
        creationTime: 1000
      },
      {
        pid: 200,
        type: 'Tab',
        name: undefined,
        serviceName: undefined,
        cpu: { percentCPUUsage: 3.0, idleWakeupsPerSecond: 2 },
        memory: { workingSetSize: 300, peakWorkingSetSize: 350 },
        creationTime: 1000
      }
    ])
    mocks.getAllWebContents.mockReturnValue([
      {
        id: 1,
        isDestroyed: () => false,
        getOSProcessId: () => 200,
        getURL: () => 'app://main'
      },
      {
        id: 2,
        isDestroyed: () => false,
        getOSProcessId: () => 200,
        getURL: () => 'app://corebox'
      },
      {
        id: 3,
        isDestroyed: () => false,
        getOSProcessId: () => 200,
        getURL: () => 'app://plugin'
      }
    ])
  })

  afterEach(() => {
    resetSystemPorts()
  })

  it('classifies utility roles and renderer surfaces using registered system performance ports', async () => {
    registerSystemPorts({
      performance: {
        resolveUtilityProcessRole: (metric) => {
          if (metric.name === 'tuff-plugin-host') return 'plugin-runtime'
          if (metric.name === 'Tuff Pi Agent Runtime') return 'pi-agent-runtime'
          if (metric.name === 'Tuff OCR Runtime') return 'ocr-runtime'
          return null
        },
        getCoreBoxWindow: () =>
          ({
            isDestroyed: () => false,
            webContents: { id: 2 }
          }) as never,
        resolvePluginNameByWebContents: (id) => (id === 3 ? 'demo-plugin' : null)
      }
    })

    const module = new PerformanceReportModule()
    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = mocks.handlers.get(AppEvents.performance.getReport.toEventName())
    expect(handler).toBeTypeOf('function')
    const report = (await handler?.(undefined, {})) as {
      processes: Array<{ pid: number; role: string; surfaces: Array<{ kind: string; pluginName: string | null }> }>
    }

    expect(report.processes.find((p) => p.pid === 100)?.role).toBe('plugin-runtime')
    expect(report.processes.find((p) => p.pid === 101)?.role).toBe('pi-agent-runtime')
    expect(report.processes.find((p) => p.pid === 102)?.role).toBe('ocr-runtime')
    expect(report.processes.find((p) => p.pid === 200)?.surfaces).toEqual([
      { kind: 'main-window', pluginName: null },
      { kind: 'corebox', pluginName: null },
      { kind: 'plugin-view', pluginName: 'demo-plugin' }
    ])
    module.onDestroy()
  })

  it('falls back to safe utility role and unknown surfaces when performance ports are unregistered', async () => {
    const module = new PerformanceReportModule()
    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = mocks.handlers.get(AppEvents.performance.getReport.toEventName())
    const report = (await handler?.(undefined, {})) as {
      processes: Array<{ pid: number; role: string; surfaces: Array<{ kind: string; pluginName: string | null }> }>
    }

    expect(report.processes.find((p) => p.pid === 100)?.role).toBe('utility')
    expect(report.processes.find((p) => p.pid === 200)?.surfaces).toEqual([
      { kind: 'main-window', pluginName: null },
      { kind: 'other', pluginName: null },
      { kind: 'other', pluginName: null }
    ])
    module.onDestroy()
  })

  it('builds dashboard indexing, OCR, and worker sections via registered dashboard ports', async () => {
    registerSystemPorts({
      dashboard: {
        getIndexingProgress: async () => ({
          summary: { completed: 2 },
          entries: [
            {
              path: '/Users/demo/notes.md',
              status: 'completed',
              progress: 100,
              processedBytes: 512,
              totalBytes: 512,
              updatedAt: new Date('2026-05-01T00:00:00.000Z'),
              lastError: null
            }
          ]
        }),
        getWatchedPaths: () => ['/Users/demo/Documents'],
        getWorkerStatusSnapshot: async () => ({
          summary: { total: 1, busy: 0, idle: 1, offline: 0 },
          workers: [
            {
              name: 'file-scan',
              threadId: 7,
              state: 'idle',
              pending: 0,
              lastTask: null,
              lastError: null,
              uptimeMs: 1200,
              metrics: null
            }
          ]
        }),
        getOcrDashboardSnapshot: async (limit) => ({
          jobs: [{ id: 1, limit }]
        })
      }
    })

    const module = new TuffDashboardModule()
    await module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = mocks.handlers.get('tuff:dashboard')
    expect(handler).toBeTypeOf('function')
    const response = (await handler?.({ limit: 10 })) as {
      ok: boolean
      snapshot: {
        indexing: { summary: Record<string, number>; watchedPathNames: string[]; entries: unknown[] }
        ocr: { jobs: unknown[] }
        workers: { summary: { total: number; idle: number }; workers: Array<{ name: string }> }
      }
    }

    expect(response.ok).toBe(true)
    expect(response.snapshot.indexing.summary).toEqual({ completed: 2 })
    expect(response.snapshot.indexing.watchedPathNames).toEqual(['Documents'])
    expect(response.snapshot.indexing.entries).toHaveLength(1)
    expect(response.snapshot.ocr).toEqual({ jobs: [{ id: 1, limit: 10 }] })
    expect(response.snapshot.workers.summary).toEqual({ total: 1, busy: 0, idle: 1, offline: 0 })
    expect(response.snapshot.workers.workers[0]?.name).toBe('file-scan')
  })
})
