import type { IntelligenceAuditLog, IntelligenceUsageInfo } from '@talex-touch/utils'
import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import crypto from 'node:crypto'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'
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

/**
 * IntelligenceAuditLogger - Manages audit logging and usage statistics
 */
export class IntelligenceAuditLogger {
  private memoryLogs: IntelligenceAuditLogEntry[] = []
  private readonly maxMemoryLogs = 1000
  private readonly pollingService = PollingService.getInstance()
  private readonly flushTaskId = 'intelligence-audit.flush'
  private pendingLogs: IntelligenceAuditLogEntry[] = []
  private readonly flushBatchSize = 50
  private readonly flushIntervalMs = 5000

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
    // Calculate cost if not provided
    if (entry.estimatedCost === undefined) {
      entry.estimatedCost = this.estimateCost(entry.model, entry.usage)
    }

    // Add to memory cache
    this.memoryLogs.push(entry)
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift()
    }

    // Add to pending batch for persistence
    this.pendingLogs.push(entry)

    // Flush if batch is full
    if (this.pendingLogs.length >= this.flushBatchSize) {
      await this.flushToDB()
    }
  }

  /**
   * Flush pending logs to database
   */
  async flushToDB(): Promise<void> {
    if (this.pendingLogs.length === 0) return

    const logsToFlush = [...this.pendingLogs]
    this.pendingLogs = []

    try {
      const db = this.getDb()

      await this.withDbWrite('intelligence.audit.flush', async () => {
        await db.transaction(async (tx) => {
          await tx.insert(intelligenceAuditLogs).values(
            logsToFlush.map((log) => ({
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
              metadata: log.metadata ? JSON.stringify(log.metadata) : null
            }))
          )

          await this.updateUsageStats(tx, logsToFlush)
        })
      })
    } catch (error) {
      console.error('[AuditLogger] Failed to flush logs:', error)
      // Re-add failed logs to pending
      this.pendingLogs.push(...logsToFlush)
    }
  }

  /**
   * Update usage statistics based on audit logs
   */
  private async updateUsageStats(
    db: Pick<LibSQLDatabase<typeof schema>, 'select' | 'insert' | 'update'>,
    logs: IntelligenceAuditLogEntry[]
  ): Promise<void> {
    // Group logs by caller and period
    const stats = new Map<string, IntelligenceUsageSummary>()

    for (const log of logs) {
      const caller = log.caller || 'system'
      const date = new Date(log.timestamp)

      // Update daily stats
      const dayKey = `${caller}:day:${date.toISOString().split('T')[0]}`
      this.aggregateStats(stats, dayKey, log, 'day')

      // Update monthly stats
      const monthKey = `${caller}:month:${date.toISOString().substring(0, 7)}`
      this.aggregateStats(stats, monthKey, log, 'month')
    }

    // Upsert stats to database
    for (const [key, stat] of stats) {
      const [caller, periodType, period] = key.split(':')
      if (periodType !== 'day' && periodType !== 'month') {
        continue
      }
      const fullPeriod = `${periodType}:${period}`

      try {
        // Check if record exists
        const callerTypeValue = caller === 'system' ? 'system' : 'plugin'
        const existing = await db
          .select()
          .from(intelligenceUsageStats)
          .where(
            and(
              eq(intelligenceUsageStats.callerId, caller),
              eq(intelligenceUsageStats.callerType, callerTypeValue),
              eq(intelligenceUsageStats.period, fullPeriod)
            )
          )
          .limit(1)

        if (existing.length > 0) {
          // Update existing record
          const old = existing[0]
          const newRequestCount = old.requestCount + stat.requestCount
          const newAvgLatency =
            newRequestCount > 0
              ? (old.avgLatency * old.requestCount + stat.avgLatency * stat.requestCount) /
                newRequestCount
              : 0

          await db
            .update(intelligenceUsageStats)
            .set({
              requestCount: newRequestCount,
              successCount: old.successCount + stat.successCount,
              failureCount: old.failureCount + stat.failureCount,
              totalTokens: old.totalTokens + stat.totalTokens,
              promptTokens: old.promptTokens + stat.promptTokens,
              completionTokens: old.completionTokens + stat.completionTokens,
              totalCost: old.totalCost + stat.totalCost,
              avgLatency: newAvgLatency,
              updatedAt: new Date()
            })
            .where(
              and(
                eq(intelligenceUsageStats.callerId, caller),
                eq(intelligenceUsageStats.callerType, callerTypeValue),
                eq(intelligenceUsageStats.period, fullPeriod)
              )
            )
        } else {
          // Insert new record
          await db.insert(intelligenceUsageStats).values({
            callerId: caller,
            callerType: callerTypeValue,
            period: fullPeriod,
            periodType,
            requestCount: stat.requestCount,
            successCount: stat.successCount,
            failureCount: stat.failureCount,
            totalTokens: stat.totalTokens,
            promptTokens: stat.promptTokens,
            completionTokens: stat.completionTokens,
            totalCost: stat.totalCost,
            avgLatency: stat.avgLatency,
            updatedAt: new Date()
          })
        }
      } catch (error) {
        console.error(`[AuditLogger] Failed to update usage stats for ${key}:`, error)
      }
    }
  }

  private aggregateStats(
    stats: Map<string, IntelligenceUsageSummary>,
    key: string,
    log: IntelligenceAuditLogEntry,
    periodType: 'minute' | 'day' | 'month'
  ): void {
    let stat = stats.get(key)
    if (!stat) {
      stat = {
        period: key.split(':').slice(2).join(':'),
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
      stats.set(key, stat)
    }

    stat.requestCount++
    if (log.success) {
      stat.successCount++
    } else {
      stat.failureCount++
    }
    stat.totalTokens += log.usage.totalTokens
    stat.promptTokens += log.usage.promptTokens
    stat.completionTokens += log.usage.completionTokens
    stat.totalCost += log.estimatedCost || 0
    stat.avgLatency = (stat.avgLatency * (stat.requestCount - 1) + log.latency) / stat.requestCount
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

  /**
   * Clear old audit logs (retention policy)
   */
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const db = this.getDb()
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    const result = await db
      .delete(intelligenceAuditLogs)
      .where(lte(intelligenceAuditLogs.timestamp, cutoffTime))

    return result.rowsAffected || 0
  }

  /**
   * Start automatic flush interval
   */
  private startFlushInterval(): void {
    if (this.pollingService.isRegistered(this.flushTaskId)) {
      this.pollingService.unregister(this.flushTaskId)
    }
    this.pollingService.register(
      this.flushTaskId,
      () => this.flushToDB().catch((err) => console.error('[AuditLogger] Flush error:', err)),
      { interval: this.flushIntervalMs, unit: 'milliseconds' }
    )
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
