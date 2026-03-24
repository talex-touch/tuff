import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import { asc, eq, gte, lt, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import * as dbSchema from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'

export interface ReportQueueItem {
  id: number
  endpoint: string
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
  lastAttemptAt?: number
  lastError?: string | null
}

interface ReportQueueStoreDeps {
  auxDb: LibSQLDatabase<typeof schema>
  coreDb?: LibSQLDatabase<typeof schema>
}

export class ReportQueueStore {
  private auxDb: LibSQLDatabase<typeof schema>
  private coreDb: LibSQLDatabase<typeof schema> | null

  constructor({ auxDb, coreDb }: ReportQueueStoreDeps) {
    this.auxDb = auxDb
    this.coreDb = coreDb && coreDb !== auxDb ? coreDb : null
  }

  private async withDbWrite<T>(
    label: string,
    operation: (db: LibSQLDatabase<typeof schema>) => Promise<T>,
    options?: { mirrorCore?: boolean }
  ): Promise<T> {
    return dbWriteScheduler.schedule(
      label,
      async () => {
        const result = await withSqliteRetry(() => operation(this.auxDb), { label })
        if (options?.mirrorCore && this.coreDb) {
          await withSqliteRetry(() => operation(this.coreDb!), { label: `${label}.compat` }).catch(
            () => {}
          )
        }
        return result
      },
      {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: 10_000
      }
    )
  }

  private async queryRows(cutoff?: number, dbOverride?: LibSQLDatabase<typeof schema>) {
    const targetDb = dbOverride ?? this.auxDb
    const query = targetDb
      .select({
        id: dbSchema.analyticsReportQueue.id,
        endpoint: dbSchema.analyticsReportQueue.endpoint,
        payload: dbSchema.analyticsReportQueue.payload,
        createdAt: dbSchema.analyticsReportQueue.createdAt,
        retryCount: dbSchema.analyticsReportQueue.retryCount,
        lastAttemptAt: dbSchema.analyticsReportQueue.lastAttemptAt,
        lastError: dbSchema.analyticsReportQueue.lastError
      })
      .from(dbSchema.analyticsReportQueue)
      .orderBy(asc(dbSchema.analyticsReportQueue.createdAt))

    if (cutoff) {
      return query.where(gte(dbSchema.analyticsReportQueue.createdAt, cutoff))
    }
    return query
  }

  async list(cutoff?: number): Promise<ReportQueueItem[]> {
    let rows = await this.queryRows(cutoff)
    if (rows.length === 0 && this.coreDb) {
      rows = await this.queryRows(cutoff, this.coreDb)
    }

    return rows.map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      payload: safeParsePayload(row.payload),
      createdAt: row.createdAt,
      retryCount: row.retryCount,
      lastAttemptAt: row.lastAttemptAt ?? undefined,
      lastError: row.lastError ?? null
    }))
  }

  async insert(entry: {
    endpoint: string
    payload: Record<string, unknown>
    createdAt: number
  }): Promise<void> {
    await this.withDbWrite('analytics.report-queue.insert', (db) =>
      db.insert(dbSchema.analyticsReportQueue).values({
        endpoint: entry.endpoint,
        payload: JSON.stringify(entry.payload),
        createdAt: entry.createdAt,
        retryCount: 0
      })
    )
  }

  async markAttempt(id: number, error?: string): Promise<void> {
    await this.withDbWrite(
      'analytics.report-queue.mark-attempt',
      (db) =>
        db
          .update(dbSchema.analyticsReportQueue)
          .set({
            retryCount: sql`${dbSchema.analyticsReportQueue.retryCount} + 1`,
            lastAttemptAt: Date.now(),
            lastError: error ?? null
          })
          .where(eq(dbSchema.analyticsReportQueue.id, id)),
      { mirrorCore: true }
    )
  }

  async remove(id: number): Promise<void> {
    await this.withDbWrite(
      'analytics.report-queue.remove',
      (db) =>
        db.delete(dbSchema.analyticsReportQueue).where(eq(dbSchema.analyticsReportQueue.id, id)),
      { mirrorCore: true }
    )
  }

  async prune(cutoff: number): Promise<void> {
    await this.withDbWrite(
      'analytics.report-queue.prune',
      (db) =>
        db
          .delete(dbSchema.analyticsReportQueue)
          .where(lt(dbSchema.analyticsReportQueue.createdAt, cutoff)),
      { mirrorCore: true }
    )
  }
}

function safeParsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // ignore parse errors
  }
  return {}
}
