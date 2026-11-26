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
  getPerfContextSnapshot: () => [],
  getRecentPerfContextSnapshot: () => [],
  markPerfEventLoopLag: vi.fn()
}))

vi.mock('./workflow-debug', () => ({
  appendWorkflowDebugLog: vi.fn()
}))

import { inferEventLoopLagCause, perfMonitor, selectPrimaryPerfContext } from './perf-monitor'
import { idleBudgetCoordinator } from '../service/idle-budget-coordinator'

type PerfMonitorTestAccess = {
  severeLagWindowHits: number[]
  lastSevereLagBurstAt: number
  lastEventLoopLag: null
  severeLagBurstListeners: Set<unknown>
  recordEventLoopLag: (lagMs: number, severity: 'warn' | 'error') => void
}

function getPerfMonitorTestAccess(): PerfMonitorTestAccess {
  return perfMonitor as unknown as PerfMonitorTestAccess
}

describe('perf-monitor severe lag burst', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T00:00:00.000Z'))
    const monitor = getPerfMonitorTestAccess()
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
      getPerfMonitorTestAccess().recordEventLoopLag(lagMs, severity)
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
      getPerfMonitorTestAccess().recordEventLoopLag(lagMs, severity)

    recordLag(512, 'warn')
    const snapshot = perfMonitor.getRecentEventLoopLagSnapshot()
    expect(snapshot?.lagMs).toBe(512)
    expect(snapshot?.severity).toBe('warn')
    expect(typeof snapshot?.at).toBe('number')
  })

  it('在无上下文且无队列负载时将严重 lag 标记为 native/system stall', () => {
    const cause = inferEventLoopLagCause({
      lagMs: 2800,
      contextsCount: 0,
      pollingActiveCount: 0,
      queueDepthByLane: {
        critical: { queued: 0, inFlight: 0 },
        realtime: { queued: 0, inFlight: 0 },
        io: { queued: 0, inFlight: 0 },
        maintenance: { queued: 0, inFlight: 0 },
        serial: { queued: 0, inFlight: 0 }
      },
      pollingRecentMaxDurationMs: 1,
      pollingRecentMaxSchedulerDelayMs: 0
    })

    expect(cause).toBe('native_or_system_stall')
  })
})

describe('inferEventLoopLagCause attribution', () => {
  const idleLanes = {
    critical: { queued: 0, inFlight: 0 },
    realtime: { queued: 0, inFlight: 0 },
    io: { queued: 0, inFlight: 0 },
    maintenance: { queued: 0, inFlight: 0 },
    serial: { queued: 0, inFlight: 0 }
  }

  it('does not blame a polling task that is merely in flight', async () => {
    const { inferEventLoopLagCause } = await import('./perf-monitor')
    const cause = inferEventLoopLagCause({
      lagMs: 2500,
      contextsCount: 0,
      recentContextsCount: 0,
      pollingActiveCount: 1,
      queueDepthByLane: { ...idleLanes, io: { queued: 0, inFlight: 1 } },
      pollingRecentMaxDurationMs: 1,
      pollingRecentMaxSchedulerDelayMs: 700
    })

    expect(cause).toBe('unattributed_main_thread_block')
  })

  it('still reports a backlog when tasks are queued behind the loop', async () => {
    const { inferEventLoopLagCause } = await import('./perf-monitor')
    const cause = inferEventLoopLagCause({
      lagMs: 2500,
      contextsCount: 0,
      recentContextsCount: 0,
      pollingActiveCount: 1,
      queueDepthByLane: { ...idleLanes, io: { queued: 2, inFlight: 1 } },
      pollingRecentMaxDurationMs: 1,
      pollingRecentMaxSchedulerDelayMs: 700
    })

    expect(cause).toBe('polling_queue_backlog')
  })

  it('treats a context that closed inside the lag span as the attribution', async () => {
    const { inferEventLoopLagCause } = await import('./perf-monitor')
    const cause = inferEventLoopLagCause({
      lagMs: 2500,
      contextsCount: 0,
      recentContextsCount: 1,
      pollingActiveCount: 1,
      queueDepthByLane: { ...idleLanes, io: { queued: 0, inFlight: 1 } },
      pollingRecentMaxDurationMs: 1,
      pollingRecentMaxSchedulerDelayMs: 700
    })

    expect(cause).toBeNull()
  })

  it('prefers blocking contexts over longer async duration contexts for primary attribution', () => {
    expect(
      selectPrimaryPerfContext([
        { label: 'Intelligence.invoke', durationMs: 34086, mode: 'duration' },
        { label: 'IndexingDiagnostics.source', durationMs: 498, mode: 'blocking' }
      ])?.label
    ).toBe('IndexingDiagnostics.source')

    expect(
      selectPrimaryPerfContext([
        { label: 'Intelligence.invoke', durationMs: 34086, mode: 'duration' },
        { label: 'DownloadCenter.cleanupTempFiles', durationMs: 349, mode: 'duration' }
      ])?.label
    ).toBe('Intelligence.invoke')
  })
})

describe('perf-monitor idle budget gating', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'))
    pollingServiceMock.isRegistered.mockReturnValue(false)
    pollingServiceMock.register.mockClear()
    pollingServiceMock.unregister.mockClear()
    pollingServiceMock.start.mockClear()
    perfMonitor.stop()
    idleBudgetCoordinator.destroy()
  })

  afterEach(() => {
    perfMonitor.stop()
    idleBudgetCoordinator.destroy()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('pauses the 100ms event-loop interval and polling tasks in background-hidden/system-suspended and resumes without duplicates', () => {
    const coordinatorInternal = idleBudgetCoordinator as unknown as {
      transitionTo: (
        state: 'active' | 'background-hidden' | 'system-suspended',
        reason: string
      ) => void
    }

    perfMonitor.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(pollingServiceMock.register).toHaveBeenCalledTimes(2)

    // Calling start() again does not duplicate the 100ms timer.
    perfMonitor.start()
    expect(vi.getTimerCount()).toBe(1)

    // Entering background-hidden clears the 100ms interval and unregisters summary/heap tasks.
    coordinatorInternal.transitionTo('background-hidden', 'window-hidden-grace-elapsed')
    expect(vi.getTimerCount()).toBe(0)
    expect(pollingServiceMock.unregister).toHaveBeenCalledWith('perf-monitor.summary')
    expect(pollingServiceMock.unregister).toHaveBeenCalledWith('perf-monitor.heap')

    // Entering system-suspended keeps timer count at 0.
    coordinatorInternal.transitionTo('system-suspended', 'power-suspend')
    expect(vi.getTimerCount()).toBe(0)

    // Returning to active restores exactly one 100ms timer and re-registers polling tasks.
    pollingServiceMock.register.mockClear()
    coordinatorInternal.transitionTo('active', 'power-resume')
    expect(vi.getTimerCount()).toBe(1)
    expect(pollingServiceMock.register).toHaveBeenCalledTimes(2)

    // Stopping cleans up the interval and unsubscribes so subsequent active transitions do not revive timers.
    perfMonitor.stop()
    expect(vi.getTimerCount()).toBe(0)
    coordinatorInternal.transitionTo('background-hidden', 'window-hidden-grace-elapsed')
    coordinatorInternal.transitionTo('active', 'window-visible')
    expect(vi.getTimerCount()).toBe(0)
  })
})
