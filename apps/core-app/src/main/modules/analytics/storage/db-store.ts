import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType
} from '@talex-touch/utils/analytics'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { createLogger } from '../../../utils/logger'
import { enterPerfContext } from '../../../utils/perf-context'

const PERSIST_WINDOWS: AnalyticsWindowType[] = ['15m', '1h', '24h']
const ANALYTICS_QUEUE_LIMIT = 8
const QUEUE_PRESSURE_LOG_THROTTLE_MS = 5_000
const log = createLogger('AnalyticsStore')

export class DbStore {
  private lastQueuePressureLogAt = 0
  constructor(private db: LibSQLDatabase<typeof schema>) {}

  private shouldLogQueuePressure(now: number): boolean {
    if (now - this.lastQueuePressureLogAt < QUEUE_PRESSURE_LOG_THROTTLE_MS) return false
    this.lastQueuePressureLogAt = now
    return true
  }

  async saveSnapshots(snapshots: AnalyticsSnapshot[]): Promise<void> {
    const persistable = snapshots.filter((snapshot) =>
      PERSIST_WINDOWS.includes(snapshot.windowType)
    )
    if (!persistable.length) return
    const queueStats = dbWriteScheduler.getStats()
    if (queueStats.queued >= ANALYTICS_QUEUE_LIMIT) {
      const now = Date.now()
      if (this.shouldLogQueuePressure(now)) {
        log.warn('Analytics snapshots skipped (queue pressure)', {
          meta: { queued: queueStats.queued }
        })
      }
      return
    }

    const createdAt = Math.floor(Date.now() / 1000)
    let totalBytes = 0
    const disposeSerialize = enterPerfContext('AnalyticsSnapshots.serialize', {
      count: persistable.length
    })
    let rows: Array<typeof schema.analyticsSnapshots.$inferInsert> = []
    try {
      rows = persistable.map((snapshot) => {
        const metrics = JSON.stringify(snapshot.metrics)
        totalBytes += metrics.length
        return {
          windowType: snapshot.windowType,
          timestamp: snapshot.timestamp,
          metrics,
          createdAt
        }
      })
    } catch (error) {
      log.error('Failed to serialize analytics snapshots', {
        error,
        meta: { count: persistable.length }
      })
      return
    } finally {
      disposeSerialize()
    }

    const disposePersist = enterPerfContext('AnalyticsSnapshots.persist', {
      count: persistable.length,
      bytes: totalBytes
    })
    try {
      await dbWriteScheduler.schedule(
        'analytics.snapshots',
        () =>
          withSqliteRetry(() => this.db.insert(schema.analyticsSnapshots).values(rows), {
            label: 'analytics.snapshots'
          }),
        { droppable: true }
      )
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      const message = isDropped
        ? 'Analytics snapshots dropped (queue pressure)'
        : 'Failed to save analytics snapshots'
      log.warn(message, {
        error: isDropped ? undefined : error,
        meta: { count: persistable.length }
      })
    } finally {
      disposePersist()
    }
  }

  async getRange(request: AnalyticsRangeRequest): Promise<AnalyticsSnapshot[]> {
    const rows = await this.db
      .select({
        windowType: schema.analyticsSnapshots.windowType,
        timestamp: schema.analyticsSnapshots.timestamp,
        metrics: schema.analyticsSnapshots.metrics
      })
      .from(schema.analyticsSnapshots)
      .where(
        and(
          eq(schema.analyticsSnapshots.windowType, request.windowType),
          gte(schema.analyticsSnapshots.timestamp, request.from),
          lte(schema.analyticsSnapshots.timestamp, request.to)
        )
      )
      .orderBy(asc(schema.analyticsSnapshots.timestamp))

    return rows.map((row) => ({
      windowType: row.windowType as AnalyticsWindowType,
      timestamp: row.timestamp,
      metrics: JSON.parse(row.metrics)
    }))
  }

  async cleanup(retention: Record<AnalyticsWindowType, number>, now: () => number): Promise<void> {
    const nowMs = now()
    const clauses = PERSIST_WINDOWS.map((windowType) => ({
      windowType,
      cutoff: nowMs - (retention[windowType] ?? 0)
    }))
    const queueStats = dbWriteScheduler.getStats()
    if (queueStats.queued >= ANALYTICS_QUEUE_LIMIT) {
      if (this.shouldLogQueuePressure(nowMs)) {
        log.warn('Analytics cleanup skipped (queue pressure)', {
          meta: { queued: queueStats.queued }
        })
      }
      return
    }

    await dbWriteScheduler.schedule(
      'analytics.cleanup',
      () =>
        withSqliteRetry(
          async () => {
            for (const clause of clauses) {
              await this.db
                .delete(schema.analyticsSnapshots)
                .where(
                  and(
                    eq(schema.analyticsSnapshots.windowType, clause.windowType),
                    lt(schema.analyticsSnapshots.timestamp, clause.cutoff)
                  )
                )
            }
          },
          { label: 'analytics.cleanup' }
        ),
      { droppable: true }
    )
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
    try {
      const queueStats = dbWriteScheduler.getStats()
      if (queueStats.queued >= ANALYTICS_QUEUE_LIMIT) {
        const now = Date.now()
        if (this.shouldLogQueuePressure(now)) {
          log.warn('Plugin analytics skipped (queue pressure)', {
            meta: { queued: queueStats.queued }
          })
        }
        return
      }
      await dbWriteScheduler.schedule(
        'analytics.plugin',
        () =>
          withSqliteRetry(
            () =>
              this.db.insert(schema.pluginAnalytics).values({
                pluginName: payload.pluginName,
                pluginVersion: payload.pluginVersion ?? null,
                featureId: payload.featureId,
                eventType: payload.eventType,
                count: payload.count ?? 1,
                metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
                timestamp: payload.timestamp
              }),
            { label: 'analytics.plugin' }
          ),
        { droppable: true }
      )
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      log.warn(
        isDropped ? 'Plugin analytics dropped (queue pressure)' : 'Failed to save plugin analytics',
        {
          error: isDropped ? undefined : error,
          meta: { plugin: payload.pluginName, event: payload.eventType }
        }
      )
    }
  }
}
