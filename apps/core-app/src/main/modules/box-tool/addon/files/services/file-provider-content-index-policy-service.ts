import type {
  FileContentIndexingState,
  FileIndexContentSettings
} from '@talex-touch/utils/transport/events/types'
import type { FileIndexSettings } from '../types'

interface FileProviderContentIndexPolicyDeps {
  cleanupVersion: number
  getSettings: () => FileIndexSettings
  updateSettings: (patch: Partial<FileIndexSettings>) => Promise<FileIndexSettings>
  syncSettings: () => void
  getSchedulerSnapshot: () => { activeBatches: number; queuedBatches: number }
  isResumeActive: () => boolean
  resume: (reason: string) => void
  stop: () => void
  cancelPending: () => void
  clearData: () => Promise<void>
}

/** Owns the opt-in content-index transition without leaking it into the file provider facade. */
export class FileProviderContentIndexPolicyService {
  private suppressed = false
  private transition: 'idle' | 'clearing' = 'idle'
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly deps: FileProviderContentIndexPolicyDeps) {}

  isEnabled(): boolean {
    return this.deps.getSettings().contentIndexingEnabled && !this.suppressed
  }

  getSnapshot(): FileIndexContentSettings {
    const settings = this.deps.getSettings()
    return {
      contentIndexingEnabled: settings.contentIndexingEnabled,
      state: this.resolveState(settings)
    }
  }

  async update(contentIndexingEnabled: boolean): Promise<FileIndexContentSettings> {
    let releaseQueue!: () => void
    const previous = this.queue
    this.queue = new Promise<void>((resolve) => {
      releaseQueue = resolve
    })
    await previous

    try {
      const settings = this.deps.getSettings()
      if (contentIndexingEnabled === settings.contentIndexingEnabled) {
        return this.getSnapshot()
      }

      if (contentIndexingEnabled) {
        await this.deps.updateSettings({ contentIndexingEnabled: true })
        this.deps.syncSettings()
        this.suppressed = false
        this.deps.resume('settings-enabled')
        return this.getSnapshot()
      }

      this.suppressed = true
      this.transition = 'clearing'
      this.deps.stop()
      this.deps.cancelPending()
      try {
        await this.deps.clearData()
        await this.deps.updateSettings({
          contentIndexingEnabled: false,
          contentIndexCleanupVersion: this.deps.cleanupVersion
        })
        this.transition = 'idle'
        this.deps.syncSettings()
        this.suppressed = false
        return this.getSnapshot()
      } catch (error) {
        this.suppressed = false
        this.deps.resume('settings-disable-recovery')
        throw error
      } finally {
        this.transition = 'idle'
      }
    } finally {
      releaseQueue()
    }
  }

  async reconcileAtStartup(): Promise<void> {
    const settings = this.deps.getSettings()
    if (settings.contentIndexingEnabled) {
      this.deps.resume('startup')
      return
    }
    if (settings.contentIndexCleanupVersion >= this.deps.cleanupVersion) return

    this.suppressed = true
    this.transition = 'clearing'
    try {
      await this.deps.clearData()
      await this.deps.updateSettings({ contentIndexCleanupVersion: this.deps.cleanupVersion })
      this.deps.syncSettings()
    } finally {
      this.suppressed = false
      this.transition = 'idle'
    }
  }

  private resolveState(settings: FileIndexSettings): FileContentIndexingState {
    if (this.transition === 'clearing') return 'clearing'
    if (!settings.contentIndexingEnabled) return 'disabled'
    const scheduler = this.deps.getSchedulerSnapshot()
    return scheduler.activeBatches > 0 || scheduler.queuedBatches > 0 || this.deps.isResumeActive()
      ? 'indexing'
      : 'idle'
  }
}
