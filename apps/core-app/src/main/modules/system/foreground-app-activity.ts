import process from 'node:process'
import { powerMonitor, systemPreferences } from 'electron'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../utils/logger'
import { isSelfBundleId } from './self-app-identity'

const activityLog = createLogger('ActiveApp').child('Activity')

const ACTIVATION_NOTIFICATION = 'NSWorkspaceDidActivateApplicationNotification'
const FLUSH_TASK_ID = 'foreground-app-activity.flush'
/** Reads are served from memory, so the persist cadence only bounds what a crash can lose. */
const FLUSH_INTERVAL_MS = 5 * 60_000
const DAY_MS = 86_400_000

/**
 * A stay shorter than this is a pass-through — an app the system activated on the way to another,
 * or while a window closed — not use.
 */
export const FOREGROUND_MIN_DWELL_MS = 1_000

/** How far back a foreground stay may still date "last used": the ledger's 30-day window. */
export const FOREGROUND_ACTIVITY_WINDOW_MS = 30 * DAY_MS

/** Reverse-DNS bundle id. An unbundled process reports its name or path in the same slot. */
const BUNDLE_ID_PATTERN = /^[\w-]+(?:\.[\w-]+)+$/

export interface ForegroundActivation {
  /** Lower-cased bundle id. */
  appKey: string
  pid: number | null
}

export interface ForegroundActivityEntry {
  appKey: string
  lastActiveAt: number
}

/**
 * Electron hands `NSWorkspaceApplicationKey` over as the NSRunningApplication's description —
 * `<NSRunningApplication: 0x… (com.apple.finder - 872) LSASN:{0x0-0x3c03c}>` on Electron 41.10.7.
 * A process without a bundle id in that slot is not an app the catalog can name, so it is dropped.
 */
export function parseRunningApplicationDescription(value: unknown): ForegroundActivation | null {
  if (typeof value !== 'string') return null
  const match = /\(([^()\s]+) - (\d+)\)/.exec(value)
  if (!match || !BUNDLE_ID_PATTERN.test(match[1])) return null
  const pid = Number.parseInt(match[2], 10)
  return { appKey: match[1].toLowerCase(), pid: Number.isFinite(pid) ? pid : null }
}

export interface ForegroundActivationHandlers {
  onActivate: (activation: ForegroundActivation) => void
  /** Screen locked or system asleep: whatever is frontmost stops being used. */
  onPause: () => void
  onResume: () => void
}

/** Starts delivering OS activations; returns the unsubscribe, or null where the OS offers none. */
export type ForegroundActivationSource = (
  handlers: ForegroundActivationHandlers
) => (() => void) | null

/**
 * macOS activations from NSWorkspace's notification centre, plus lock/sleep from powerMonitor.
 *
 * Event-driven on purpose: the AppleScript lookup in `active-app.ts` spawns `osascript` per call,
 * so polling it to watch app switches would cost a process every tick. This costs nothing until
 * the user switches, and then one parsed string. No Accessibility or Automation permission.
 */
export const subscribeDarwinForegroundActivations: ForegroundActivationSource = (handlers) => {
  if (
    process.platform !== 'darwin' ||
    typeof systemPreferences?.subscribeWorkspaceNotification !== 'function'
  ) {
    return null
  }

  const subscriptionId = systemPreferences.subscribeWorkspaceNotification(
    ACTIVATION_NOTIFICATION,
    (_event, userInfo) => {
      try {
        const activation = parseRunningApplicationDescription(userInfo?.NSWorkspaceApplicationKey)
        if (activation) handlers.onActivate(activation)
      } catch (error) {
        activityLog.debug('Failed to handle app activation', { error })
      }
    }
  )
  powerMonitor.on('lock-screen', handlers.onPause)
  powerMonitor.on('suspend', handlers.onPause)
  powerMonitor.on('unlock-screen', handlers.onResume)
  powerMonitor.on('resume', handlers.onResume)

  return () => {
    systemPreferences.unsubscribeWorkspaceNotification(subscriptionId)
    powerMonitor.removeListener('lock-screen', handlers.onPause)
    powerMonitor.removeListener('suspend', handlers.onPause)
    powerMonitor.removeListener('unlock-screen', handlers.onResume)
    powerMonitor.removeListener('resume', handlers.onResume)
  }
}

/** One consistent read of the tracker, taken once per recommendation pass. */
export interface ForegroundActivityView {
  /** Last instant the app was frontmost inside the window, or null when unknown. */
  lastActiveAt(appKey: string): number | null
  /** The most recently frontmost apps inside the window, newest first. */
  recent(limit: number): ForegroundActivityEntry[]
}

export interface ForegroundAppActivityReader {
  /** Null while tracking is switched off or the platform has no activation source. */
  view(now?: number): ForegroundActivityView | null
}

export interface ForegroundAppActivityStore {
  load(since: Date): Promise<ForegroundActivityEntry[]>
  save(entries: ForegroundActivityEntry[]): Promise<void>
}

export interface ForegroundAppActivityDeps {
  subscribe: ForegroundActivationSource
  /** The user's switch; read per event, so turning it off stops recording immediately. */
  isEnabled: () => boolean
  now?: () => number
}

function isWithinWindow(timestamp: number, now: number): boolean {
  return timestamp <= now && now - timestamp <= FOREGROUND_ACTIVITY_WINDOW_MS
}

/**
 * Remembers when each app was last in front, so "last used" also covers apps reached by ⌘Tab or
 * the Dock rather than through Touch.
 *
 * A stay is credited when it ends — the app was in use until the next one took over — and the app
 * still in front reads as in use now. Only the latest instant per app is kept: a switch is use, not
 * a launch, so it never becomes a count, a habit or a time-of-day distribution.
 */
export class ForegroundAppActivityTracker implements ForegroundAppActivityReader {
  private readonly lastActiveAt = new Map<string, number>()
  private readonly dirty = new Set<string>()
  private readonly pollingService = PollingService.getInstance()
  private current: { appKey: string; since: number } | null = null
  /** The app that was in front when the screen locked, resumed on unlock. */
  private paused: string | null = null
  private unsubscribe: (() => void) | null = null
  private store: ForegroundAppActivityStore | null = null
  private flushing: Promise<void> | null = null

  constructor(private readonly deps: ForegroundAppActivityDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Subscribes, then merges the persisted window in. Stays inert without an activation source. */
  async start(store: ForegroundAppActivityStore): Promise<void> {
    if (this.unsubscribe) return
    this.store = store
    const unsubscribe = this.deps.subscribe({
      onActivate: (activation) => this.handleActivation(activation),
      onPause: () => this.handlePause(),
      onResume: () => this.handleResume()
    })
    if (!unsubscribe) return
    this.unsubscribe = unsubscribe

    await this.load()
    this.pollingService.register(FLUSH_TASK_ID, () => this.flush(), {
      interval: FLUSH_INTERVAL_MS,
      unit: 'milliseconds',
      lane: 'maintenance',
      backpressure: 'latest_wins',
      dedupeKey: FLUSH_TASK_ID,
      maxInFlight: 1
    })
    this.pollingService.start()
  }

  /** Unsubscribes, credits the stay still in progress and writes everything out. */
  async stop(): Promise<void> {
    this.pollingService.unregister(FLUSH_TASK_ID)
    const unsubscribe = this.unsubscribe
    this.unsubscribe = null
    try {
      unsubscribe?.()
    } catch (error) {
      activityLog.debug('Failed to unsubscribe from app activations', { error })
    }
    if (this.deps.isEnabled()) this.closeStay(this.now())
    this.current = null
    this.paused = null
    await this.flush()
  }

  view(now = this.now()): ForegroundActivityView | null {
    if (!this.unsubscribe || !this.deps.isEnabled()) return null

    const current = this.current
    const live = current && now - current.since >= FOREGROUND_MIN_DWELL_MS ? current.appKey : null
    return {
      lastActiveAt: (appKey) => {
        const key = appKey.trim().toLowerCase()
        if (key === live) return now
        const stored = this.lastActiveAt.get(key)
        return stored !== undefined && isWithinWindow(stored, now) ? stored : null
      },
      recent: (limit) => {
        if (limit <= 0) return []
        const entries: ForegroundActivityEntry[] = live ? [{ appKey: live, lastActiveAt: now }] : []
        for (const [appKey, lastActiveAt] of this.lastActiveAt) {
          if (appKey !== live && isWithinWindow(lastActiveAt, now)) {
            entries.push({ appKey, lastActiveAt })
          }
        }
        return entries.sort((left, right) => right.lastActiveAt - left.lastActiveAt).slice(0, limit)
      }
    }
  }

  /** Persists what changed since the last flush, stamping the stay in progress first. */
  async flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.flushDirty().finally(() => {
        this.flushing = null
      })
    }
    await this.flushing
  }

  /**
   * After a privacy deletion: drop everything held in memory and keep only what survived in the
   * store. The stay in progress is kept — it is use happening after the deletion.
   */
  async resetFromStore(): Promise<void> {
    this.lastActiveAt.clear()
    this.dirty.clear()
    await this.load()
  }

  private handleActivation(activation: ForegroundActivation): void {
    const at = this.now()
    if (!this.deps.isEnabled()) {
      // Switched off: forget the stay in progress rather than credit it after the fact.
      this.current = null
      this.paused = null
      return
    }
    this.closeStay(at)
    this.paused = null
    // Touch's own windows end the previous stay but are not "an app the user used".
    if (isSelfBundleId(activation.appKey) || activation.pid === process.pid) return
    this.current = { appKey: activation.appKey, since: at }
  }

  private handlePause(): void {
    const current = this.current
    if (!current) return
    this.closeStay(this.now())
    this.paused = current.appKey
  }

  private handleResume(): void {
    const appKey = this.paused
    this.paused = null
    if (!appKey || this.current || !this.deps.isEnabled()) return
    this.current = { appKey, since: this.now() }
  }

  private closeStay(at: number): void {
    const current = this.current
    this.current = null
    if (!current || at - current.since < FOREGROUND_MIN_DWELL_MS) return
    this.credit(current.appKey, at)
  }

  private credit(appKey: string, at: number): void {
    const previous = this.lastActiveAt.get(appKey)
    if (previous !== undefined && previous >= at) return
    this.lastActiveAt.set(appKey, at)
    this.dirty.add(appKey)
  }

  private async load(): Promise<void> {
    const store = this.store
    if (!store) return
    try {
      const rows = await store.load(new Date(this.now() - FOREGROUND_ACTIVITY_WINDOW_MS))
      for (const row of rows) {
        const appKey = row.appKey.toLowerCase()
        const known = this.lastActiveAt.get(appKey)
        if (known === undefined || known < row.lastActiveAt) {
          this.lastActiveAt.set(appKey, row.lastActiveAt)
        }
      }
    } catch (error) {
      activityLog.warn('Failed to load foreground app activity', { error })
    }
  }

  private async flushDirty(): Promise<void> {
    const store = this.store
    if (!store) return

    const now = this.now()
    const current = this.current
    if (current && now - current.since >= FOREGROUND_MIN_DWELL_MS && this.deps.isEnabled()) {
      this.credit(current.appKey, now)
    }
    if (this.dirty.size === 0) return

    const entries: ForegroundActivityEntry[] = []
    for (const appKey of this.dirty) {
      const lastActiveAt = this.lastActiveAt.get(appKey)
      if (lastActiveAt !== undefined) entries.push({ appKey, lastActiveAt })
    }
    this.dirty.clear()
    if (entries.length === 0) return

    try {
      await store.save(entries)
    } catch (error) {
      // Re-queue only what a newer credit has not already superseded.
      for (const entry of entries) {
        if (this.lastActiveAt.get(entry.appKey) === entry.lastActiveAt) this.dirty.add(entry.appKey)
      }
      activityLog.warn('Failed to persist foreground app activity', {
        error,
        meta: { count: entries.length }
      })
    }
  }
}
