import type { ActiveAppInfo } from './active-app'
import process from 'node:process'
import { createLogger } from '../../utils/logger'
import { isSelfAppIdentity } from './self-app-identity'

const snapshotLog = createLogger('ActiveApp').child('Snapshot')

/** Cold OS source queries complete asynchronously; stay below CoreBox's 400ms response budget. */
const FOREGROUND_APP_CAPTURE_WAIT_MS = 300

export interface ForegroundAppSnapshot {
  app: ActiveAppInfo
  /** When the capture was REQUESTED, i.e. before CoreBox took focus. */
  capturedAt: number
}

export interface ForegroundAppSnapshotDeps {
  queryActiveApp: () => Promise<ActiveAppInfo | null>
  isSelfApp: (info: ActiveAppInfo) => boolean
  now: () => number
}

/** A foreground app the OS already reported, so capturing it spawns nothing. */
export interface InstantForegroundApp {
  app: ActiveAppInfo
  /** Settles with the display name when it was not known yet at read time. */
  pendingName: Promise<string | null> | null
}

export interface InstantForegroundAppSource {
  /** Null when the source has nothing to report; the store then queries the OS as before. */
  readForegroundApp: () => InstantForegroundApp | null
}

/**
 * Whether the resolved frontmost app is Touch itself.
 *
 * Anything captured after CoreBox stole focus resolves to us, and recording
 * that would both poison the snapshot and hand the scorer a self-match.
 */
export function isSelfActiveApp(
  info: ActiveAppInfo,
  selfExecutablePath = process.execPath
): boolean {
  if (typeof info.processId === 'number' && info.processId === process.pid) return true

  return isSelfAppIdentity(
    {
      executablePath: info.executablePath,
      bundleId: info.bundleId
    },
    selfExecutablePath
  )
}

/** Holds one source app for the whole CoreBox activation, until hide clears it. */
export class ForegroundAppSnapshotStore {
  private snapshot: ForegroundAppSnapshot | null = null
  private capturePending: Promise<void> | null = null
  private generation = 0
  private active = false
  private instantSource: InstantForegroundAppSource | null = null

  constructor(private readonly deps: ForegroundAppSnapshotDeps) {}

  get hasActiveSession(): boolean {
    return this.active
  }

  /** The macOS activation tracker registers here; without a source, capture queries the OS. */
  setInstantSource(source: InstantForegroundAppSource | null): void {
    this.instantSource = source
  }

  capture(): void {
    if (this.active) return
    this.active = true
    this.snapshot = null
    const generation = ++this.generation
    const requestedAt = this.deps.now()
    if (this.captureInstant(generation, requestedAt)) return

    this.capturePending = this.deps
      .queryActiveApp()
      .then((activeApp) => {
        if (generation !== this.generation || !this.active || !activeApp) return
        if (this.deps.isSelfApp(activeApp)) {
          snapshotLog.debug('Skipped foreground snapshot resolving to Touch itself')
          return
        }
        this.snapshot = { app: activeApp, capturedAt: requestedAt }
      })
      .catch((error) => {
        snapshotLog.debug('Failed to capture foreground app snapshot', { error })
      })
      .finally(() => {
        if (generation === this.generation) this.capturePending = null
      })
  }

  /**
   * Takes the snapshot from what the OS already reported. The AppleScript query costs ~250 ms that
   * CoreBox's first recommendation pass used to wait for; here only a display name that is not
   * cached yet may still be pending, and it settles in one `lsappinfo` call.
   */
  private captureInstant(generation: number, requestedAt: number): boolean {
    let instant: InstantForegroundApp | null = null
    try {
      instant = this.instantSource?.readForegroundApp() ?? null
    } catch (error) {
      snapshotLog.debug('Failed to read the instant foreground app', { error })
    }
    if (!instant) return false
    if (this.deps.isSelfApp(instant.app)) {
      snapshotLog.debug('Skipped foreground snapshot resolving to Touch itself')
      return true
    }

    this.snapshot = { app: instant.app, capturedAt: requestedAt }
    const { pendingName } = instant
    if (!pendingName) return true
    this.capturePending = pendingName
      .then((name) => {
        const snapshot = this.snapshot
        if (generation !== this.generation || !this.active || !snapshot || !name) return
        this.snapshot = {
          ...snapshot,
          app: { ...snapshot.app, displayName: name, identifier: name }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === this.generation) this.capturePending = null
      })
    return true
  }

  get(): ForegroundAppSnapshot | null {
    return this.active ? this.snapshot : null
  }

  async resolve(maxWaitMs = FOREGROUND_APP_CAPTURE_WAIT_MS): Promise<ForegroundAppSnapshot | null> {
    const generation = this.generation
    const pending = this.capturePending
    if (pending) {
      let timer: NodeJS.Timeout | undefined
      try {
        await Promise.race([
          pending,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, Math.max(0, maxWaitMs))
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    }
    return generation === this.generation ? this.get() : null
  }

  clear(): void {
    this.generation += 1
    this.active = false
    this.snapshot = null
    this.capturePending = null
  }
}

export const foregroundAppSnapshotStore = new ForegroundAppSnapshotStore({
  // Imported lazily: this module is pulled in by the CoreBox window and the
  // recommendation context, neither of which should drag the active-app
  // service (and its icon/platform tooling) into their module graph.
  queryActiveApp: async () => {
    const { activeAppService } = await import('./active-app')
    return await activeAppService.getActiveApp({ includeIcon: false, forceRefresh: true })
  },
  isSelfApp: (info) => isSelfActiveApp(info),
  now: () => Date.now()
})

/** Records the foreground app before CoreBox steals focus. Never blocks. */
export function captureForegroundAppSnapshot(): void {
  foregroundAppSnapshotStore.capture()
}
