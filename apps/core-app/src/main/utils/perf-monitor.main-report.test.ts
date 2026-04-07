import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pollingServiceMock } = vi.hoisted(() => ({
  pollingServiceMock: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(),
    start: vi.fn(),
    unregister: vi.fn(),
    getDiagnostics: vi.fn(() => ({
      activeTasks: [],
      recentTasks: [],
      startAttempts: []
    }))
  }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => pollingServiceMock
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    off: vi.fn()
  },
  powerMonitor: {
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('../modules/sentry/sentry-service', () => ({
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    isEnabled: () => false,
    queueNexusTelemetry: vi.fn()
  })
}))

vi.mock('./perf-context', () => ({
  getPerfContextSnapshot: () => []
}))

vi.mock('./workflow-debug', () => ({
  appendWorkflowDebugLog: vi.fn()
}))

import type { PerfSummary } from './perf-monitor'
import { perfMonitor, setPerfSummaryReporter } from './perf-monitor'

type PerfMonitorInternals = {
  incidents: Array<{ kind: string; severity: string }>
  ipcAggregates: Map<string, unknown>
  loopLagAggregate: {
    count: number
    warnCount: number
    errorCount: number
    maxDurationMs: number
    lastAt: number
  }
}

function ensureSummary(value: PerfSummary | null): PerfSummary {
  if (!value) {
    throw new Error('expected summary reporter to be called')
  }
  return value
}

describe('perf-monitor main report', () => {
  beforeEach(() => {
    const monitor = perfMonitor as unknown as PerfMonitorInternals
    monitor.incidents = []
    monitor.ipcAggregates = new Map()
    monitor.loopLagAggregate = {
      count: 0,
      warnCount: 0,
      errorCount: 0,
      maxDurationMs: 0,
      lastAt: 0
    }
  })

  afterEach(() => {
    setPerfSummaryReporter(null)
  })

  it('recordMainReport 写入 main.* 事件并进入 summary', () => {
    let summary: PerfSummary | null = null
    setPerfSummaryReporter((value) => {
      summary = value
    })

    perfMonitor.recordMainReport({
      kind: 'clipboard.check.slow',
      eventName: 'image_pipeline',
      durationMs: 640,
      level: 'warn',
      meta: { phaseAlertLevel: 'medium' }
    })

    perfMonitor.flushSummary()

    expect(summary).toBeTruthy()
    const captured = ensureSummary(summary)

    expect(captured.kinds).toContain('main.clipboard.check.slow=1')
    expect(captured.topSlow[0]?.name).toBe('image_pipeline')
    expect(
      captured.topEvents.some((entry: { key: string }) => entry.key.endsWith(':image_pipeline'))
    ).toBe(true)
    expect(captured.topPhaseCodes.some((entry) => entry.code === 'image_pipeline')).toBe(true)
  })

  it('recordMainReport 在无 level 时按阈值判定 severity', () => {
    const monitor = perfMonitor as unknown as PerfMonitorInternals
    const beforeCount = Array.isArray(monitor.incidents) ? monitor.incidents.length : 0

    perfMonitor.recordMainReport({
      kind: 'clipboard.cache.hydrate.slow',
      eventName: 'gate_wait',
      durationMs: 1300
    })

    const incidents = monitor.incidents
    expect(incidents.length).toBeGreaterThan(beforeCount)
    expect(incidents[incidents.length - 1]?.kind).toBe('main.clipboard.cache.hydrate.slow')
    expect(incidents[incidents.length - 1]?.severity).toBe('error')
  })
})
