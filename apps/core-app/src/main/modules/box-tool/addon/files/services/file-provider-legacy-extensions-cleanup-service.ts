import { FILE_ICON_MAX_BYTES } from '../../../../../service/file-icon-artifact'

/**
 * One-time bounded cleanup of unread and unconvertible rows in `file_extensions` (A15):
 *   1. Orphan `file_extensions` rows whose `file_id` has no `files` parent.
 *   2. Unread `key = 'keywords'` rows on ordinary file records (`files.type = 'file'`).
 *   3. Legacy `data:` base64 `thumbnail` and `icon` rows left behind after the PNG icon migration
 *      pass (`FileProviderIconMigrationService`).
 *
 * `file_extensions` can hold hundreds of megabytes of `content_chunks` overflow pages, and its
 * only index is `PRIMARY KEY (file_id, key)`. Walking PK `file_id` windows keeps each probe
 * bounded and never reads `content_chunks` payloads.
 */
export const FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION = 1

const WINDOW_LIMIT = 500
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
export const MAX_LEGACY_PNG_ICON_VALUE_LENGTH =
  PNG_DATA_URL_PREFIX.length + 4 * Math.ceil(FILE_ICON_MAX_BYTES / 3)

export interface FileLegacyExtensionDeleteTarget {
  fileId: number
  key: string
}

export interface FileLegacyExtensionsWindow {
  /** Highest `file_id` covered by the PK index window (`null` when no rows remain). */
  maxFileId: number | null
  /** Removable `(file_id, key)` pairs found inside `(afterFileId, maxFileId]`. */
  deletes: FileLegacyExtensionDeleteTarget[]
}

export interface FileLegacyExtensionsCleanupResult {
  status: 'skipped' | 'completed'
  reason?: 'already-applied' | 'unavailable'
  windows: number
  removed: number
  failed: number
}

export interface FileProviderLegacyExtensionsCleanupDeps {
  getAppliedVersion: () => Promise<number | null>
  setAppliedVersion: (version: number) => Promise<void>
  isReady: () => boolean
  isStopping?: () => boolean
  /**
   * Runs the bounded PNG `data:image/png;base64,` conversion pass first when available.
   * Returns `true` when convertible icons have already finished migrating so any remaining
   * `data:` icon on `type = 'file'` can be dropped; `false` restricts `icon` removal to
   * non-PNG or oversized values and leaves the cleanup version unrecorded for next boot.
   */
  ensureLegacyIconsMigrated?: () => Promise<boolean>
  loadWindow: (
    afterFileId: number,
    windowLimit: number,
    dropAllFileDataIcons: boolean
  ) => Promise<FileLegacyExtensionsWindow>
  deleteBatch: (targets: FileLegacyExtensionDeleteTarget[]) => Promise<void>
  waitForWriteCapacity: () => Promise<void>
  yieldBetweenWindows: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderLegacyExtensionsCleanupService {
  constructor(private readonly deps: FileProviderLegacyExtensionsCleanupDeps) {}

  async run(): Promise<FileLegacyExtensionsCleanupResult> {
    const applied = await this.deps.getAppliedVersion()
    if (applied !== null && applied >= FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION) {
      return {
        status: 'skipped',
        reason: 'already-applied',
        windows: 0,
        removed: 0,
        failed: 0
      }
    }
    if (!this.deps.isReady() || this.deps.isStopping?.()) {
      return {
        status: 'skipped',
        reason: 'unavailable',
        windows: 0,
        removed: 0,
        failed: 0
      }
    }

    let dropAllFileDataIcons = true
    if (this.deps.ensureLegacyIconsMigrated) {
      try {
        dropAllFileDataIcons = await this.deps.ensureLegacyIconsMigrated()
      } catch (error) {
        dropAllFileDataIcons = false
        this.deps.logWarn('Legacy file icon migration did not settle before cleanup', error)
      }
    }

    let windows = 0
    let removed = 0
    let failed = 0
    let stopped = false
    let afterFileId = 0

    while (!this.deps.isStopping?.()) {
      const window = await this.deps.loadWindow(afterFileId, WINDOW_LIMIT, dropAllFileDataIcons)
      if (window.maxFileId === null) break
      windows += 1
      afterFileId = window.maxFileId

      if (window.deletes.length > 0) {
        if (this.deps.isStopping?.()) {
          stopped = true
          break
        }
        await this.deps.waitForWriteCapacity()
        if (this.deps.isStopping?.()) {
          stopped = true
          break
        }
        try {
          await this.deps.deleteBatch(window.deletes)
          removed += window.deletes.length
        } catch (error) {
          failed += window.deletes.length
          this.deps.logWarn('Failed to clean legacy file_extensions window', error, {
            afterFileId,
            rows: window.deletes.length
          })
        }
      }

      await this.deps.yieldBetweenWindows()
    }

    if (this.deps.isStopping?.()) {
      stopped = true
    }

    if (failed === 0 && !stopped && dropAllFileDataIcons) {
      await this.deps.setAppliedVersion(FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION)
    }

    this.deps.logInfo('Legacy file_extensions cleanup completed', {
      version: FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION,
      windows,
      removed,
      failed,
      stopped,
      dropAllFileDataIcons
    })
    return { status: 'completed', windows, removed, failed }
  }
}
