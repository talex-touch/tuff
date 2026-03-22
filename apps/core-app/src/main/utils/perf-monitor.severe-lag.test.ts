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

import { perfMonitor } from './perf-monitor'

describe('perf-monitor severe lag burst', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T00:00:00.000Z'))
    const monitor = perfMonitor as any
    monitor.severeLagWindowHits = []
    monitor.lastSevereLagBurstAt = 0
    monitor.lastEventLoopLag = null
    monitor.severeLagBurstListeners = new Set()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('30s 内 2 次 >=2000ms 触发一次 burst，冷却期内不重复触发', () => {
    const recordLag = (lagMs: number, severity: 'warn' | 'error') =>
      (perfMonitor as any).recordEventLoopLag(lagMs, severity)
    const events: Array<{ latestLagMs: number }> = []
    const dispose = perfMonitor.onSevereLagBurst((event) => {
      events.push(event)
    })

    recordLag(2100, 'error')
    expect(events).toHaveLength(0)

    vi.setSystemTime(new Date('2026-03-22T00:00:10.000Z'))
    recordLag(2200, 'error')
    expect(events).toHaveLength(1)
    expect(events[0]?.latestLagMs).toBe(2200)

    vi.setSystemTime(new Date('2026-03-22T00:00:20.000Z'))
    recordLag(2300, 'error')
    vi.setSystemTime(new Date('2026-03-22T00:00:25.000Z'))
    recordLag(2400, 'error')
    expect(events).toHaveLength(1)

    dispose()
  })

  it('可读取最近一次 event loop lag 快照', () => {
    const recordLag = (lagMs: number, severity: 'warn' | 'error') =>
      (perfMonitor as any).recordEventLoopLag(lagMs, severity)

    recordLag(512, 'warn')
    const snapshot = perfMonitor.getRecentEventLoopLagSnapshot()
    expect(snapshot?.lagMs).toBe(512)
    expect(snapshot?.severity).toBe('warn')
    expect(typeof snapshot?.at).toBe('number')
  })
})
