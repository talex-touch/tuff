import type {
  PollingPressureOptions,
  PollingTaskLane
} from '@talex-touch/utils/common/utils/polling'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import * as electron from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { createLogger } from '../utils/logger'

const idleBudgetLog = createLogger('IdleBudget')

export type IdleBudgetState = 'active' | 'background-hidden' | 'system-suspended'

export type IdlePauseLevel = 'background-hidden' | 'system-suspended'

export type IdleBudgetTransitionReason =
  | 'init'
  | 'window-visible'
  | 'window-hidden-grace-elapsed'
  | 'power-suspend'
  | 'power-lock-screen'
  | 'power-resume'
  | 'power-unlock-screen'
  | 'destroy'

export interface IdleBudgetSnapshot {
  state: IdleBudgetState
  previousState: IdleBudgetState | null
  reason: IdleBudgetTransitionReason
  changedAt: number
  systemSuspended: boolean
  screenLocked: boolean
  hasVisibleWindow: boolean
}

export type IdleBudgetListener = (snapshot: IdleBudgetSnapshot) => void

export interface IdleBudgetWindowLike {
  isDestroyed?: () => boolean
  isVisible?: () => boolean
  isMinimized?: () => boolean
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown
}

export interface IdleBudgetPowerMonitorAdapter {
  on: (event: string, listener: () => void) => unknown
  off?: (event: string, listener: () => void) => unknown
  removeListener?: (event: string, listener: () => void) => unknown
}

export interface IdleBudgetAppAdapter {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown
}

export interface IdleBudgetEventBusAdapter {
  on: (event: TalexEvents, listener: (...args: unknown[]) => void) => unknown
  off: (event: TalexEvents, listener: (...args: unknown[]) => void) => unknown
}

export interface IdleBudgetPollingAdapter {
  setGlobalPressure?: (options: PollingPressureOptions) => void
  clearGlobalPressure?: (reason: string) => void
}

export interface IdleBudgetCoordinatorOptions {
  hiddenGraceMs?: number
  now?: () => number
  powerMonitor?: IdleBudgetPowerMonitorAdapter | null
  app?: IdleBudgetAppAdapter | null
  getAllWindows?: () => IdleBudgetWindowLike[]
  eventBus?: IdleBudgetEventBusAdapter | null
  pollingService?: IdleBudgetPollingAdapter | null
}

export const DEFAULT_IDLE_BUDGET_HIDDEN_GRACE_MS = 15_000
export const IDLE_BUDGET_HIDDEN_PRESSURE_REASON = 'idle-budget:background-hidden'
export const IDLE_BUDGET_SUSPENDED_PRESSURE_REASON = 'idle-budget:system-suspended'

const BACKGROUND_HIDDEN_PAUSED_LANES: PollingTaskLane[] = ['maintenance']
const SYSTEM_SUSPENDED_PAUSED_LANES: PollingTaskLane[] = ['realtime', 'io', 'maintenance', 'serial']

export function isStatePausedFor(state: IdleBudgetState, level: IdlePauseLevel): boolean {
  if (level === 'system-suspended') {
    return state === 'system-suspended'
  }
  return state === 'background-hidden' || state === 'system-suspended'
}

function removeEmitterListener(
  emitter:
    | {
        off?: (event: string, listener: (...args: unknown[]) => void) => unknown
        removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown
      }
    | null
    | undefined,
  event: string,
  listener: (...args: unknown[]) => void
): void {
  if (!emitter) return
  if (typeof emitter.off === 'function') {
    emitter.off(event, listener)
    return
  }
  if (typeof emitter.removeListener === 'function') {
    emitter.removeListener(event, listener)
  }
}

type ElectronNamespaceLike = {
  powerMonitor?: Partial<IdleBudgetPowerMonitorAdapter>
  app?: Partial<IdleBudgetAppAdapter>
  BrowserWindow?: { getAllWindows?: () => IdleBudgetWindowLike[] }
  default?: {
    powerMonitor?: Partial<IdleBudgetPowerMonitorAdapter>
    app?: Partial<IdleBudgetAppAdapter>
    BrowserWindow?: { getAllWindows?: () => IdleBudgetWindowLike[] }
  }
}

function getElectronNamespace(): ElectronNamespaceLike {
  return electron as unknown as ElectronNamespaceLike
}

function resolveDefaultPowerMonitor(): IdleBudgetPowerMonitorAdapter | null {
  const ns = getElectronNamespace()
  const pm = ns?.powerMonitor ?? ns?.default?.powerMonitor
  if (typeof pm?.on === 'function') {
    return pm as IdleBudgetPowerMonitorAdapter
  }
  return null
}

function resolveDefaultApp(): IdleBudgetAppAdapter | null {
  const ns = getElectronNamespace()
  const electronApp = ns?.app ?? ns?.default?.app
  if (typeof electronApp?.on === 'function') {
    return electronApp as IdleBudgetAppAdapter
  }
  return null
}

function resolveDefaultWindows(): IdleBudgetWindowLike[] {
  const ns = getElectronNamespace()
  const bw = ns?.BrowserWindow ?? ns?.default?.BrowserWindow
  if (typeof bw?.getAllWindows === 'function') {
    return bw.getAllWindows()
  }
  return []
}

function isWindowVisibleAndActive(win: IdleBudgetWindowLike | null | undefined): boolean {
  if (!win) return false
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false
    if (typeof win.isVisible === 'function' && !win.isVisible()) return false
    if (typeof win.isMinimized === 'function' && win.isMinimized()) return false
    return true
  } catch {
    return false
  }
}

/**
 * Centralized Power & Idle Budget state machine for Electron main-process timers.
 *
 * Explicit states:
 * - `active`: System is awake/unlocked and at least one CoreApp window is visible (or within hidden grace).
 * - `background-hidden`: System is awake/unlocked, all CoreApp windows have been hidden/minimized for `hiddenGraceMs`.
 * - `system-suspended`: System is suspended or screen-locked (`powerMonitor` `suspend` / `lock-screen`).
 *
 * Event-driven OS surfaces (Tray, globalShortcut, native watchers) and active user work stay unaffected.
 */
export class IdleBudgetCoordinator {
  private readonly hiddenGraceMs: number
  private readonly now: () => number
  private readonly getPowerMonitor: () => IdleBudgetPowerMonitorAdapter | null
  private readonly getApp: () => IdleBudgetAppAdapter | null
  private readonly getAllWindows: () => IdleBudgetWindowLike[]
  private readonly getEventBus: () => IdleBudgetEventBusAdapter | null
  private readonly getPollingService: () => IdleBudgetPollingAdapter | null

  private started = false
  private state: IdleBudgetState = 'active'
  private previousState: IdleBudgetState | null = null
  private lastReason: IdleBudgetTransitionReason = 'init'
  private changedAt: number
  private systemSuspended = false
  private screenLocked = false
  private hasVisibleWindow = true

  private hiddenGraceTimer: NodeJS.Timeout | null = null
  private readonly listeners = new Set<IdleBudgetListener>()
  private readonly runtimeDisposers: Array<() => void> = []
  private readonly windowDisposers = new Map<IdleBudgetWindowLike, Array<() => void>>()
  private readonly closedWindows = new WeakSet<IdleBudgetWindowLike>()

  constructor(options: IdleBudgetCoordinatorOptions = {}) {
    this.hiddenGraceMs = Math.max(
      0,
      Math.floor(options.hiddenGraceMs ?? DEFAULT_IDLE_BUDGET_HIDDEN_GRACE_MS)
    )
    this.now = options.now ?? (() => Date.now())
    this.changedAt = this.now()
    this.getPowerMonitor =
      options.powerMonitor !== undefined
        ? () => options.powerMonitor ?? null
        : resolveDefaultPowerMonitor
    this.getApp = options.app !== undefined ? () => options.app ?? null : resolveDefaultApp
    this.getAllWindows = options.getAllWindows ?? resolveDefaultWindows
    this.getEventBus =
      options.eventBus !== undefined
        ? () => options.eventBus ?? null
        : () => touchEventBus as unknown as IdleBudgetEventBusAdapter
    this.getPollingService =
      options.pollingService !== undefined
        ? () => options.pollingService ?? null
        : () => PollingService.getInstance()
  }

  public isStarted(): boolean {
    return this.started
  }

  public getState(): IdleBudgetState {
    return this.state
  }

  public isPausedFor(level: IdlePauseLevel): boolean {
    return isStatePausedFor(this.state, level)
  }

  public getSnapshot(): IdleBudgetSnapshot {
    return {
      state: this.state,
      previousState: this.previousState,
      reason: this.lastReason,
      changedAt: this.changedAt,
      systemSuspended: this.systemSuspended,
      screenLocked: this.screenLocked,
      hasVisibleWindow: this.hasVisibleWindow
    }
  }

  public subscribe(listener: IdleBudgetListener, options?: { emitCurrent?: boolean }): () => void {
    this.listeners.add(listener)
    if (options?.emitCurrent) {
      this.invokeListener(listener, this.getSnapshot())
    }
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      this.listeners.delete(listener)
    }
  }

  public start(): void {
    if (this.started) return
    this.started = true

    const pm = this.getPowerMonitor()
    if (pm) {
      const handleSuspend = () => this.onPowerSuspend()
      const handleResume = () => this.onPowerResume()
      const handleLockScreen = () => this.onScreenLock()
      const handleUnlockScreen = () => this.onScreenUnlock()

      pm.on('suspend', handleSuspend)
      pm.on('resume', handleResume)
      pm.on('lock-screen', handleLockScreen)
      pm.on('unlock-screen', handleUnlockScreen)

      this.runtimeDisposers.push(
        () => removeEmitterListener(pm, 'suspend', handleSuspend),
        () => removeEmitterListener(pm, 'resume', handleResume),
        () => removeEmitterListener(pm, 'lock-screen', handleLockScreen),
        () => removeEmitterListener(pm, 'unlock-screen', handleUnlockScreen)
      )
    }

    const appAdapter = this.getApp()
    if (appAdapter) {
      const handleWindowCreated = (_event: unknown, win: unknown) => {
        if (win && typeof win === 'object') {
          this.attachWindow(win as IdleBudgetWindowLike)
        }
        this.evaluateWindowVisibility('window-visible')
      }
      appAdapter.on('browser-window-created', handleWindowCreated)
      this.runtimeDisposers.push(() =>
        removeEmitterListener(appAdapter, 'browser-window-created', handleWindowCreated)
      )
    }

    for (const win of this.safeGetAllWindows()) {
      this.attachWindow(win)
    }

    const bus = this.getEventBus()
    if (bus && typeof bus.on === 'function' && typeof bus.off === 'function') {
      const bindBusEvent = (
        eventName: TalexEvents | undefined,
        reason: 'window-visible' | 'window-hidden-grace-elapsed'
      ) => {
        if (!eventName) return
        const handler = () => this.evaluateWindowVisibility(reason)
        bus.on(eventName, handler)
        this.runtimeDisposers.push(() => bus.off(eventName, handler))
      }

      bindBusEvent(TalexEvents.WINDOW_SHOWN, 'window-visible')
      bindBusEvent(TalexEvents.WINDOW_HIDDEN, 'window-hidden-grace-elapsed')
      bindBusEvent(TalexEvents.COREBOX_WINDOW_SHOWN, 'window-visible')
      bindBusEvent(TalexEvents.COREBOX_WINDOW_HIDDEN, 'window-hidden-grace-elapsed')
    }

    this.evaluateWindowVisibility('init')
    idleBudgetLog.info('Idle budget coordinator started', {
      meta: {
        state: this.state,
        hasVisibleWindow: this.hasVisibleWindow,
        hiddenGraceMs: this.hiddenGraceMs
      }
    })
  }

  /**
   * Detaches OS/window listeners, cancels pending timers, and clears polling pressures.
   * Does not emit a spurious `active` wakeup while tearing down.
   */
  public stop(): void {
    this.clearHiddenGraceTimer()
    this.started = false

    while (this.runtimeDisposers.length > 0) {
      const dispose = this.runtimeDisposers.pop()
      try {
        dispose?.()
      } catch {
        // ignore teardown errors
      }
    }

    for (const [, disposers] of this.windowDisposers) {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // ignore teardown errors
        }
      }
    }
    this.windowDisposers.clear()

    this.clearPollingPressures()
    this.systemSuspended = false
    this.screenLocked = false
    this.hasVisibleWindow = true
    this.state = 'active'
    this.previousState = null
    this.lastReason = 'destroy'
    this.changedAt = this.now()
  }

  /**
   * Permanently disposes listeners, timers, polling pressures, and subscribers.
   */
  public destroy(): void {
    this.stop()
    this.listeners.clear()
  }

  /**
   * Re-checks all current BrowserWindows and updates timers/state accordingly.
   * Safe to invoke manually after programmatic window visibility changes.
   */
  public refreshWindowVisibility(): void {
    if (!this.started) return
    for (const win of this.safeGetAllWindows()) {
      this.attachWindow(win)
    }
    this.evaluateWindowVisibility('window-visible')
  }

  private safeGetAllWindows(): IdleBudgetWindowLike[] {
    try {
      const windows = this.getAllWindows()
      return Array.isArray(windows) ? windows : []
    } catch {
      return []
    }
  }

  private computeHasVisibleWindow(): boolean {
    const windows = this.safeGetAllWindows()
    for (const win of windows) {
      if (this.closedWindows.has(win)) continue
      if (isWindowVisibleAndActive(win)) {
        return true
      }
    }
    return false
  }

  private attachWindow(win: IdleBudgetWindowLike): void {
    if (!win || typeof win.on !== 'function' || this.windowDisposers.has(win)) {
      return
    }
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
      return
    }

    const onVisibleSignal = () => {
      this.evaluateWindowVisibility('window-visible')
    }
    const onHiddenSignal = () => {
      this.evaluateWindowVisibility('window-hidden-grace-elapsed')
    }
    const onClosed = () => {
      this.closedWindows.add(win)
      this.detachWindow(win)
      this.evaluateWindowVisibility('window-hidden-grace-elapsed')
    }

    win.on('show', onVisibleSignal)
    win.on('restore', onVisibleSignal)
    win.on('focus', onVisibleSignal)
    win.on('hide', onHiddenSignal)
    win.on('minimize', onHiddenSignal)
    win.on('closed', onClosed)

    this.windowDisposers.set(win, [
      () => removeEmitterListener(win, 'show', onVisibleSignal),
      () => removeEmitterListener(win, 'restore', onVisibleSignal),
      () => removeEmitterListener(win, 'focus', onVisibleSignal),
      () => removeEmitterListener(win, 'hide', onHiddenSignal),
      () => removeEmitterListener(win, 'minimize', onHiddenSignal),
      () => removeEmitterListener(win, 'closed', onClosed)
    ])
  }

  private detachWindow(win: IdleBudgetWindowLike): void {
    const disposers = this.windowDisposers.get(win)
    if (!disposers) return
    this.windowDisposers.delete(win)
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // ignore window listener detach errors
      }
    }
  }

  private onPowerSuspend(): void {
    this.systemSuspended = true
    this.clearHiddenGraceTimer()
    this.transitionTo('system-suspended', 'power-suspend')
  }

  private onScreenLock(): void {
    this.screenLocked = true
    this.clearHiddenGraceTimer()
    this.transitionTo('system-suspended', 'power-lock-screen')
  }

  private onPowerResume(): void {
    this.systemSuspended = false
    if (this.screenLocked) {
      return
    }
    this.hasVisibleWindow = this.computeHasVisibleWindow()
    this.clearHiddenGraceTimer()
    this.transitionTo(this.hasVisibleWindow ? 'active' : 'background-hidden', 'power-resume')
  }

  private onScreenUnlock(): void {
    this.screenLocked = false
    this.systemSuspended = false
    this.hasVisibleWindow = this.computeHasVisibleWindow()
    this.clearHiddenGraceTimer()
    this.transitionTo(this.hasVisibleWindow ? 'active' : 'background-hidden', 'power-unlock-screen')
  }

  private evaluateWindowVisibility(
    signalReason: 'init' | 'window-visible' | 'window-hidden-grace-elapsed'
  ): void {
    const visible = this.computeHasVisibleWindow()
    this.hasVisibleWindow = visible

    if (this.systemSuspended || this.screenLocked) {
      this.clearHiddenGraceTimer()
      return
    }

    if (visible) {
      this.clearHiddenGraceTimer()
      if (this.state !== 'active') {
        this.transitionTo('active', signalReason === 'init' ? 'init' : 'window-visible')
      }
      return
    }

    if (this.state === 'background-hidden') {
      this.clearHiddenGraceTimer()
      return
    }

    if (this.hiddenGraceMs <= 0) {
      this.clearHiddenGraceTimer()
      this.transitionTo('background-hidden', 'window-hidden-grace-elapsed')
      return
    }

    if (this.hiddenGraceTimer) {
      return
    }

    this.hiddenGraceTimer = setTimeout(() => {
      this.hiddenGraceTimer = null
      if (!this.started || this.systemSuspended || this.screenLocked) {
        return
      }
      this.hasVisibleWindow = this.computeHasVisibleWindow()
      if (!this.hasVisibleWindow) {
        this.transitionTo('background-hidden', 'window-hidden-grace-elapsed')
      }
    }, this.hiddenGraceMs)
    this.hiddenGraceTimer.unref?.()
  }

  private clearHiddenGraceTimer(): void {
    if (!this.hiddenGraceTimer) return
    clearTimeout(this.hiddenGraceTimer)
    this.hiddenGraceTimer = null
  }

  private transitionTo(nextState: IdleBudgetState, reason: IdleBudgetTransitionReason): void {
    if (this.state === nextState) {
      return
    }

    const prevState = this.state
    this.previousState = prevState
    this.state = nextState
    this.lastReason = reason
    this.changedAt = this.now()

    this.applyPollingPressure(nextState)

    idleBudgetLog.info('Idle budget state changed', {
      meta: {
        from: prevState,
        to: nextState,
        reason,
        hasVisibleWindow: this.hasVisibleWindow,
        systemSuspended: this.systemSuspended,
        screenLocked: this.screenLocked
      }
    })

    const snapshot = this.getSnapshot()
    for (const listener of Array.from(this.listeners)) {
      this.invokeListener(listener, snapshot)
    }
  }

  private applyPollingPressure(state: IdleBudgetState): void {
    const polling = this.getPollingService()
    if (!polling) return

    if (state === 'active') {
      this.clearPollingPressures()
      return
    }

    if (state === 'background-hidden') {
      // Apply the new pressure before clearing the previous one so shared paused lanes
      // (e.g. `maintenance`) never transiently unpause or pump queued work.
      polling.setGlobalPressure?.({
        reason: IDLE_BUDGET_HIDDEN_PRESSURE_REASON,
        pausedLanes: BACKGROUND_HIDDEN_PAUSED_LANES
      })
      polling.clearGlobalPressure?.(IDLE_BUDGET_SUSPENDED_PRESSURE_REASON)
      return
    }

    polling.setGlobalPressure?.({
      reason: IDLE_BUDGET_SUSPENDED_PRESSURE_REASON,
      pausedLanes: SYSTEM_SUSPENDED_PAUSED_LANES
    })
    polling.clearGlobalPressure?.(IDLE_BUDGET_HIDDEN_PRESSURE_REASON)
  }

  private clearPollingPressures(): void {
    const polling = this.getPollingService()
    if (!polling) return
    polling.clearGlobalPressure?.(IDLE_BUDGET_HIDDEN_PRESSURE_REASON)
    polling.clearGlobalPressure?.(IDLE_BUDGET_SUSPENDED_PRESSURE_REASON)
  }

  private invokeListener(listener: IdleBudgetListener, snapshot: IdleBudgetSnapshot): void {
    try {
      listener(snapshot)
    } catch (error) {
      idleBudgetLog.warn('Idle budget subscriber failed', { error })
    }
  }
}

export const idleBudgetCoordinator = new IdleBudgetCoordinator()
