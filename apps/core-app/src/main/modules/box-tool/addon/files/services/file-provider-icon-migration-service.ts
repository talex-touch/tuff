import type { DbUtils } from '../../../../../db/utils'
import { FILE_ICON_MAX_BYTES, persistFileIconPng } from '../../../../../service/file-icon-artifact'

const PAGE_SIZE = 32
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const MAX_VALUE_LENGTH = PNG_DATA_URL_PREFIX.length + 4 * Math.ceil(FILE_ICON_MAX_BYTES / 3)

type MigrationDb = Pick<
  DbUtils,
  'getLegacyFileIconPage' | 'getLegacyFileIconValue' | 'replaceFileIconValue'
>

export interface FileProviderIconMigrationServiceDeps {
  getDbUtils: () => MigrationDb | null
  getCacheDirectory: () => string
  withDbWrite: (label: string, operation: () => Promise<boolean>) => Promise<boolean>
  isStopping: () => boolean
  waitForIdle: () => Promise<void>
  yieldToEventLoop: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export interface FileProviderIconMigrationResult {
  scanned: number
  converted: number
  skipped: number
  failed: number
  stopped: boolean
}

/** Old values are the durable resume ledger; only a verified artifact may replace one. */
export class FileProviderIconMigrationService {
  private running: Promise<FileProviderIconMigrationResult> | null = null

  constructor(private readonly deps: FileProviderIconMigrationServiceDeps) {}

  run(): Promise<FileProviderIconMigrationResult> {
    if (this.running) return this.running
    const run: Promise<FileProviderIconMigrationResult> = this.migrate().finally(() => {
      if (this.running === run) this.running = null
    })
    this.running = run
    return run
  }

  private async migrate(): Promise<FileProviderIconMigrationResult> {
    const result: FileProviderIconMigrationResult = {
      scanned: 0,
      converted: 0,
      skipped: 0,
      failed: 0,
      stopped: false
    }
    const db = this.deps.getDbUtils()
    if (!db || this.deps.isStopping()) return { ...result, stopped: true }
    let afterId = 0

    pages: while (!this.deps.isStopping()) {
      await this.deps.waitForIdle()
      if (this.deps.isStopping()) break
      const page = await db.getLegacyFileIconPage(afterId, PAGE_SIZE)
      if (page.length === 0) break
      for (const row of page) {
        if (this.deps.isStopping()) break pages
        afterId = row.fileId
        result.scanned += 1
        if (row.valueLength > MAX_VALUE_LENGTH) {
          result.skipped += 1
          continue
        }
        try {
          const previousValue = await db.getLegacyFileIconValue(row.fileId, MAX_VALUE_LENGTH)
          if (previousValue === null) {
            result.skipped += 1
            continue
          }
          // The SQL read applies the same cap, including when a value changes after paging.
          if (
            !previousValue.startsWith(PNG_DATA_URL_PREFIX) ||
            previousValue.length > MAX_VALUE_LENGTH
          ) {
            throw new Error('FILE_ICON_INVALID_DATA_URL')
          }
          const encoded = previousValue.slice(PNG_DATA_URL_PREFIX.length)
          if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
            throw new Error('FILE_ICON_INVALID_BASE64')
          }
          const iconPath = await persistFileIconPng(
            Buffer.from(encoded, 'base64'),
            this.deps.getCacheDirectory()
          )
          if (this.deps.isStopping()) break pages
          const replaced = await this.deps.withDbWrite('file-icon.migrate', async () => {
            if (this.deps.isStopping()) return false
            return await db.replaceFileIconValue(row.fileId, previousValue, iconPath)
          })
          if (replaced) result.converted += 1
          else result.skipped += 1
        } catch (error) {
          result.failed += 1
          // Do not log a legacy value, file path, image bytes, or decoder message.
          this.deps.logWarn('File icon migration entry failed', undefined, {
            fileId: row.fileId,
            code: (error as NodeJS.ErrnoException | null)?.code ?? 'FILE_ICON_MIGRATION_FAILED'
          })
        }
        await this.deps.yieldToEventLoop()
      }
      await this.deps.yieldToEventLoop()
    }
    result.stopped = this.deps.isStopping()
    this.deps.logInfo('File icon migration pass finished', { ...result })
    return result
  }
}
