import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { ScheduleOptions } from '../../db/db-write-scheduler'
import type { AuxDbResolver, MainDatabase } from '../../db/db-write'
import type { LogOptions } from '../../utils/logger'
import { scheduleAuxWrite } from '../../db/db-write'
import { clipboardHistoryMeta } from '../../db/schema'

export interface ClipboardMetaEntry {
  key: string
  value: unknown
}

export interface ClipboardMetaPersistenceOptions {
  getDatabase: () => LibSQLDatabase<typeof schema> | undefined
  /**
   * Live aux resolution used for every scheduled write (enqueue-time). The
   * clipboard module passes a resolver that also refreshes its own captured
   * handle so reads stay coherent with the write target. Optional so unit
   * tests can inject a fixed fake; defaults to the global DatabaseModule
   * resolver.
   */
  resolveAuxDb?: AuxDbResolver
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

  /**
   * Shared clipboard write entry: schedules through the aux write path and
   * hands the operation the enqueue-time-resolved database handle. Callers
   * must write through the provided `db`, never a captured module field.
   */
  public async withDbWrite<T>(
    label: string,
    operation: (db: MainDatabase) => Promise<T>,
    options?: ScheduleOptions
  ): Promise<T> {
    return scheduleAuxWrite(label, operation, {
      ...options,
      resolveDb: this.options.resolveAuxDb
    })
  }

  public async persistMetaEntries(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[],
    options?: ScheduleOptions
  ): Promise<void> {
    // Readiness gate only; the write resolves its own handle at enqueue time.
    if (!this.options.getDatabase()) return

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
      (db) => db.insert(clipboardHistoryMeta).values(values),
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
