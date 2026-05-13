import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { ScheduleOptions } from '../../db/db-write-scheduler'
import type { LogOptions } from '../../utils/logger'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { clipboardHistoryMeta } from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'

export interface ClipboardMetaEntry {
  key: string
  value: unknown
}

export interface ClipboardMetaPersistenceOptions {
  getDatabase: () => LibSQLDatabase<typeof schema> | undefined
  isDestroyed: () => boolean
  logDebug: (message: string, data?: LogOptions) => void
  logWarn: (message: string, data?: LogOptions) => void
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /foreign key constraint failed/i.test(message)
}

export function isDroppedDbWriteTaskError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('DB write task dropped')
}

export class ClipboardMetaPersistence {
  constructor(private readonly options: ClipboardMetaPersistenceOptions) {}

  public async withDbWrite<T>(
    label: string,
    operation: () => Promise<T>,
    options?: ScheduleOptions
  ): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), options)
  }

  public async persistMetaEntries(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[],
    options?: ScheduleOptions
  ): Promise<void> {
    const db = this.options.getDatabase()
    if (!db) return

    const resolvedEntries =
      entries && entries.length > 0
        ? entries
        : Object.entries(meta).map(([key, value]) => ({ key, value }))
    const values = resolvedEntries
      .filter((entry) => entry.value !== undefined)
      .map((entry) => ({
        clipboardId,
        key: entry.key,
        value: JSON.stringify(entry.value ?? null)
      }))

    if (values.length === 0) return

    await this.withDbWrite(
      'clipboard.meta',
      () => db.insert(clipboardHistoryMeta).values(values),
      options
    )
  }

  public persistMetaEntriesSafely(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[],
    options?: ScheduleOptions
  ): void {
    void this.persistMetaEntries(clipboardId, meta, entries, options).catch((error) => {
      if (this.options.isDestroyed()) return

      if (isDroppedDbWriteTaskError(error)) {
        this.options.logDebug('Clipboard meta write dropped due to queue pressure', {
          meta: { clipboardId }
        })
        return
      }

      if (isForeignKeyConstraintError(error)) {
        this.options.logWarn('Clipboard meta write skipped because parent entry is missing', {
          meta: { clipboardId }
        })
        return
      }

      this.options.logWarn('Clipboard meta write failed', { error, meta: { clipboardId } })
    })
  }
}
