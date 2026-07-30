import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import * as dbSchema from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'

export interface TelemetryUploadStatsRecord {
  searchCount: number
  totalUploads: number
  failedUploads: number
  lastUploadTime: number | null
  lastFailureAt: number | null
  lastFailureMessage: string | null
  updatedAt: number
}

const TELEMETRY_UPLOAD_STATS_ID = 1
const TELEMETRY_FAILURE_CODES = new Set([
  'NETWORK_TIMEOUT',
  'NETWORK_UNAVAILABLE',
  'TELEMETRY_FLUSH_FAILED',
  'TELEMETRY_OUTBOX_ENQUEUE_FAILED',
  'TELEMETRY_OUTBOX_UNAVAILABLE',
  'TELEMETRY_UPLOAD_FAILED'
])

interface TelemetryUploadStatsStoreDeps {
  auxDb: LibSQLDatabase<typeof schema>
  coreDb?: LibSQLDatabase<typeof schema>
}

export function sanitizeTelemetryFailureCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' && TELEMETRY_FAILURE_CODES.has(value)
    ? value
    : 'TELEMETRY_UPLOAD_FAILED'
}

export class TelemetryUploadStatsStore {
  private readonly auxDb: LibSQLDatabase<typeof schema>
  private readonly coreDb: LibSQLDatabase<typeof schema> | null

  constructor({ auxDb, coreDb }: TelemetryUploadStatsStoreDeps) {
    this.auxDb = auxDb
    this.coreDb = coreDb && coreDb !== auxDb ? coreDb : null
  }

  private async withWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), {
      priority: 'background',
      dropPolicy: 'none',
      maxQueueWaitMs: 15_000
    })
  }

  async get(): Promise<TelemetryUploadStatsRecord | null> {
    const loadRow = async (db: LibSQLDatabase<typeof schema>) => {
      const rows = await db
        .select({
          searchCount: dbSchema.telemetryUploadStats.searchCount,
          totalUploads: dbSchema.telemetryUploadStats.totalUploads,
          failedUploads: dbSchema.telemetryUploadStats.failedUploads,
          lastUploadTime: dbSchema.telemetryUploadStats.lastUploadTime,
          lastFailureAt: dbSchema.telemetryUploadStats.lastFailureAt,
          lastFailureMessage: dbSchema.telemetryUploadStats.lastFailureMessage,
          updatedAt: dbSchema.telemetryUploadStats.updatedAt
        })
        .from(dbSchema.telemetryUploadStats)
        .where(eq(dbSchema.telemetryUploadStats.id, TELEMETRY_UPLOAD_STATS_ID))
        .limit(1)
      return rows[0]
    }

    const row = (await loadRow(this.auxDb)) ?? (this.coreDb ? await loadRow(this.coreDb) : null)
    if (!row) return null

    return {
      searchCount: row.searchCount,
      totalUploads: row.totalUploads,
      failedUploads: row.failedUploads,
      lastUploadTime: row.lastUploadTime ?? null,
      lastFailureAt: row.lastFailureAt ?? null,
      lastFailureMessage: sanitizeTelemetryFailureCode(row.lastFailureMessage),
      updatedAt: row.updatedAt
    }
  }

  async upsert(record: TelemetryUploadStatsRecord): Promise<void> {
    const lastFailureMessage = sanitizeTelemetryFailureCode(record.lastFailureMessage)
    await this.withWrite('telemetry.upload-stats.upsert', () =>
      this.auxDb
        .insert(dbSchema.telemetryUploadStats)
        .values({
          id: TELEMETRY_UPLOAD_STATS_ID,
          searchCount: record.searchCount,
          totalUploads: record.totalUploads,
          failedUploads: record.failedUploads,
          lastUploadTime: record.lastUploadTime,
          lastFailureAt: record.lastFailureAt,
          lastFailureMessage,
          updatedAt: record.updatedAt
        })
        .onConflictDoUpdate({
          target: dbSchema.telemetryUploadStats.id,
          set: {
            searchCount: record.searchCount,
            totalUploads: record.totalUploads,
            failedUploads: record.failedUploads,
            lastUploadTime: record.lastUploadTime,
            lastFailureAt: record.lastFailureAt,
            lastFailureMessage,
            updatedAt: record.updatedAt
          }
        })
    )
  }

  async clearFailureBefore(cutoffMs: number, maxRows = 2, signal?: AbortSignal): Promise<number> {
    const limit = Math.min(2, Math.max(0, Math.floor(maxRows)))
    if (limit === 0 || signal?.aborted) return 0

    const clear = async (db: LibSQLDatabase<typeof schema>, suffix: string): Promise<number> => {
      const result = await this.withWrite(`telemetry.upload-stats.retention.${suffix}`, () =>
        db
          .update(dbSchema.telemetryUploadStats)
          .set({ lastFailureAt: null, lastFailureMessage: null })
          .where(
            and(
              eq(dbSchema.telemetryUploadStats.id, TELEMETRY_UPLOAD_STATS_ID),
              isNotNull(dbSchema.telemetryUploadStats.lastFailureAt),
              lt(dbSchema.telemetryUploadStats.lastFailureAt, cutoffMs)
            )
          )
      )
      return Number(result.rowsAffected ?? 0)
    }

    let cleared = await clear(this.auxDb, 'aux')
    if (this.coreDb && cleared < limit && !signal?.aborted) {
      cleared += await clear(this.coreDb, 'compat')
    }
    return cleared
  }
}
