import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
} from '@talex-touch/utils/analytics'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm'
import { sleep } from '@talex-touch/utils'
import * as schema from '../../../db/schema'
import { enterPerfContext } from '../../../utils/perf-context'
import { createLogger } from '../../../utils/logger'

const PERSIST_WINDOWS: AnalyticsWindowType[] = ['15m', '1h', '24h']
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 150

const log = createLogger('AnalyticsStore')

function isSqliteBusyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }
  if (code === 'SQLITE_BUSY' || rawCode === 5) return true
  return typeof message === 'string' && message.includes('SQLITE_BUSY')
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (isSqliteBusyError(error) && attempt < retries) {
        log.warn(`SQLITE_BUSY, retrying attempt ${attempt + 1}/${retries}`)
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      throw error
    }
  }
  throw lastError
}

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
      await withRetry(() =>
        this.db.insert(schema.analyticsSnapshots).values(
          persistable.map(snapshot => ({
            windowType: snapshot.windowType,
            timestamp: snapshot.timestamp,
            metrics: JSON.stringify(snapshot.metrics),
            createdAt,
          })),
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
    await this.db.insert(schema.pluginAnalytics).values({
      pluginName: payload.pluginName,
      pluginVersion: payload.pluginVersion ?? null,
      featureId: payload.featureId,
      eventType: payload.eventType,
      count: payload.count ?? 1,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      timestamp: payload.timestamp,
    })
  }
}
