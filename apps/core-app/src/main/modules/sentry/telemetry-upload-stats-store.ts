import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import type * as schema from '../../db/schema'
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

export class TelemetryUploadStatsStore {
  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async get(): Promise<TelemetryUploadStatsRecord | null> {
    const rows = await this.db
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

    const row = rows[0]
    if (!row) return null

    return {
      searchCount: row.searchCount,
      totalUploads: row.totalUploads,
      failedUploads: row.failedUploads,
      lastUploadTime: row.lastUploadTime ?? null,
      lastFailureAt: row.lastFailureAt ?? null,
      lastFailureMessage: row.lastFailureMessage ?? null,
      updatedAt: row.updatedAt
    }
  }

  async upsert(record: TelemetryUploadStatsRecord): Promise<void> {
    await this.db
      .insert(dbSchema.telemetryUploadStats)
      .values({
        id: TELEMETRY_UPLOAD_STATS_ID,
        searchCount: record.searchCount,
        totalUploads: record.totalUploads,
        failedUploads: record.failedUploads,
        lastUploadTime: record.lastUploadTime,
        lastFailureAt: record.lastFailureAt,
        lastFailureMessage: record.lastFailureMessage,
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
          lastFailureMessage: record.lastFailureMessage,
          updatedAt: record.updatedAt
        }
      })
  }
}
