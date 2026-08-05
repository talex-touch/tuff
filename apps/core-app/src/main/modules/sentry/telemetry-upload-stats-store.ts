import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { AuxDbResolver, ScheduleOptions } from '../../db/db-write'
import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { scheduleAuxWrite, scheduleDbWrite } from '../../db/db-write'
import * as dbSchema from '../../db/schema'

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
  /**
   * Live aux-DB resolution (enqueue-time). Production passes the
   * databaseModule-backed resolver so a store constructed before the
   * background aux init cannot pin the primary fallback forever; tests that
   * inject a fixed fake `auxDb` can omit it.
   */
  resolveAuxDb?: AuxDbResolver
}

const TELEMETRY_WRITE_OPTIONS: ScheduleOptions = {
  priority: 'background',
  dropPolicy: 'none',
  maxQueueWaitMs: 15_000
}

export function sanitizeTelemetryFailureCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' && TELEMETRY_FAILURE_CODES.has(value)
    ? value
    : 'TELEMETRY_UPLOAD_FAILED'
}

export class TelemetryUploadStatsStore {
  private readonly resolveAuxDb: AuxDbResolver
  private readonly coreDbDep: LibSQLDatabase<typeof schema> | null

  constructor({ auxDb, coreDb, resolveAuxDb }: TelemetryUploadStatsStoreDeps) {
    this.resolveAuxDb = resolveAuxDb ?? (() => ({ db: auxDb, isAux: true }))
    this.coreDbDep = coreDb ?? null
  }

  // Both handles resolve live so reads stay coherent with the enqueue-time
  // write target while the aux DB finishes its background init.
  private get auxDb(): LibSQLDatabase<typeof schema> {
    return this.resolveAuxDb().db
  }

  private get coreDb(): LibSQLDatabase<typeof schema> | null {
    if (!this.coreDbDep) return null
    return this.coreDbDep !== this.resolveAuxDb().db ? this.coreDbDep : null
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
    await scheduleAuxWrite(
      'telemetry.upload-stats.upsert',
      (db) =>
        db
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
          }),
      { ...TELEMETRY_WRITE_OPTIONS, resolveDb: this.resolveAuxDb }
    )
  }

  async clearFailureBefore(cutoffMs: number, maxRows = 2, signal?: AbortSignal): Promise<number> {
    const limit = Math.min(2, Math.max(0, Math.floor(maxRows)))
    if (limit === 0 || signal?.aborted) return 0

    const clearOn = (db: LibSQLDatabase<typeof schema>) =>
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

    const auxResult = await scheduleAuxWrite(
      'telemetry.upload-stats.retention.aux',
      (db) => clearOn(db),
      { ...TELEMETRY_WRITE_OPTIONS, resolveDb: this.resolveAuxDb }
    )
    let cleared = Number(auxResult.rowsAffected ?? 0)

    // `.compat` dual-write on the primary DB — kept until the Phase 6
    // retirement; routes through the primary write path explicitly.
    const coreDb = this.coreDb
    if (coreDb && cleared < limit && !signal?.aborted) {
      const compatResult = await scheduleDbWrite(
        'telemetry.upload-stats.retention.compat',
        () => clearOn(coreDb),
        TELEMETRY_WRITE_OPTIONS
      )
      cleared += Number(compatResult.rowsAffected ?? 0)
    }
    return cleared
  }
}
