import type { IntelligenceAuditLog, IntelligenceUsageInfo } from '@talex-touch/tuff-intelligence'
import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import crypto from 'node:crypto'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'
import { createLogger } from '../../utils/logger'
import { enterPerfContext } from '../../utils/perf-context'
import { databaseModule } from '../database'

/**
 * Extended audit log with additional tracking fields
 */
export interface IntelligenceAuditLogEntry extends IntelligenceAuditLog {
  userId?: string
  estimatedCost?: number
  metadata?: Record<string, unknown>
}

/**
 * Usage summary for a specific period
 */
export interface IntelligenceUsageSummary {
  period: string
  periodType: 'minute' | 'day' | 'month'
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: number
  avgLatency: number
}

export interface IntelligenceUsageStatsBucket {
  callerId: string
  callerType: 'plugin' | 'system'
  period: string
  periodType: 'day' | 'month'
  summary: IntelligenceUsageSummary
}

export function aggregateUsageStatsByCallerAndPeriod(
  logs: IntelligenceAuditLogEntry[]
): IntelligenceUsageStatsBucket[] {
  const buckets = new Map<string, IntelligenceUsageStatsBucket>()

  const add = (
    callerId: string,
    periodType: IntelligenceUsageStatsBucket['periodType'],
    periodValue: string,
    log: IntelligenceAuditLogEntry
  ): void => {
    const key = JSON.stringify([callerId, periodType, periodValue])
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        callerId,
        callerType: callerId === 'system' ? 'system' : 'plugin',
        period: `${periodType}:${periodValue}`,
        periodType,
        summary: {
          period: periodValue,
          periodType,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalCost: 0,
          avgLatency: 0
        }
      }
      buckets.set(key, bucket)
    }

    const stat = bucket.summary
    stat.requestCount += 1
    if (log.success) {
      stat.successCount += 1
    } else {
      stat.failureCount += 1
    }
    stat.totalTokens += log.usage.totalTokens
    stat.promptTokens += log.usage.promptTokens
    stat.completionTokens += log.usage.completionTokens
    stat.totalCost += log.estimatedCost || 0
    stat.avgLatency = (stat.avgLatency * (stat.requestCount - 1) + log.latency) / stat.requestCount
  }

  for (const log of logs) {
    const callerId = log.caller || 'system'
    const isoTimestamp = new Date(log.timestamp).toISOString()
    add(callerId, 'day', isoTimestamp.slice(0, 10), log)
    add(callerId, 'month', isoTimestamp.slice(0, 7), log)
  }

  return Array.from(buckets.values())
}

/**
 * Query options for audit logs
 */
export interface AuditLogQueryOptions {
  caller?: string
  capabilityId?: string
  provider?: string
  startTime?: number
  endTime?: number
  success?: boolean
  limit?: number
  offset?: number
}

/**
 * Cost configuration per model
 */
interface ModelCostConfig {
  promptCostPer1k: number
  completionCostPer1k: number
}

const MODEL_COSTS: Record<string, ModelCostConfig> = {
  // OpenAI
  'gpt-4o': { promptCostPer1k: 0.005, completionCostPer1k: 0.015 },
  'gpt-4o-mini': { promptCostPer1k: 0.00015, completionCostPer1k: 0.0006 },
  'gpt-4-turbo': { promptCostPer1k: 0.01, completionCostPer1k: 0.03 },
  'gpt-3.5-turbo': { promptCostPer1k: 0.0005, completionCostPer1k: 0.0015 },
  'text-embedding-3-small': { promptCostPer1k: 0.00002, completionCostPer1k: 0 },
  'text-embedding-3-large': { promptCostPer1k: 0.00013, completionCostPer1k: 0 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-opus-20240229': { promptCostPer1k: 0.015, completionCostPer1k: 0.075 },
  'claude-3-haiku-20240307': { promptCostPer1k: 0.00025, completionCostPer1k: 0.00125 },
  // DeepSeek
  'deepseek-chat': { promptCostPer1k: 0.00014, completionCostPer1k: 0.00028 },
  'deepseek-coder': { promptCostPer1k: 0.00014, completionCostPer1k: 0.00028 },
  // Default for unknown models
  default: { promptCostPer1k: 0.001, completionCostPer1k: 0.002 }
}

const auditLog = createLogger('AuditLogger')
const AUDIT_IDENTIFIER_PATTERN = /^[\w.:/-]{1,128}$/
const AUDIT_ERROR_CODE_PATTERN = /^(?:INTELLIGENCE|NEXUS|OCR|PROVIDER)_[A-Z\d_]{1,55}$/
const AUDIT_METADATA_IDENTIFIER_PATTERN = /^[\w.:-]{1,128}$/
const AUDIT_METADATA_KEYS = new Set([
  'promptId',
  'operation',
  'source',
  'retryCount',
  'batchSize',
  'cacheHit',
  'fallbackUsed'
])

function boundedAuditIdentifier(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !AUDIT_IDENTIFIER_PATTERN.test(value)) return fallback
  if (
    value.startsWith('/') ||
    /^[A-Za-z]:\//.test(value) ||
    /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(value) ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return fallback
  }
  return value
}

function boundedAuditNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function sanitizeAuditMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const output: Record<string, unknown> = {}
  try {
    for (const key of AUDIT_METADATA_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) continue
      const item = descriptor.value
      if (typeof item === 'boolean') {
        output[key] = item
      } else if (typeof item === 'number' && Number.isFinite(item)) {
        output[key] = item
      } else if (typeof item === 'string' && AUDIT_METADATA_IDENTIFIER_PATTERN.test(item)) {
        output[key] = item
      }
    }
  } catch {
    return undefined
  }
  return Object.keys(output).length > 0 ? output : undefined
}

export function sanitizeIntelligenceAuditEntry(
  entry: IntelligenceAuditLogEntry
): IntelligenceAuditLogEntry {
  const success = entry.success === true
  const error =
    !success && typeof entry.error === 'string' && AUDIT_ERROR_CODE_PATTERN.test(entry.error)
      ? entry.error
      : !success
        ? 'INTELLIGENCE_INVOCATION_FAILED'
        : undefined
  return {
    traceId: boundedAuditIdentifier(entry.traceId, 'trace-redacted'),
    timestamp: boundedAuditNumber(entry.timestamp),
    capabilityId: boundedAuditIdentifier(entry.capabilityId, 'unknown'),
    provider: boundedAuditIdentifier(entry.provider, 'unknown'),
    model: boundedAuditIdentifier(entry.model, 'unknown'),
    promptHash:
      typeof entry.promptHash === 'string' && /^[a-f0-9]{16,64}$/i.test(entry.promptHash)
        ? entry.promptHash
        : undefined,
    caller: entry.caller ? boundedAuditIdentifier(entry.caller, 'unknown') : undefined,
    userId: entry.userId ? boundedAuditIdentifier(entry.userId, 'unknown') : undefined,
    usage: {
      promptTokens: boundedAuditNumber(entry.usage?.promptTokens),
      completionTokens: boundedAuditNumber(entry.usage?.completionTokens),
      totalTokens: boundedAuditNumber(entry.usage?.totalTokens)
    },
    latency: boundedAuditNumber(entry.latency),
    success,
    error,
    estimatedCost: boundedAuditNumber(entry.estimatedCost),
    metadata: sanitizeAuditMetadata(entry.metadata)
  }
}

/**
 * IntelligenceAuditLogger - Manages audit logging and usage statistics
 */
export class IntelligenceAuditLogger {
  private memoryLogs: IntelligenceAuditLogEntry[] = []
  private readonly maxMemoryLogs = 1000
  private readonly pollingService = PollingService.getInstance()
  private readonly flushTaskId = 'intelligence-audit.flush'
  private pendingLogs: IntelligenceAuditLogEntry[] = []
  private readonly flushBatchSize = 20
  private readonly flushIntervalMs = 30_000
  private readonly flushDelayMs = 200
  private flushPromise: Promise<void> | null = null
  private flushTimer: NodeJS.Timeout | null = null
  private readonly flushErrorThrottleMs = 60_000
  private lastFlushErrorLogAt = 0
  private suppressedFlushErrorCount = 0
  private readonly usageStatsErrorThrottleMs = 60_000
  private lastUsageStatsErrorLogAt = 0
  private suppressedUsageStatsErrorCount = 0
  private retentionFloorMs = Number.NEGATIVE_INFINITY

  constructor() {
    this.startFlushInterval()
  }

  private getDb(): LibSQLDatabase<typeof schema> {
    return databaseModule.getDb()
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }

  /**
   * Generate a unique trace ID
   */
  generateTraceId(): string {
    return `trace-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
  }

  /**
   * Generate a hash for prompt content
   */
  generatePromptHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
  }

  /**
   * Estimate cost based on model and token usage
   */
  estimateCost(model: string, usage: IntelligenceUsageInfo): number {
    const costConfig = MODEL_COSTS[model] || MODEL_COSTS.default
    const promptCost = (usage.promptTokens / 1000) * costConfig.promptCostPer1k
    const completionCost = (usage.completionTokens / 1000) * costConfig.completionCostPer1k
    return Number((promptCost + completionCost).toFixed(6))
  }

  /**
   * Log an audit entry
   */
  async log(entry: IntelligenceAuditLogEntry): Promise<void> {
    const estimatedCost = entry.estimatedCost ?? this.estimateCost(entry.model, entry.usage)
    const sanitized = sanitizeIntelligenceAuditEntry({ ...entry, estimatedCost })
    if (sanitized.traceId === 'trace-redacted') {
      sanitized.traceId = this.generateTraceId()
    }

    if (sanitized.timestamp < this.retentionFloorMs) return

    // Add to memory cache
    this.memoryLogs.push(sanitized)
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift()
    }

    // Add to buffered batch for persistence
    this.pendingLogs.push(sanitized)

    // Flush if batch is full
    if (this.pendingLogs.length >= this.flushBatchSize) {
      this.scheduleFlush()
    }
  }

  private scheduleFlush(delayMs: number = this.flushDelayMs): void {
    if (this.flushTimer) {
      return
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flushToDB()
    }, delayMs)
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  private logFlushError(_error: unknown, batchSize: number): void {
    const now = Date.now()
    if (now - this.lastFlushErrorLogAt < this.flushErrorThrottleMs) {
      this.suppressedFlushErrorCount += 1
      return
    }

    auditLog.warn('Failed to flush logs', {
      meta: {
        batchSize,
        code: 'INTELLIGENCE_AUDIT_FLUSH_FAILED',
        suppressed: this.suppressedFlushErrorCount > 0 ? this.suppressedFlushErrorCount : undefined
      }
    })

    this.lastFlushErrorLogAt = now
    this.suppressedFlushErrorCount = 0
  }

  private logUsageStatsError(_key: string, _error: unknown): void {
    const now = Date.now()
    if (now - this.lastUsageStatsErrorLogAt < this.usageStatsErrorThrottleMs) {
      this.suppressedUsageStatsErrorCount += 1
      return
    }

    auditLog.warn('Failed to update usage stats', {
      meta: {
        code: 'INTELLIGENCE_USAGE_STATS_UPDATE_FAILED',
        suppressed:
          this.suppressedUsageStatsErrorCount > 0 ? this.suppressedUsageStatsErrorCount : undefined
      }
    })

    this.lastUsageStatsErrorLogAt = now
    this.suppressedUsageStatsErrorCount = 0
  }

  /**
   * Flush buffered logs to database
   */
  async flushToDB(): Promise<void> {
    if (this.pendingLogs.length === 0) return
    if (this.flushPromise) return this.flushPromise

    this.flushPromise = (async () => {
      while (this.pendingLogs.length > 0) {
        const logsToFlush = this.pendingLogs.splice(0, this.flushBatchSize)
        if (logsToFlush.length === 0) {
          break
        }
        const success = await this.flushBatch(logsToFlush)
        if (!success) {
          break
        }
        if (this.pendingLogs.length > 0) {
          await this.yieldToEventLoop()
        }
      }
    })()

    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
      if (this.pendingLogs.length > 0) {
        this.scheduleFlush()
      }
    }
  }

  private requeueAfterRetention(logs: IntelligenceAuditLogEntry[]): void {
    const retained = logs.filter((entry) => entry.timestamp >= this.retentionFloorMs)
    if (retained.length > 0) this.pendingLogs.unshift(...retained)
  }

  private async flushBatch(logsToFlush: IntelligenceAuditLogEntry[]): Promise<boolean> {
    let metadataBytes = 0
    const disposeSerialize = enterPerfContext('IntelligenceAudit.serialize', {
      count: logsToFlush.length
    })
    let rows: Array<typeof intelligenceAuditLogs.$inferInsert> = []
    try {
      rows = logsToFlush.map((log) => {
        const metadata = log.metadata ? JSON.stringify(log.metadata) : null
        if (metadata) {
          metadataBytes += metadata.length
        }
        return {
          traceId: log.traceId,
          timestamp: log.timestamp,
          capabilityId: log.capabilityId,
          provider: log.provider,
          model: log.model,
          promptHash: log.promptHash,
          caller: log.caller,
          userId: log.userId,
          promptTokens: log.usage.promptTokens,
          completionTokens: log.usage.completionTokens,
          totalTokens: log.usage.totalTokens,
          estimatedCost: log.estimatedCost,
          latency: log.latency,
          success: log.success,
          error: log.error,
          metadata
        }
      })
    } catch {
      auditLog.warn('Failed to serialize logs', {
        meta: {
          count: logsToFlush.length,
          code: 'INTELLIGENCE_AUDIT_SERIALIZE_FAILED'
        }
      })
      this.requeueAfterRetention(logsToFlush)
      return false
    } finally {
      disposeSerialize()
    }

    const disposeFlush = enterPerfContext('IntelligenceAudit.flush', {
      count: logsToFlush.length,
      metadataBytes
    })
    try {
      const db = this.getDb()

      await this.withDbWrite('intelligence.audit.flush', async () => {
        await db.transaction(async (tx) => {
          await tx.insert(intelligenceAuditLogs).values(rows)

          await this.updateUsageStats(tx, logsToFlush)
        })
      })
      return true
    } catch (error) {
      this.logFlushError(error, logsToFlush.length)
      this.requeueAfterRetention(logsToFlush)
      return false
    } finally {
      disposeFlush()
    }
  }

  /**
   * Update usage statistics based on audit logs
   */
  private async updateUsageStats(
    db: Pick<LibSQLDatabase<typeof schema>, 'select' | 'insert' | 'update'>,
    logs: IntelligenceAuditLogEntry[]
  ): Promise<void> {
    const buckets = aggregateUsageStatsByCallerAndPeriod(logs)
    const now = new Date()

    for (const bucket of buckets) {
      const { callerId, callerType, period, periodType, summary: stat } = bucket

      try {
        const totalRequestCount = sql`${intelligenceUsageStats.requestCount} + ${stat.requestCount}`
        const totalLatency = sql`${intelligenceUsageStats.avgLatency} * ${intelligenceUsageStats.requestCount} + ${stat.avgLatency} * ${stat.requestCount}`
        const avgLatency = sql`CASE WHEN ${totalRequestCount} > 0 THEN (${totalLatency}) / ${totalRequestCount} ELSE ${stat.avgLatency} END`

        await db
          .insert(intelligenceUsageStats)
          .values({
            callerId,
            callerType,
            period,
            periodType,
            requestCount: stat.requestCount,
            successCount: stat.successCount,
            failureCount: stat.failureCount,
            totalTokens: stat.totalTokens,
            promptTokens: stat.promptTokens,
            completionTokens: stat.completionTokens,
            totalCost: stat.totalCost,
            avgLatency: stat.avgLatency,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: [
              intelligenceUsageStats.callerId,
              intelligenceUsageStats.callerType,
              intelligenceUsageStats.period
            ],
            set: {
              requestCount: totalRequestCount,
              successCount: sql`${intelligenceUsageStats.successCount} + ${stat.successCount}`,
              failureCount: sql`${intelligenceUsageStats.failureCount} + ${stat.failureCount}`,
              totalTokens: sql`${intelligenceUsageStats.totalTokens} + ${stat.totalTokens}`,
              promptTokens: sql`${intelligenceUsageStats.promptTokens} + ${stat.promptTokens}`,
              completionTokens: sql`${intelligenceUsageStats.completionTokens} + ${stat.completionTokens}`,
              totalCost: sql`${intelligenceUsageStats.totalCost} + ${stat.totalCost}`,
              avgLatency,
              updatedAt: now
            }
          })
      } catch (error) {
        this.logUsageStatsError(`${callerId}:${period}`, error)
      }
    }
  }

  /**
   * Query audit logs from database
   */
  async queryLogs(options: AuditLogQueryOptions = {}): Promise<IntelligenceAuditLogEntry[]> {
    const db = this.getDb()
    const conditions: SQL<unknown>[] = []

    if (options.caller) {
      conditions.push(eq(intelligenceAuditLogs.caller, options.caller))
    }
    if (options.capabilityId) {
      conditions.push(eq(intelligenceAuditLogs.capabilityId, options.capabilityId))
    }
    if (options.provider) {
      conditions.push(eq(intelligenceAuditLogs.provider, options.provider))
    }
    if (options.startTime) {
      conditions.push(gte(intelligenceAuditLogs.timestamp, options.startTime))
    }
    if (options.endTime) {
      conditions.push(lte(intelligenceAuditLogs.timestamp, options.endTime))
    }
    if (options.success !== undefined) {
      conditions.push(eq(intelligenceAuditLogs.success, options.success))
    }

    const query = db
      .select()
      .from(intelligenceAuditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(intelligenceAuditLogs.timestamp))
      .limit(options.limit || 100)
      .offset(options.offset || 0)

    const rows = await query

    return rows.map((row) => ({
      traceId: row.traceId,
      timestamp: row.timestamp,
      capabilityId: row.capabilityId,
      provider: row.provider,
      model: row.model,
      promptHash: row.promptHash || undefined,
      caller: row.caller || undefined,
      userId: row.userId || undefined,
      usage: {
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens
      },
      latency: row.latency,
      success: row.success,
      error: row.error || undefined,
      estimatedCost: row.estimatedCost || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * Get usage statistics for a caller
   */
  async getUsageStats(
    callerId: string,
    periodType: 'day' | 'month',
    startPeriod?: string,
    endPeriod?: string
  ): Promise<IntelligenceUsageSummary[]> {
    const db = this.getDb()
    const conditions = [
      eq(intelligenceUsageStats.callerId, callerId),
      eq(intelligenceUsageStats.periodType, periodType)
    ]

    if (startPeriod) {
      conditions.push(gte(intelligenceUsageStats.period, `${periodType}:${startPeriod}`))
    }
    if (endPeriod) {
      conditions.push(lte(intelligenceUsageStats.period, `${periodType}:${endPeriod}`))
    }

    const rows = await db
      .select()
      .from(intelligenceUsageStats)
      .where(and(...conditions))
      .orderBy(desc(intelligenceUsageStats.period))

    return rows.map((row) => ({
      period: row.period.split(':').slice(1).join(':'),
      periodType: row.periodType as 'minute' | 'day' | 'month',
      requestCount: row.requestCount,
      successCount: row.successCount,
      failureCount: row.failureCount,
      totalTokens: row.totalTokens,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalCost: row.totalCost,
      avgLatency: row.avgLatency
    }))
  }

  /**
   * Get recent logs from memory cache
   */
  getRecentLogs(limit: number = 100): IntelligenceAuditLogEntry[] {
    return this.memoryLogs.slice(-limit)
  }

  /**
   * Get aggregated stats for today
   */
  async getTodayStats(callerId?: string): Promise<IntelligenceUsageSummary | null> {
    const today = new Date().toISOString().split('T')[0]
    const stats = await this.getUsageStats(callerId || 'system', 'day', today, today)
    return stats[0] || null
  }

  /**
   * Get aggregated stats for this month
   */
  async getMonthStats(callerId?: string): Promise<IntelligenceUsageSummary | null> {
    const month = new Date().toISOString().substring(0, 7)
    const stats = await this.getUsageStats(callerId || 'system', 'month', month, month)
    return stats[0] || null
  }

  async cleanupRetentionPage(
    cutoffMs: number,
    batchSize: number,
    signal: AbortSignal,
    cursor?: { readonly timestampMs: number; readonly id: number },
    admissionFloorMs = cutoffMs
  ): Promise<{
    deletedCount: number
    hasMore: boolean
    cancelled: boolean
    cursor?: { readonly timestampMs: number; readonly id: number }
  }> {
    if (
      !Number.isSafeInteger(cutoffMs) ||
      !Number.isSafeInteger(admissionFloorMs) ||
      !Number.isFinite(batchSize)
    ) {
      throw new Error('INTELLIGENCE_AUDIT_RETENTION_INVALID')
    }
    this.retentionFloorMs = Math.max(this.retentionFloorMs, admissionFloorMs)
    this.pendingLogs = this.pendingLogs.filter((entry) => entry.timestamp >= cutoffMs)
    this.memoryLogs = this.memoryLogs.filter((entry) => entry.timestamp >= cutoffMs)
    await this.flushToDB()
    if (signal.aborted) return { deletedCount: 0, hasMore: false, cancelled: true }

    const limit = Math.min(200, Math.max(1, Math.floor(batchSize)))
    const db = this.getDb()
    const cursorCondition = cursor
      ? or(
          gt(intelligenceAuditLogs.timestamp, cursor.timestampMs),
          and(
            eq(intelligenceAuditLogs.timestamp, cursor.timestampMs),
            gt(intelligenceAuditLogs.id, cursor.id)
          )
        )
      : undefined
    const candidates = await db
      .select({ id: intelligenceAuditLogs.id, timestamp: intelligenceAuditLogs.timestamp })
      .from(intelligenceAuditLogs)
      .where(and(lt(intelligenceAuditLogs.timestamp, cutoffMs), cursorCondition))
      .orderBy(asc(intelligenceAuditLogs.timestamp), asc(intelligenceAuditLogs.id))
      .limit(limit + 1)
    const page = candidates.slice(0, limit)
    const ids = page.map((row) => row.id)
    if (ids.length === 0) {
      return { deletedCount: 0, hasMore: false, cancelled: false, cursor }
    }
    if (signal.aborted) return { deletedCount: 0, hasMore: false, cancelled: true, cursor }

    const result = await dbWriteScheduler.schedule(
      'intelligence.audit.retention',
      () =>
        withSqliteRetry(
          () =>
            db
              .delete(intelligenceAuditLogs)
              .where(
                and(
                  inArray(intelligenceAuditLogs.id, ids),
                  lt(intelligenceAuditLogs.timestamp, cutoffMs)
                )
              ),
          { label: 'intelligence.audit.retention' }
        ),
      {
        priority: 'background',
        dropPolicy: 'none',
        maxQueueWaitMs: 15_000
      }
    )
    const last = page.at(-1)
    return {
      deletedCount: Number(result.rowsAffected ?? 0),
      hasMore: candidates.length > limit,
      cancelled: false,
      cursor: last ? { timestampMs: last.timestamp, id: last.id } : cursor
    }
  }

  /**
   * Clear old audit logs (retention policy)
   */
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const signal = new AbortController().signal
    let deletedCount = 0
    let cursor: { readonly timestampMs: number; readonly id: number } | undefined
    let hasMore = true
    while (hasMore) {
      const page = await this.cleanupRetentionPage(cutoffMs, 100, signal, cursor)
      cursor = page.cursor ?? cursor
      deletedCount += page.deletedCount
      hasMore = page.hasMore
    }
    return deletedCount
  }

  /**
   * Start automatic flush interval
   */
  private startFlushInterval(): void {
    if (this.pollingService.isRegistered(this.flushTaskId)) {
      this.pollingService.unregister(this.flushTaskId)
    }
    this.pollingService.register(this.flushTaskId, () => this.scheduleFlush(0), {
      interval: this.flushIntervalMs,
      unit: 'milliseconds'
    })
    this.pollingService.start()
  }

  /**
   * Stop and cleanup
   */
  async destroy(): Promise<void> {
    this.pollingService.unregister(this.flushTaskId)
    await this.flushToDB()
  }
}

export const intelligenceAuditLogger = new IntelligenceAuditLogger()
