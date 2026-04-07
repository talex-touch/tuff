import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
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

interface TelemetryUploadStatsStoreDeps {
  auxDb: LibSQLDatabase<typeof schema>
  coreDb?: LibSQLDatabase<typeof schema>
}

export class TelemetryUploadStatsStore {
  private readonly auxDb: LibSQLDatabase<typeof schema>
  private readonly coreDb: LibSQLDatabase<typeof schema> | null

  constructor({ auxDb, coreDb }: TelemetryUploadStatsStoreDeps) {
    this.auxDb = auxDb
    this.coreDb = coreDb && coreDb !== auxDb ? coreDb : null
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
      lastFailureMessage: row.lastFailureMessage ?? null,
      updatedAt: row.updatedAt
    }
  }

  async upsert(record: TelemetryUploadStatsRecord): Promise<void> {
    await this.auxDb
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
