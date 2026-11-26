import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TalexEvents } from '../core/eventbus/touch-event'
import { FileProviderContentCapacityService } from '../modules/box-tool/addon/files/services/file-provider-content-capacity-service'
import { SystemSampler } from '../modules/analytics/collectors/system-sampler'
import { ErrorLogger } from '../modules/download/error-logger'
import {
  IDLE_BUDGET_HIDDEN_PRESSURE_REASON,
  IDLE_BUDGET_SUSPENDED_PRESSURE_REASON,
  IdleBudgetCoordinator,
  idleBudgetCoordinator,
  isStatePausedFor,
  type IdleBudgetSnapshot,
  type IdleBudgetWindowLike
} from './idle-budget-coordinator'

class FakeWindow extends EventEmitter implements IdleBudgetWindowLike {
  visible: boolean
  minimized = false
  destroyed = false

  constructor(visible = true) {
    super()
    this.visible = visible
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isVisible(): boolean {
    return !this.destroyed && this.visible
  }

  isMinimized(): boolean {
    return !this.destroyed && this.minimized
  }

  hide(): void {
    this.visible = false
    this.emit('hide')
  }

  show(): void {
    this.visible = true
    this.minimized = false
    this.emit('show')
  }

  minimize(): void {
    this.minimized = true
    this.emit('minimize')
  }

  restore(): void {
    this.minimized = false
    this.visible = true
    this.emit('restore')
  }

  close(): void {
    this.visible = false
    this.destroyed = true
    this.emit('closed')
  }
}

class FakeEventBus {
  private readonly handlers = new Map<TalexEvents, Set<(...args: unknown[]) => void>>()

  on(event: TalexEvents, listener: (...args: unknown[]) => void): void {
    const set = this.handlers.get(event) ?? new Set()
    if (set.has(listener)) {
      throw new Error(`Duplicate handler for ${event}`)
    }
    set.add(listener)
    this.handlers.set(event, set)
  }

  off(event: TalexEvents, listener: (...args: unknown[]) => void): void {
    const set = this.handlers.get(event)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) {
      this.handlers.delete(event)
    }
  }

  emit(event: TalexEvents, ...args: unknown[]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of [...set]) {
      handler(...args)
    }
  }

  listenerCount(event?: TalexEvents): number {
    if (event) {
      return this.handlers.get(event)?.size ?? 0
    }
    let total = 0
    for (const set of this.handlers.values()) total += set.size
    return total
  }
}

function resetSingletonCoordinator(): void {
  idleBudgetCoordinator.destroy()
}

function resetPollingSingleton(): void {
  const service = PollingService.getInstance()
  service.stop('idle-budget test reset')
  const internal = service as unknown as {
    tasks: Map<string, unknown>
    pressureStates: Map<string, unknown>
  }
  for (const id of Array.from(internal.tasks.keys())) {
    service.unregister(id)
  }
  for (const reason of Array.from(internal.pressureStates.keys())) {
    service.clearGlobalPressure(reason)
  }
}

describe('IdleBudgetCoordinator state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'))
    resetSingletonCoordinator()
    resetPollingSingleton()
  })

  afterEach(() => {
    resetSingletonCoordinator()
    resetPollingSingleton()
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('transitions active -> background-hidden after grace window and immediately back to active on show', () => {
    const pm = new EventEmitter()
    const appEmitter = new EventEmitter()
    const bus = new FakeEventBus()
    const mainWin = new FakeWindow(true)
    const coreBoxWin = new FakeWindow(false)
    const windows = [mainWin, coreBoxWin]
    const setGlobalPressure = vi.fn()
    const clearGlobalPressure = vi.fn()

    const coordinator = new IdleBudgetCoordinator({
      hiddenGraceMs: 15_000,
      powerMonitor: pm,
      app: appEmitter,
      getAllWindows: () => windows,
      eventBus: bus,
      pollingService: { setGlobalPressure, clearGlobalPressure }
    })

    const snapshots: IdleBudgetSnapshot[] = []
    coordinator.subscribe((snapshot) => snapshots.push(snapshot))
    coordinator.start()

    expect(coordinator.getState()).toBe('active')
    expect(coordinator.isPausedFor('background-hidden')).toBe(false)
    expect(coordinator.isPausedFor('system-suspended')).toBe(false)

    // Hide main window -> grace timer arms, state stays active until grace elapses.
    mainWin.hide()
    vi.advanceTimersByTime(14_999)
    expect(coordinator.getState()).toBe('active')
    expect(snapshots).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(coordinator.getState()).toBe('background-hidden')
    expect(coordinator.isPausedFor('background-hidden')).toBe(true)
    expect(coordinator.isPausedFor('system-suspended')).toBe(false)
    expect(snapshots.at(-1)).toMatchObject({
      state: 'background-hidden',
      previousState: 'active',
      reason: 'window-hidden-grace-elapsed',
      hasVisibleWindow: false
    })
    expect(setGlobalPressure).toHaveBeenCalledWith({
      reason: IDLE_BUDGET_HIDDEN_PRESSURE_REASON,
      pausedLanes: ['maintenance']
    })

    // Showing CoreBox immediately restores active state with 0ms delay.
    coreBoxWin.show()
    expect(coordinator.getState()).toBe('active')
    expect(snapshots.at(-1)).toMatchObject({
      state: 'active',
      previousState: 'background-hidden',
      reason: 'window-visible',
      hasVisibleWindow: true
    })
    expect(clearGlobalPressure).toHaveBeenCalledWith(IDLE_BUDGET_HIDDEN_PRESSURE_REASON)

    coordinator.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels hidden grace timer when a window reappears before grace elapses and stays active while any window is visible', () => {
    const pm = new EventEmitter()
    const appEmitter = new EventEmitter()
    const bus = new FakeEventBus()
    const mainWin = new FakeWindow(true)
    const coreBoxWin = new FakeWindow(true)

    const coordinator = new IdleBudgetCoordinator({
      hiddenGraceMs: 10_000,
      powerMonitor: pm,
      app: appEmitter,
      getAllWindows: () => [mainWin, coreBoxWin],
      eventBus: bus,
      pollingService: null
    })

    const states: string[] = []
    coordinator.subscribe((snapshot) => states.push(snapshot.state))
    coordinator.start()

    // Hiding only CoreBox while Main is visible does not arm idle transition.
    coreBoxWin.hide()
    vi.advanceTimersByTime(30_000)
    expect(coordinator.getState()).toBe('active')
    expect(states).toEqual([])

    // Minimizing main window starts grace, restoring before grace expires cancels it.
    mainWin.minimize()
    vi.advanceTimersByTime(5_000)
    mainWin.restore()
    vi.advanceTimersByTime(20_000)
    expect(coordinator.getState()).toBe('active')
    expect(states).toEqual([])

    coordinator.destroy()
  })

  it('handles suspend/resume and lock-screen/unlock-screen transitions without prematurely waking hidden windows', () => {
    const pm = new EventEmitter()
    const appEmitter = new EventEmitter()
    const bus = new FakeEventBus()
    const mainWin = new FakeWindow(true)
    const setGlobalPressure = vi.fn()
    const clearGlobalPressure = vi.fn()

    const coordinator = new IdleBudgetCoordinator({
      hiddenGraceMs: 15_000,
      powerMonitor: pm,
      app: appEmitter,
      getAllWindows: () => [mainWin],
      eventBus: bus,
      pollingService: { setGlobalPressure, clearGlobalPressure }
    })

    const snapshots: IdleBudgetSnapshot[] = []
    coordinator.subscribe((snapshot) => snapshots.push(snapshot))
    coordinator.start()

    // Lock screen immediately enters system-suspended.
    pm.emit('lock-screen')
    expect(coordinator.getState()).toBe('system-suspended')
    expect(isStatePausedFor(coordinator.getState(), 'system-suspended')).toBe(true)
    expect(isStatePausedFor(coordinator.getState(), 'background-hidden')).toBe(true)
    expect(setGlobalPressure).toHaveBeenLastCalledWith({
      reason: IDLE_BUDGET_SUSPENDED_PRESSURE_REASON,
      pausedLanes: ['realtime', 'io', 'maintenance', 'serial']
    })

    // System suspends while already locked, then resumes while screen is still locked -> stays system-suspended.
    pm.emit('suspend')
    pm.emit('resume')
    expect(coordinator.getState()).toBe('system-suspended')

    // Hide main window before unlock; unlocking transitions to background-hidden (not active).
    mainWin.visible = false
    pm.emit('unlock-screen')
    expect(coordinator.getState()).toBe('background-hidden')
    expect(snapshots.at(-1)).toMatchObject({
      state: 'background-hidden',
      previousState: 'system-suspended',
      reason: 'power-unlock-screen',
      hasVisibleWindow: false
    })

    // Suspend directly from background-hidden, show window while asleep, resume -> active.
    pm.emit('suspend')
    expect(coordinator.getState()).toBe('system-suspended')
    mainWin.visible = true
    pm.emit('resume')
    expect(coordinator.getState()).toBe('active')
    expect(snapshots.at(-1)).toMatchObject({
      state: 'active',
      previousState: 'system-suspended',
      reason: 'power-resume',
      hasVisibleWindow: true
    })

    coordinator.destroy()
  })

  it('tracks dynamically created windows, detaches closed windows, and cleans up all listeners and timers on destroy without fake wakeup', () => {
    const pm = new EventEmitter()
    const appEmitter = new EventEmitter()
    const bus = new FakeEventBus()
    const windows: FakeWindow[] = []

    const coordinator = new IdleBudgetCoordinator({
      hiddenGraceMs: 10_000,
      powerMonitor: pm,
      app: appEmitter,
      getAllWindows: () => windows,
      eventBus: bus,
      pollingService: null
    })

    const snapshots: IdleBudgetSnapshot[] = []
    coordinator.subscribe((snapshot) => snapshots.push(snapshot))

    // Idempotent start() attaches listeners exactly once.
    coordinator.start()
    coordinator.start()
    expect(pm.listenerCount('suspend')).toBe(1)
    expect(pm.listenerCount('resume')).toBe(1)
    expect(pm.listenerCount('lock-screen')).toBe(1)
    expect(pm.listenerCount('unlock-screen')).toBe(1)
    expect(appEmitter.listenerCount('browser-window-created')).toBe(1)
    expect(bus.listenerCount()).toBe(4)

    // No windows at startup -> transitions to background-hidden after grace.
    vi.advanceTimersByTime(10_000)
    expect(coordinator.getState()).toBe('background-hidden')

    // Dynamic window creation wakes to active.
    const lateWin = new FakeWindow(true)
    windows.push(lateWin)
    appEmitter.emit('browser-window-created', {}, lateWin)
    expect(coordinator.getState()).toBe('active')
    expect(lateWin.listenerCount('hide')).toBe(1)

    // Closing the window detaches its listeners and arms grace timer.
    lateWin.close()
    expect(lateWin.listenerCount('hide')).toBe(0)
    expect(lateWin.listenerCount('show')).toBe(0)
    expect(vi.getTimerCount()).toBe(1)

    // Destroy while hidden grace is pending -> cancels timer, detaches all listeners, does NOT emit active.
    vi.advanceTimersByTime(10_000)
    expect(coordinator.getState()).toBe('background-hidden')
    const countBeforeDestroy = snapshots.length

    coordinator.destroy()
    expect(snapshots).toHaveLength(countBeforeDestroy)
    expect(vi.getTimerCount()).toBe(0)
    expect(pm.listenerCount('suspend')).toBe(0)
    expect(pm.listenerCount('resume')).toBe(0)
    expect(pm.listenerCount('lock-screen')).toBe(0)
    expect(pm.listenerCount('unlock-screen')).toBe(0)
    expect(appEmitter.listenerCount('browser-window-created')).toBe(0)
    expect(bus.listenerCount()).toBe(0)
  })
})

describe('Idle budget consumer integrations (fake timers, zero timer leaks)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'))
    resetSingletonCoordinator()
    resetPollingSingleton()
  })

  afterEach(() => {
    resetSingletonCoordinator()
    resetPollingSingleton()
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('pauses FileProviderContentCapacityService statfs interval in background-hidden/system-suspended and resumes without duplicates', async () => {
    const statfsMock = vi.fn(async () => ({ bavail: 10n * 1024n ** 3n, bsize: 1n }))
    const service = new FileProviderContentCapacityService({
      getDirectory: () => '/tmp/tuff-capacity-test',
      statfs: statfsMock,
      checkIntervalMs: 30_000
    })

    // Drive singleton coordinator state directly via private transition helper or mock start.
    const pm = new EventEmitter()
    const coordinatorInternal = idleBudgetCoordinator as unknown as {
      getPowerMonitor: () => EventEmitter
      getApp: () => null
      getAllWindows: () => IdleBudgetWindowLike[]
      getEventBus: () => null
      hiddenGraceMs: number
    }
    const win = new FakeWindow(true)
    const origGetPm = coordinatorInternal.getPowerMonitor
    const origGetApp = coordinatorInternal.getApp
    const origGetWins = coordinatorInternal.getAllWindows
    const origGetBus = coordinatorInternal.getEventBus
    const origGrace = coordinatorInternal.hiddenGraceMs

    coordinatorInternal.getPowerMonitor = () => pm
    coordinatorInternal.getApp = () => null
    coordinatorInternal.getAllWindows = () => [win]
    coordinatorInternal.getEventBus = () => null
    coordinatorInternal.hiddenGraceMs = 5_000

    try {
      idleBudgetCoordinator.start()
      service.start()

      await vi.advanceTimersByTimeAsync(30_000)
      expect(statfsMock).toHaveBeenCalledTimes(1)

      // Hide window -> enter background-hidden -> 0 statfs polls over 5 minutes.
      win.hide()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(idleBudgetCoordinator.getState()).toBe('background-hidden')
      statfsMock.mockClear()

      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(statfsMock).toHaveBeenCalledTimes(0)

      // Suspend -> still 0 polls.
      pm.emit('suspend')
      expect(idleBudgetCoordinator.getState()).toBe('system-suspended')
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(statfsMock).toHaveBeenCalledTimes(0)

      // Resume + show window -> resumes with exactly 1 poll per 30s (no duplicate intervals).
      win.visible = true
      pm.emit('resume')
      expect(idleBudgetCoordinator.getState()).toBe('active')

      await vi.advanceTimersByTimeAsync(30_000)
      expect(statfsMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(statfsMock).toHaveBeenCalledTimes(2)

      service.dispose()
      idleBudgetCoordinator.destroy()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      service.dispose()
      idleBudgetCoordinator.destroy()
      coordinatorInternal.getPowerMonitor = origGetPm
      coordinatorInternal.getApp = origGetApp
      coordinatorInternal.getAllWindows = origGetWins
      coordinatorInternal.getEventBus = origGetBus
      coordinatorInternal.hiddenGraceMs = origGrace
    }
  })

  it('pauses and resumes SystemSampler cleanly without duplicate polling registrations', async () => {
    const samples: number[] = []
    const sampler = new SystemSampler((sample) => samples.push(sample.timestamp), 5_000)

    sampler.start({ initialDelayMs: 5_000 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(samples).toHaveLength(1)

    sampler.pause()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(samples).toHaveLength(1)

    // Calling resume multiple times never creates duplicate polling tasks.
    sampler.resume()
    sampler.resume()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(samples).toHaveLength(2)

    sampler.stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(samples).toHaveLength(2)
  })

  it('keeps download ErrorLogger at 0 Hz when buffer is empty and flushes once on demand', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-error-logger-'))
    const logger = new ErrorLogger(tmpDir)
    try {
      await logger.initialize()
      // Zero idle timers armed when no logs have been written.
      expect(vi.getTimerCount()).toBe(0)

      await logger.logWarn('transient warning')
      expect(vi.getTimerCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(5_000)
      expect(vi.getTimerCount()).toBe(0)

      // Await the in-flight disk append (fake timers do not block real libuv fs I/O).
      await (logger as unknown as { flushInFlight?: Promise<void> | null }).flushInFlight

      const content = await logger.readLogs()
      expect(content).toContain('transient warning')

      await logger.destroy()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await logger.destroy()
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
