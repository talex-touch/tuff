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
const QUEUE_PRESSURE_LOG_THROTTLE_MS = 60_000
const SNAPSHOT_MIN_PERSIST_INTERVAL_MS: Record<AnalyticsWindowType, number> = {
  '1m': 0,
  '5m': 0,
  '15m': 2 * 60_000,
  '1h': 5 * 60_000,
  '24h': 15 * 60_000
}
const log = createLogger('AnalyticsStore')

type QueuePressureKind =
  | 'snapshotsThrottled'
  | 'snapshotsSkipped'
  | 'snapshotsDropped'
  | 'snapshotsFailed'
  | 'cleanupSkipped'
  | 'pluginSkipped'
  | 'pluginDropped'
  | 'pluginFailed'

interface QueuePressureStats {
  snapshotsThrottled: number
  snapshotsSkipped: number
  snapshotsDropped: number
  snapshotsFailed: number
  cleanupSkipped: number
  pluginSkipped: number
  pluginDropped: number
  pluginFailed: number
}

export class DbStore {
  private lastSnapshotPersistAt = new Map<AnalyticsWindowType, number>()
  private lastQueuePressureLogAt = 0
  private queuePressureStats: QueuePressureStats = {
    snapshotsThrottled: 0,
    snapshotsSkipped: 0,
    snapshotsDropped: 0,
    snapshotsFailed: 0,
    cleanupSkipped: 0,
    pluginSkipped: 0,
    pluginDropped: 0,
    pluginFailed: 0
  }
  private lastQueuePressureQueued = 0
  private lastQueuePressureError: string | null = null
  constructor(private db: LibSQLDatabase<typeof schema>) {}

  private shouldLogQueuePressure(now: number): boolean {
    if (now - this.lastQueuePressureLogAt < QUEUE_PRESSURE_LOG_THROTTLE_MS) return false
    this.lastQueuePressureLogAt = now
    return true
  }

  private recordQueuePressure(
    kind: QueuePressureKind,
    options?: { queued?: number; error?: unknown; count?: number }
  ): void {
    this.queuePressureStats[kind] += Math.max(1, options?.count ?? 1)
    if (typeof options?.queued === 'number') {
      this.lastQueuePressureQueued = options.queued
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'error')) {
      const errorMessage =
        options.error instanceof Error ? options.error.message : String(options.error ?? '')
      this.lastQueuePressureError = errorMessage.slice(0, 180)
    }

    const now = Date.now()
    if (!this.shouldLogQueuePressure(now)) {
      return
    }

    this.flushQueuePressureSummary()
  }

  private flushQueuePressureSummary(): void {
    const stats = this.queuePressureStats
    const total =
      stats.snapshotsThrottled +
      stats.snapshotsSkipped +
      stats.snapshotsDropped +
      stats.snapshotsFailed +
      stats.cleanupSkipped +
      stats.pluginSkipped +
      stats.pluginDropped +
      stats.pluginFailed

    if (total <= 0) {
      return
    }

    log.warn('Analytics queue pressure summary', {
      meta: {
        total,
        snapshotsThrottled: stats.snapshotsThrottled,
        snapshotsSkipped: stats.snapshotsSkipped,
        snapshotsDropped: stats.snapshotsDropped,
        snapshotsFailed: stats.snapshotsFailed,
        cleanupSkipped: stats.cleanupSkipped,
        pluginSkipped: stats.pluginSkipped,
        pluginDropped: stats.pluginDropped,
        pluginFailed: stats.pluginFailed,
        queued: this.lastQueuePressureQueued > 0 ? this.lastQueuePressureQueued : undefined,
        lastError: this.lastQueuePressureError ?? undefined
      }
    })

    this.queuePressureStats = {
      snapshotsThrottled: 0,
      snapshotsSkipped: 0,
      snapshotsDropped: 0,
      snapshotsFailed: 0,
      cleanupSkipped: 0,
      pluginSkipped: 0,
      pluginDropped: 0,
      pluginFailed: 0
    }
    this.lastQueuePressureQueued = 0
    this.lastQueuePressureError = null
  }

  async saveSnapshots(snapshots: AnalyticsSnapshot[]): Promise<void> {
    const now = Date.now()
    const persistable: AnalyticsSnapshot[] = []
    let throttled = 0

    for (const snapshot of snapshots) {
      if (!PERSIST_WINDOWS.includes(snapshot.windowType)) {
        continue
      }

      const minIntervalMs = SNAPSHOT_MIN_PERSIST_INTERVAL_MS[snapshot.windowType] ?? 0
      const lastPersistAt = this.lastSnapshotPersistAt.get(snapshot.windowType) ?? 0
      if (minIntervalMs > 0 && now - lastPersistAt < minIntervalMs) {
        throttled += 1
        continue
      }

      persistable.push(snapshot)
    }

    if (throttled > 0) {
      this.recordQueuePressure('snapshotsThrottled', { count: throttled })
    }

    if (!persistable.length) return
    const queueStats = dbWriteScheduler.getStats()
    if (queueStats.queued >= ANALYTICS_QUEUE_LIMIT) {
      this.recordQueuePressure('snapshotsSkipped', { queued: queueStats.queued })
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
      for (const snapshot of persistable) {
        this.lastSnapshotPersistAt.set(snapshot.windowType, now)
      }
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      if (isDropped) {
        this.recordQueuePressure('snapshotsDropped')
      } else {
        this.recordQueuePressure('snapshotsFailed', { error })
      }
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
      this.recordQueuePressure('cleanupSkipped', { queued: queueStats.queued })
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
        this.recordQueuePressure('pluginSkipped', { queued: queueStats.queued })
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
      if (isDropped) {
        this.recordQueuePressure('pluginDropped')
      } else {
        this.recordQueuePressure('pluginFailed', { error })
      }
    }
  }
}
