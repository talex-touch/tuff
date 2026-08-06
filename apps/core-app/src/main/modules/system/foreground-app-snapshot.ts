import type { ActiveAppInfo } from './active-app'
import process from 'node:process'
import { createLogger } from '../../utils/logger'

const snapshotLog = createLogger('ActiveApp').child('Snapshot')

/**
 * How long a pre-open snapshot stays usable. Long enough to survive the
 * round trip of opening CoreBox, short enough that a stale app never poses as
 * the current context.
 */
export const FOREGROUND_APP_SNAPSHOT_TTL_MS = 15_000

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

  const executablePath = info.executablePath
  if (!executablePath || !selfExecutablePath) return false
  const left = executablePath.toLowerCase()
  const right = selfExecutablePath.toLowerCase()
  // Either form may be the bundle and the other the binary inside it.
  return left.startsWith(right) || right.startsWith(left)
}

/**
 * Holds the app that was in the foreground before CoreBox opened.
 *
 * The capture is fire-and-forget (it must never delay `show()`): it asks the
 * active-app service, which answers from its own short-lived cache when warm
 * and otherwise queries the OS. A result that resolves too late — after focus
 * was stolen — reads as Touch and is dropped rather than stored.
 */
export class ForegroundAppSnapshotStore {
  private snapshot: ForegroundAppSnapshot | null = null
  private captureInFlight = false

  constructor(private readonly deps: ForegroundAppSnapshotDeps) {}

  capture(): void {
    if (this.captureInFlight) return
    this.captureInFlight = true
    const requestedAt = this.deps.now()

    void this.deps
      .queryActiveApp()
      .then((activeApp) => {
        if (!activeApp) return
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
        this.captureInFlight = false
      })
  }

  /** The snapshot if it is younger than `maxAgeMs`, else null. */
  get(maxAgeMs = FOREGROUND_APP_SNAPSHOT_TTL_MS): ForegroundAppSnapshot | null {
    if (!this.snapshot) return null
    if (this.deps.now() - this.snapshot.capturedAt >= maxAgeMs) return null
    return this.snapshot
  }

  clear(): void {
    this.snapshot = null
  }
}

export const foregroundAppSnapshotStore = new ForegroundAppSnapshotStore({
  // Imported lazily: this module is pulled in by the CoreBox window and the
  // recommendation context, neither of which should drag the active-app
  // service (and its icon/platform tooling) into their module graph.
  queryActiveApp: async () => {
    const { activeAppService } = await import('./active-app')
    return await activeAppService.getActiveApp({ includeIcon: false })
  },
  isSelfApp: (info) => isSelfActiveApp(info),
  now: () => Date.now()
})

/** Records the foreground app before CoreBox steals focus. Never blocks. */
export function captureForegroundAppSnapshot(): void {
  foregroundAppSnapshotStore.capture()
}
