import type {
  FileContentIndexingState,
  FileIndexContentSettings
} from '@talex-touch/utils/transport/events/types'
import { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'
import type { FileIndexSettings } from '../types'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { FilePersistenceEntry } from '../../../search-engine/file-index-persistence-repository'
import type {
  ContentCapacityFailureOptions,
  FileProviderContentCapacityService
} from './file-provider-content-capacity-service'

interface FileProviderContentIndexPolicyDeps {
  capacity?: FileProviderContentCapacityService
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
  /**
   * Reclaims the pages `clearData` freed. Fire-and-forget on purpose: a compaction of a
   * multi-GB index takes minutes and neither the settings reply nor startup may wait on it.
   */
  compact?: (reason: string) => Promise<void>
}

/** Owns the opt-in content-index transition without leaking it into the file provider facade. */
export class FileProviderContentIndexPolicyService {
  private suppressed = false
  private transition: 'idle' | 'clearing' = 'idle'
  private queue: Promise<void> = Promise.resolve()
  private storagePaused = false
  private readonly persistEntryMapper = new IndexedWorkerPersistEntryMapperService()

  constructor(private readonly deps: FileProviderContentIndexPolicyDeps) {}

  isEnabled(): boolean {
    return this.deps.getSettings().contentIndexingEnabled && !this.suppressed
  }

  isAdmissionEnabled(): boolean {
    return this.isEnabled() && (!this.deps.capacity || this.deps.capacity.isReady())
  }

  async checkAdmission(force = false): Promise<boolean> {
    if (!this.isEnabled()) return false
    await this.deps.capacity?.check(force)
    this.handleStorageChange()
    return this.isAdmissionEnabled()
  }

  handleStorageChange(): void {
    if (!this.isEnabled()) return
    const paused = Boolean(this.deps.capacity && !this.deps.capacity.isReady())
    if (paused === this.storagePaused) return
    this.storagePaused = paused
    if (paused) {
      this.deps.stop()
      this.deps.cancelPending()
    } else if (this.isEnabled()) {
      this.deps.resume('content-storage-recovered')
    }
  }

  recordStorageFailure(error: unknown, options?: ContentCapacityFailureOptions): boolean {
    const paused = this.deps.capacity?.recordFailure(error, options) ?? false
    if (paused) this.handleStorageChange()
    return paused
  }

  async notifyIndexSpaceFreed(): Promise<boolean> {
    if (!this.deps.capacity) return this.isAdmissionEnabled()
    await this.deps.capacity.notifyIndexSpaceFreed()
    this.handleStorageChange()
    return this.isAdmissionEnabled()
  }

  dispose(): void {
    this.deps.capacity?.dispose()
  }

  /**
   * Insurance behind the switch: with content indexing off, no parser result may land in
   * `files.content`. A dev index that had the switch off since policy version 1 still held 623 MB
   * of content on 2026-10-08, so the scheduling gate alone is not trusted.
   */
  /** Worker results mapped to persist entries, with content stripped while the switch is off. */
  buildPersistEntries(entries: IndexWorkerFileResult[]): FilePersistenceEntry[] {
    return this.filterPersistEntries(this.persistEntryMapper.map(entries) as FilePersistenceEntry[])
  }

  filterPersistEntries(entries: FilePersistenceEntry[]): FilePersistenceEntry[] {
    if (this.isEnabled() && !this.isAdmissionEnabled()) {
      throw new Error('FILE_CONTENT_STORAGE_PAUSED')
    }
    if (this.isEnabled()) return entries
    return entries.map((entry) =>
      entry.fileUpdate
        ? {
            ...entry,
            fileUpdate: {
              ...entry.fileUpdate,
              content: null,
              contentHash: null,
              embeddings: undefined,
              chunks: undefined
            }
          }
        : entry
    )
  }

  getSnapshot(): FileIndexContentSettings {
    const settings = this.deps.getSettings()
    return {
      contentIndexingEnabled: settings.contentIndexingEnabled,
      state: this.resolveState(settings),
      storage: this.deps.capacity?.getSnapshot()
    }
  }

  /** Settings reads inspect the target volume even while the user has opted out. */
  async refreshSnapshot(): Promise<FileIndexContentSettings> {
    await this.deps.capacity?.check(true)
    return this.getSnapshot()
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
        if (contentIndexingEnabled) await this.checkAdmission(true)
        return this.getSnapshot()
      }

      if (contentIndexingEnabled) {
        await this.deps.capacity?.check(true)
        try {
          await this.deps.updateSettings({ contentIndexingEnabled: true })
        } catch (error) {
          if (this.recordStorageFailure(error, { source: 'disk' })) {
            throw Object.assign(new Error('FILE_CONTENT_STORAGE_PAUSED'), {
              code: 'FILE_CONTENT_STORAGE_PAUSED'
            })
          }
          throw error
        }
        this.deps.capacity?.start()
        this.deps.syncSettings()
        this.suppressed = false
        const wasPaused = this.storagePaused
        if ((await this.checkAdmission(true)) && !wasPaused) this.deps.resume('settings-enabled')
        return this.getSnapshot()
      }

      this.suppressed = true
      this.deps.capacity?.stop()
      this.transition = 'clearing'
      this.deps.stop()
      this.deps.cancelPending()
      try {
        await this.deps.clearData()
        this.deps.capacity?.clearIndexFullPause()
        await this.deps.updateSettings({
          contentIndexingEnabled: false,
          contentIndexCleanupVersion: this.deps.cleanupVersion
        })
        this.transition = 'idle'
        this.deps.syncSettings()
        this.suppressed = false
        void this.deps.compact?.('content-indexing-disabled')
        return this.getSnapshot()
      } catch (error) {
        this.suppressed = false
        this.deps.capacity?.start()
        const wasPaused = this.storagePaused
        if ((await this.checkAdmission()) && !wasPaused)
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
    if (settings.contentIndexingEnabled) this.deps.capacity?.start()
    if (settings.contentIndexingEnabled) {
      const wasPaused = this.storagePaused
      if ((await this.checkAdmission(true)) && !wasPaused) this.deps.resume('startup')
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
    void this.deps.compact?.('content-cleanup-startup')
  }

  private resolveState(settings: FileIndexSettings): FileContentIndexingState {
    if (this.transition === 'clearing') return 'clearing'
    if (!settings.contentIndexingEnabled) return 'disabled'
    if (!this.isAdmissionEnabled()) return 'paused'
    const scheduler = this.deps.getSchedulerSnapshot()
    return scheduler.activeBatches > 0 || scheduler.queuedBatches > 0 || this.deps.isResumeActive()
      ? 'indexing'
      : 'idle'
  }
}
