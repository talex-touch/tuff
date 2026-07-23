import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import type { LogOptions } from '../../utils/logger'
import type { ClipboardReader, NativeClipboardReaderModule } from './clipboard-reader'
import { NativeClipboardReader, hasNativeReaderApi } from './clipboard-reader'

/**
 * ClipboardService owns the single seam between the app and the OS clipboard's
 * *change signal*.
 *
 * Design (see the clipboard subsystem analysis):
 * - `@crosscopy/clipboard` is used as a SIGNAL SOURCE ONLY — we subscribe to its
 *   native, background-thread change events via `startWatch` and never use its
 *   readers. All actual clipboard reads go through Electron's `clipboard` API in
 *   the capture pipeline, which removes the "two readers can disagree" divergence.
 * - The native watcher is an optimisation, not a correctness dependency: when it
 *   is unavailable the module keeps working via adaptive polling. That fallback
 *   used to be *silent*; this service now tracks health/mode and reports every
 *   transition so a degraded state (e.g. a broken native binary) is observable.
 */

export interface ClipboardWatcherHandle {
  stop: () => void
  readonly isRunning?: boolean
}

/**
 * Signal-and-read view of the native watcher module. We depend on `startWatch`
 * for the change signal and, when present, the async off-thread readers so
 * clipboard reads never block the main-process event loop.
 */
export interface ClipboardWatcherModule extends NativeClipboardReaderModule {
  startWatch?: (callback: () => void) => ClipboardWatcherHandle
}

export type ClipboardWatchMode = 'native' | 'polling'

export interface ClipboardServiceHealth {
  /** `native` while the OS change-event watcher is live, otherwise `polling`. */
  mode: ClipboardWatchMode
  /** The native watcher is currently delivering change events. */
  nativeActive: boolean
  /** Native watcher enabled by env (`TUFF_CLIPBOARD_NATIVE_WATCH`). */
  enabled: boolean
  /** Enabled and start was attempted, but the native watcher is not active — i.e. we fell back to polling. */
  degraded: boolean
  /** A start attempt has been made. */
  startAttempted: boolean
  /** Number of native change events observed since activation. */
  nativeChangeCount: number
  /** When the native watcher last became active (epoch ms), or `null`. */
  activatedAt: number | null
  /** Last start failure message, or `null`. */
  lastError: string | null
  /** When the last failure happened (epoch ms), or `null`. */
  lastErrorAt: number | null
}

export interface ClipboardServiceOptions {
  envKey?: string
  getEnv?: (key: string) => string | undefined
  isDestroyed: () => boolean
  scheduleMonitor: (options: { bypassCooldown?: boolean; source: ClipboardCaptureSource }) => void
  importWatcherModule?: () => Promise<unknown>
  /**
   * Fired once whenever the effective watch mode changes (e.g. native → polling).
   * Used to emit perf/diagnostics telemetry so degradation is not silent.
   */
  onModeChange?: (health: ClipboardServiceHealth) => void
  now?: () => number
  logInfo: (message: string, data?: LogOptions) => void
  logWarn: (message: string, data?: LogOptions) => void
  logDebug: (message: string, data?: LogOptions) => void
}

export const CLIPBOARD_NATIVE_WATCH_ENV = 'TUFF_CLIPBOARD_NATIVE_WATCH'

export function isClipboardNativeWatcherEnabled(
  getEnv: (key: string) => string | undefined = (key) => process.env[key],
  envKey = CLIPBOARD_NATIVE_WATCH_ENV
): boolean {
  const raw = getEnv(envKey)
  if (!raw) return true
  const normalized = raw.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
}

export function resolveClipboardWatcherModule(value: unknown): ClipboardWatcherModule | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const pushCandidate = (target: unknown, list: unknown[]): void => {
    if (!target || typeof target !== 'object') return
    if (!list.includes(target)) {
      list.push(target)
    }
  }

  const source = value as {
    default?: unknown
    ['module.exports']?: unknown
  }
  const candidates: unknown[] = []

  pushCandidate(source, candidates)
  pushCandidate(source.default, candidates)
  pushCandidate(source['module.exports'], candidates)

  const nestedDefault = source.default as { default?: unknown; ['module.exports']?: unknown }
  if (nestedDefault && typeof nestedDefault === 'object') {
    pushCandidate(nestedDefault.default, candidates)
    pushCandidate(nestedDefault['module.exports'], candidates)
  }

  const nestedModuleExports = source['module.exports'] as {
    default?: unknown
    ['module.exports']?: unknown
  }
  if (nestedModuleExports && typeof nestedModuleExports === 'object') {
    pushCandidate(nestedModuleExports.default, candidates)
    pushCandidate(nestedModuleExports['module.exports'], candidates)
  }

  for (const candidate of candidates) {
    const watcherModule = candidate as ClipboardWatcherModule
    if (typeof watcherModule.startWatch === 'function') {
      return watcherModule
    }
  }

  return null
}

export class ClipboardService {
  private watcher: ClipboardWatcherHandle | null = null
  private readerModule: ClipboardWatcherModule | null = null
  private cachedReader: NativeClipboardReader | null = null
  private initTried = false
  private enabled = true
  private nativeChangeCount = 0
  private activatedAt: number | null = null
  private lastError: string | null = null
  private lastErrorAt: number | null = null
  private lastReportedMode: ClipboardWatchMode | null = null

  constructor(private readonly options: ClipboardServiceOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Whether the native OS change-event watcher is currently active. */
  public isNativeActive(): boolean {
    return Boolean(this.watcher && this.watcher.isRunning !== false)
  }

  /**
   * Monotonic count of native change events observed since activation. Paired
   * with {@link isNativeActive}, an unchanged count means the OS clipboard has
   * not changed since the last observation — callers can use it to skip a
   * redundant (and expensive, main-thread-blocking) re-read of the clipboard.
   */
  public getNativeChangeCount(): number {
    return this.nativeChangeCount
  }

  /**
   * The off-main-thread clipboard reader, when the native module is active and
   * exposes the async read API; otherwise `null` (callers fall back to Electron).
   * Cached because the resolved module is stable for the watcher's lifetime.
   */
  public getReader(): ClipboardReader | null {
    if (!this.isNativeActive()) return null
    if (!hasNativeReaderApi(this.readerModule)) return null
    if (!this.cachedReader) {
      this.cachedReader = new NativeClipboardReader(this.readerModule)
    }
    return this.cachedReader
  }

  public getHealth(): ClipboardServiceHealth {
    const nativeActive = this.isNativeActive()
    return {
      mode: nativeActive ? 'native' : 'polling',
      nativeActive,
      enabled: this.enabled,
      degraded: this.enabled && this.initTried && !nativeActive,
      startAttempted: this.initTried,
      nativeChangeCount: this.nativeChangeCount,
      activatedAt: this.activatedAt,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt
    }
  }

  private reportMode(): void {
    const health = this.getHealth()
    if (health.mode === this.lastReportedMode) return
    this.lastReportedMode = health.mode
    this.options.onModeChange?.(health)
  }

  public async start(): Promise<void> {
    if (this.options.isDestroyed()) return
    if (this.watcher) return
    if (this.initTried) return

    this.initTried = true
    const envKey = this.options.envKey ?? CLIPBOARD_NATIVE_WATCH_ENV
    this.enabled = isClipboardNativeWatcherEnabled(this.options.getEnv, envKey)

    if (!this.enabled) {
      this.options.logInfo('Clipboard native watcher disabled by env; using polling only', {
        meta: { env: envKey }
      })
      this.reportMode()
      return
    }

    try {
      const rawModule = await (this.options.importWatcherModule?.() ??
        import('@crosscopy/clipboard'))
      const watcherModule = resolveClipboardWatcherModule(rawModule)
      if (!watcherModule || typeof watcherModule.startWatch !== 'function') {
        const exportKeys =
          rawModule && typeof rawModule === 'object' ? Object.keys(rawModule as object) : []
        this.lastError = 'watcher module has no startWatch API'
        this.lastErrorAt = this.now()
        this.options.logWarn('Clipboard native watcher has no startWatch API; using polling only', {
          meta: { exportKeys: exportKeys.join(',') }
        })
        this.reportMode()
        return
      }

      const watcher = watcherModule.startWatch(() => {
        if (this.options.isDestroyed()) return
        this.nativeChangeCount += 1
        setImmediate(() => {
          this.options.scheduleMonitor({ bypassCooldown: true, source: 'native-watch' })
        })
      })

      this.watcher = watcher
      // Retain the resolved module so captures can read off its native thread
      // (see getReader) instead of blocking the main loop on Electron's
      // synchronous clipboard API.
      this.readerModule = watcherModule
      this.cachedReader = null
      this.activatedAt = this.now()
      this.lastError = null
      this.lastErrorAt = null
      this.options.logInfo('Clipboard native watcher started (real-time capture)', {
        meta: { running: watcher.isRunning ?? true }
      })
      this.reportMode()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.lastErrorAt = this.now()
      this.options.logWarn('Clipboard native watcher unavailable, using polling only', {
        error
      })
      this.reportMode()
    }
  }

  public stop(): void {
    if (!this.watcher) return
    const watcher = this.watcher
    this.watcher = null
    this.readerModule = null
    this.cachedReader = null
    this.activatedAt = null
    try {
      watcher.stop()
    } catch (error) {
      this.options.logDebug('Failed to stop clipboard native watcher', { error })
    }
  }

  public reset(): void {
    this.stop()
    this.initTried = false
    this.enabled = true
    this.nativeChangeCount = 0
    this.activatedAt = null
    this.lastError = null
    this.lastErrorAt = null
    this.lastReportedMode = null
  }
}
