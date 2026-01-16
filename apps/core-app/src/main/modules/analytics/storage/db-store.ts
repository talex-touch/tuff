import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
} from '@talex-touch/utils/analytics'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { enterPerfContext } from '../../../utils/perf-context'
import { createLogger } from '../../../utils/logger'

const PERSIST_WINDOWS: AnalyticsWindowType[] = ['15m', '1h', '24h']
const log = createLogger('AnalyticsStore')

export class DbStore {
  constructor(private db: LibSQLDatabase<typeof schema>) {}

  async saveSnapshots(snapshots: AnalyticsSnapshot[]): Promise<void> {
    const persistable = snapshots.filter(snapshot => PERSIST_WINDOWS.includes(snapshot.windowType))
    if (!persistable.length)
      return

    const createdAt = Math.floor(Date.now() / 1000)
    const dispose = enterPerfContext('AnalyticsSnapshots.persist', {
      count: persistable.length,
    })
    try {
      await dbWriteScheduler.schedule('analytics.snapshots', () =>
        withSqliteRetry(() =>
          this.db.insert(schema.analyticsSnapshots).values(
            persistable.map(snapshot => ({
              windowType: snapshot.windowType,
              timestamp: snapshot.timestamp,
              metrics: JSON.stringify(snapshot.metrics),
              createdAt,
            })),
          ),
          { label: 'analytics.snapshots' },
        ),
      )
    } catch (error) {
      log.error('Failed to save analytics snapshots', {
        error,
        meta: { count: persistable.length },
      })
    } finally {
      dispose()
    }
  }

  async getRange(request: AnalyticsRangeRequest): Promise<AnalyticsSnapshot[]> {
    const rows = await this.db
      .select({
        windowType: schema.analyticsSnapshots.windowType,
        timestamp: schema.analyticsSnapshots.timestamp,
        metrics: schema.analyticsSnapshots.metrics,
      })
      .from(schema.analyticsSnapshots)
      .where(
        and(
          eq(schema.analyticsSnapshots.windowType, request.windowType),
          gte(schema.analyticsSnapshots.timestamp, request.from),
          lte(schema.analyticsSnapshots.timestamp, request.to),
        ),
      )
      .orderBy(asc(schema.analyticsSnapshots.timestamp))

    return rows.map(row => ({
      windowType: row.windowType as AnalyticsWindowType,
      timestamp: row.timestamp,
      metrics: JSON.parse(row.metrics),
    }))
  }

  async cleanup(retention: Record<AnalyticsWindowType, number>, now: () => number): Promise<void> {
    const nowMs = now()
    const clauses = PERSIST_WINDOWS.map(windowType => ({
      windowType,
      cutoff: nowMs - (retention[windowType] ?? 0),
    }))

    for (const clause of clauses) {
      await this.db
        .delete(schema.analyticsSnapshots)
        .where(
          and(
            eq(schema.analyticsSnapshots.windowType, clause.windowType),
            lt(schema.analyticsSnapshots.timestamp, clause.cutoff),
          ),
        )
    }
  }

  async insertPluginEvent(payload: {
    pluginName: string
    pluginVersion?: string
    featureId?: string
    eventType: string
    count?: number
    metadata?: Record<string, unknown>
    timestamp: number
  }): Promise<void> {
    await dbWriteScheduler.schedule('analytics.plugin', () =>
      withSqliteRetry(
        () =>
          this.db.insert(schema.pluginAnalytics).values({
            pluginName: payload.pluginName,
            pluginVersion: payload.pluginVersion ?? null,
            featureId: payload.featureId,
            eventType: payload.eventType,
            count: payload.count ?? 1,
            metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
            timestamp: payload.timestamp,
          }),
        { label: 'analytics.plugin' },
      ),
    )
  }
}
