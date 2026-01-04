import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import { asc, eq, gte, lt, sql } from 'drizzle-orm'
import * as dbSchema from '../../db/schema'

export interface ReportQueueItem {
  id: number
  endpoint: string
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
  lastAttemptAt?: number
  lastError?: string | null
}

export class ReportQueueStore {
  constructor(private db: LibSQLDatabase<typeof schema>) {}

  async list(cutoff?: number): Promise<ReportQueueItem[]> {
    const query = this.db
      .select({
        id: dbSchema.analyticsReportQueue.id,
        endpoint: dbSchema.analyticsReportQueue.endpoint,
        payload: dbSchema.analyticsReportQueue.payload,
        createdAt: dbSchema.analyticsReportQueue.createdAt,
        retryCount: dbSchema.analyticsReportQueue.retryCount,
        lastAttemptAt: dbSchema.analyticsReportQueue.lastAttemptAt,
        lastError: dbSchema.analyticsReportQueue.lastError,
      })
      .from(dbSchema.analyticsReportQueue)
      .orderBy(asc(dbSchema.analyticsReportQueue.createdAt))

    const rows = cutoff
      ? await query.where(gte(dbSchema.analyticsReportQueue.createdAt, cutoff))
      : await query

    return rows.map(row => ({
      id: row.id,
      endpoint: row.endpoint,
      payload: safeParsePayload(row.payload),
      createdAt: row.createdAt,
      retryCount: row.retryCount,
      lastAttemptAt: row.lastAttemptAt ?? undefined,
      lastError: row.lastError ?? null,
    }))
  }

  async insert(entry: { endpoint: string, payload: Record<string, unknown>, createdAt: number }): Promise<void> {
    await this.db.insert(dbSchema.analyticsReportQueue).values({
      endpoint: entry.endpoint,
      payload: JSON.stringify(entry.payload),
      createdAt: entry.createdAt,
      retryCount: 0,
    })
  }

  async markAttempt(id: number, error?: string): Promise<void> {
    await this.db
      .update(dbSchema.analyticsReportQueue)
      .set({
        retryCount: sql`${dbSchema.analyticsReportQueue.retryCount} + 1`,
        lastAttemptAt: Date.now(),
        lastError: error ?? null,
      })
      .where(eq(dbSchema.analyticsReportQueue.id, id))
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(dbSchema.analyticsReportQueue).where(eq(dbSchema.analyticsReportQueue.id, id))
  }

  async prune(cutoff: number): Promise<void> {
    await this.db
      .delete(dbSchema.analyticsReportQueue)
      .where(lt(dbSchema.analyticsReportQueue.createdAt, cutoff))
  }
}

function safeParsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object')
      return parsed as Record<string, unknown>
  }
  catch {
    // ignore parse errors
  }
  return {}
}
