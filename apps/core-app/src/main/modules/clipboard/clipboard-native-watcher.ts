import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import type { LogOptions } from '../../utils/logger'

export interface ClipboardWatcherHandle {
  stop: () => void
  readonly isRunning?: boolean
}

export interface ClipboardWatcherModule {
  startWatch?: (callback: () => void) => ClipboardWatcherHandle
}

export interface ClipboardNativeWatcherOptions {
  envKey?: string
  getEnv?: (key: string) => string | undefined
  isDestroyed: () => boolean
  scheduleMonitor: (options: { bypassCooldown?: boolean; source: ClipboardCaptureSource }) => void
  importWatcherModule?: () => Promise<unknown>
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

export class ClipboardNativeWatcher {
  private watcher: ClipboardWatcherHandle | null = null
  private initTried = false

  constructor(private readonly options: ClipboardNativeWatcherOptions) {}

  public reset(): void {
    this.initTried = false
    this.watcher = null
  }

  public async start(): Promise<void> {
    if (this.options.isDestroyed()) return
    if (this.watcher) return
    if (this.initTried) return

    this.initTried = true
    const envKey = this.options.envKey ?? CLIPBOARD_NATIVE_WATCH_ENV

    if (!isClipboardNativeWatcherEnabled(this.options.getEnv, envKey)) {
      this.options.logInfo('Clipboard native watcher disabled by env', {
        meta: { env: envKey }
      })
      return
    }

    try {
      const rawModule = await (this.options.importWatcherModule?.() ??
        import('@crosscopy/clipboard'))
      const watcherModule = resolveClipboardWatcherModule(rawModule)
      if (!watcherModule || typeof watcherModule.startWatch !== 'function') {
        const exportKeys =
          rawModule && typeof rawModule === 'object' ? Object.keys(rawModule as object) : []
        this.options.logWarn('Clipboard native watcher module has no startWatch API', {
          meta: { exportKeys: exportKeys.join(',') }
        })
        return
      }

      const watcher = watcherModule.startWatch(() => {
        if (this.options.isDestroyed()) return
        setImmediate(() => {
          this.options.scheduleMonitor({ bypassCooldown: true, source: 'native-watch' })
        })
      })

      this.watcher = watcher
      this.options.logInfo('Clipboard native watcher started', {
        meta: { running: watcher.isRunning ?? true }
      })
    } catch (error) {
      this.options.logWarn('Clipboard native watcher unavailable, fallback to polling only', {
        error
      })
    }
  }

  public stop(): void {
    if (!this.watcher) return
    const watcher = this.watcher
    this.watcher = null
    try {
      watcher.stop()
    } catch (error) {
      this.options.logDebug('Failed to stop clipboard native watcher', { error })
    }
  }
}
