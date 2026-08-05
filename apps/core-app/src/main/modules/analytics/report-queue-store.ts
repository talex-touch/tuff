import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { AuxDbResolver, ScheduleOptions } from '../../db/db-write'
import { asc, eq, gte, lt, sql } from 'drizzle-orm'
import { scheduleAuxWrite, scheduleDbWrite } from '../../db/db-write'
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

interface ReportQueueStoreDeps {
  auxDb: LibSQLDatabase<typeof schema>
  coreDb?: LibSQLDatabase<typeof schema>
  maxItems?: number
  /**
   * Live aux-DB resolution (enqueue-time). Production passes the
   * databaseModule-backed resolver so a store constructed before the
   * background aux init cannot pin the primary fallback forever; tests that
   * inject a fixed fake `auxDb` can omit it.
   */
  resolveAuxDb?: AuxDbResolver
}

const REPORT_QUEUE_WRITE_OPTIONS: ScheduleOptions = {
  priority: 'best_effort',
  dropPolicy: 'none',
  maxQueueWaitMs: 15_000
}

export class ReportQueueStore {
  private readonly resolveAuxDb: AuxDbResolver
  private readonly coreDbDep: LibSQLDatabase<typeof schema> | null
  private readonly maxItems: number

  constructor({ auxDb, coreDb, maxItems, resolveAuxDb }: ReportQueueStoreDeps) {
    this.resolveAuxDb = resolveAuxDb ?? (() => ({ db: auxDb, isAux: true }))
    this.coreDbDep = coreDb ?? null
    this.maxItems =
      typeof maxItems === 'number' && Number.isFinite(maxItems)
        ? Math.min(1_000, Math.max(1, Math.floor(maxItems)))
        : 120
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

  private async withDbWrite<T>(
    label: string,
    operation: (db: LibSQLDatabase<typeof schema>) => Promise<T>,
    options?: { mirrorCore?: boolean }
  ): Promise<T> {
    const result = await scheduleAuxWrite(label, (db) => operation(db), {
      ...REPORT_QUEUE_WRITE_OPTIONS,
      resolveDb: this.resolveAuxDb
    })
    // `.compat` dual-write on the primary DB — kept until the Phase 6
    // retirement; scheduled as its own primary-target task.
    const coreDb = options?.mirrorCore ? this.coreDb : null
    if (coreDb) {
      await scheduleDbWrite(
        `${label}.compat`,
        () => operation(coreDb),
        REPORT_QUEUE_WRITE_OPTIONS
      ).catch(() => {})
    }
    return result
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
      db.transaction(async (tx) => {
        await tx.insert(dbSchema.analyticsReportQueue).values({
          endpoint: entry.endpoint,
          payload: JSON.stringify(entry.payload),
          createdAt: entry.createdAt,
          retryCount: 0
        })
        await tx.run(sql`
          DELETE FROM ${dbSchema.analyticsReportQueue}
          WHERE ${dbSchema.analyticsReportQueue.id} IN (
            SELECT ${dbSchema.analyticsReportQueue.id}
            FROM ${dbSchema.analyticsReportQueue}
            ORDER BY ${dbSchema.analyticsReportQueue.createdAt} DESC,
                     ${dbSchema.analyticsReportQueue.id} DESC
            LIMIT -1 OFFSET ${this.maxItems}
          )
        `)
      })
    )
  }

  async markAttempt(id: number, error?: string): Promise<void> {
    const lastError =
      typeof error === 'string' && /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/.test(error)
        ? error
        : error
          ? 'ANALYTICS_REPORT_FAILED'
          : null
    await this.withDbWrite(
      'analytics.report-queue.mark-attempt',
      (db) =>
        db
          .update(dbSchema.analyticsReportQueue)
          .set({
            retryCount: sql`${dbSchema.analyticsReportQueue.retryCount} + 1`,
            lastAttemptAt: Date.now(),
            lastError
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

  async prune(cutoff: number): Promise<number> {
    const result = await this.withDbWrite(
      'analytics.report-queue.prune',
      (db) =>
        db
          .delete(dbSchema.analyticsReportQueue)
          .where(lt(dbSchema.analyticsReportQueue.createdAt, cutoff)),
      { mirrorCore: true }
    )
    return Number(result.rowsAffected ?? 0)
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
