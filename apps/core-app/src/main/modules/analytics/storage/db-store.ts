import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType
} from '@talex-touch/utils/analytics'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { isStartupDegradeActive } from '../../../db/startup-degrade'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { createLogger } from '../../../utils/logger'
import { enterPerfContext } from '../../../utils/perf-context'
import {
  sanitizePluginAnalyticsIdentifier,
  sanitizePluginAnalyticsMetadata,
  sanitizePluginAnalyticsNumber
} from '../analytics-report-sanitizer'

const PERSIST_WINDOWS: AnalyticsWindowType[] = ['15m', '1h', '24h']
const ANALYTICS_QUEUE_LIMIT = 8
const QUEUE_PRESSURE_LOG_THROTTLE_MS = 60_000
const SNAPSHOT_FAILURE_BACKOFF_BASE_MS = 1_500
const SNAPSHOT_FAILURE_BACKOFF_MAX_MS = 30_000
const SNAPSHOT_MIN_PERSIST_INTERVAL_MS: Record<AnalyticsWindowType, number> = {
  '1m': 0,
  '5m': 0,
  '15m': 10 * 60_000,
  '1h': 20 * 60_000,
  '24h': 60 * 60_000
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

interface DbStoreDeps {
  auxDb: LibSQLDatabase<typeof schema>
  coreDb?: LibSQLDatabase<typeof schema>
}

export class DbStore {
  private db: LibSQLDatabase<typeof schema>
  private fallbackDb: LibSQLDatabase<typeof schema> | null
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
  private snapshotPersistSuspendUntil = 0
  private snapshotPersistFailureStreak = 0
  constructor({ auxDb, coreDb }: DbStoreDeps) {
    this.db = auxDb
    this.fallbackDb = coreDb && coreDb !== auxDb ? coreDb : null
  }

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
      const candidateCode =
        typeof options.error === 'object' && options.error !== null && 'code' in options.error
          ? (options.error as { code?: unknown }).code
          : undefined
      this.lastQueuePressureError =
        typeof candidateCode === 'string' && /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/.test(candidateCode)
          ? candidateCode
          : 'ANALYTICS_DB_WRITE_FAILED'
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

    const meta = {
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
    const hasHardPressure =
      stats.snapshotsDropped > 0 ||
      stats.snapshotsFailed > 0 ||
      stats.cleanupSkipped > 0 ||
      stats.pluginDropped > 0 ||
      stats.pluginFailed > 0

    if (hasHardPressure) {
      log.warn('Analytics queue pressure summary', { meta })
    } else {
      log.info('Analytics queue pressure summary', { meta })
    }

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
    if (isStartupDegradeActive() && now < this.snapshotPersistSuspendUntil) {
      return
    }
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
        {
          priority: 'best_effort',
          dropPolicy: 'drop',
          maxQueueWaitMs: 10_000
        }
      )
      this.snapshotPersistFailureStreak = 0
      this.snapshotPersistSuspendUntil = 0
      for (const snapshot of persistable) {
        this.lastSnapshotPersistAt.set(snapshot.windowType, now)
      }
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      if (isDropped) {
        this.recordQueuePressure('snapshotsDropped')
      } else {
        this.recordQueuePressure('snapshotsFailed', { error })
        if (isStartupDegradeActive()) {
          this.snapshotPersistFailureStreak += 1
          const delay = Math.min(
            SNAPSHOT_FAILURE_BACKOFF_MAX_MS,
            SNAPSHOT_FAILURE_BACKOFF_BASE_MS *
              2 ** Math.min(6, Math.max(0, this.snapshotPersistFailureStreak - 1))
          )
          this.snapshotPersistSuspendUntil = Date.now() + delay
        }
      }
    } finally {
      disposePersist()
    }
  }

  async getRange(request: AnalyticsRangeRequest): Promise<AnalyticsSnapshot[]> {
    const loadRows = async (db: LibSQLDatabase<typeof schema>) =>
      db
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

    const rows = await loadRows(this.db)
    const effectiveRows =
      rows.length > 0 || !this.fallbackDb ? rows : await loadRows(this.fallbackDb)

    return effectiveRows.map((row) => ({
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
      {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: 10_000
      }
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
      const pluginName = sanitizePluginAnalyticsIdentifier(payload.pluginName)
      const pluginVersion = payload.pluginVersion
        ? sanitizePluginAnalyticsIdentifier(payload.pluginVersion)
        : null
      const featureId = payload.featureId
        ? sanitizePluginAnalyticsIdentifier(payload.featureId)
        : undefined
      const eventType = sanitizePluginAnalyticsIdentifier(payload.eventType)
      const metadata = sanitizePluginAnalyticsMetadata(payload.metadata)
      const count = Math.max(0, Math.floor(sanitizePluginAnalyticsNumber(payload.count ?? 1)))
      const timestamp =
        Number.isSafeInteger(payload.timestamp) && payload.timestamp >= 0
          ? payload.timestamp
          : Date.now()
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
                pluginName,
                pluginVersion,
                featureId,
                eventType,
                count,
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
                timestamp
              }),
            { label: 'analytics.plugin' }
          ),
        {
          priority: 'best_effort',
          dropPolicy: 'drop',
          maxQueueWaitMs: 10_000
        }
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
