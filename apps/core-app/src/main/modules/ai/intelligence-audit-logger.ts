import type { IntelligenceAuditLog } from '@talex-touch/tuff-intelligence'
import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { estimateCostUsd } from './pricing/model-pricing'
import type { loadPricingCatalog } from './pricing/models-dev-catalog'
import type { GlobalBackfillOutcome } from './usage-ledger/global-backfill'
import type { UsageDelta } from './usage-ledger/global-deltas'
import crypto from 'node:crypto'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../db/runtime-flags'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { enterPerfContext } from '../../utils/perf-context'
import { databaseModule } from '../database'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import { GLOBAL_USAGE_CALLER_ID, GLOBAL_USAGE_CALLER_TYPE } from './usage-ledger/constants'
import { ensureGlobalBackfillMarker, runGlobalUsageBackfill } from './usage-ledger/global-backfill'
import {
  addUsageDelta,
  emptyUsageDelta,
  entryUsageDelta,
  GlobalUsageDeltas
} from './usage-ledger/global-deltas'
import { readGlobalUsage } from './usage-ledger/global-usage'
import { addToUsageBucket } from './usage-ledger/usage-bucket'

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

export interface AuditLogWriteOptions {
  /**
   * Whether to keep the detail row (`intelligence_audit_logs`). Counting does not depend on it:
   * every logged call updates the per-caller and global usage buckets (R-A1). Defaults to true.
   */
  detail?: boolean
}

interface AuditPricing {
  loadPricingCatalog: typeof loadPricingCatalog
  estimateCostUsd: typeof estimateCostUsd
}

let auditPricing: Promise<AuditPricing> | null = null

/**
 * Pricing is imported dynamically on purpose: it reads live channel configs through
 * `intelligence-sdk`, and the SDK imports this logger statically, so a static import here would
 * close the cycle logger → pricing → sdk → logger.
 */
function loadAuditPricing(): Promise<AuditPricing> {
  if (auditPricing) return auditPricing
  const pending = Promise.all([
    import('./pricing/models-dev-catalog'),
    import('./pricing/model-pricing')
  ]).then(([catalog, pricing]) => ({
    loadPricingCatalog: catalog.loadPricingCatalog,
    estimateCostUsd: pricing.estimateCostUsd
  }))
  auditPricing = pending
  pending.catch(() => {
    if (auditPricing === pending) auditPricing = null
  })
  return pending
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
  'fallbackUsed',
  // The reasoning effort a chat turn asked for, the level the answering route actually ran at, and
  // how it resolved (`reasoning-effort-runtime.ts`). All three are bare level/status words.
  'reasoningEffort',
  'reasoningApplied',
  'reasoningStatus'
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

/** Undefined when absent, so the flush can tell "not priced yet" from a real 0. */
function optionalAuditCost(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined
}

export function sanitizeIntelligenceAuditMetadata(
  value: unknown
): Record<string, unknown> | undefined {
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
  const reportedCost = optionalAuditCost(entry.usage?.cost)
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
      totalTokens: boundedAuditNumber(entry.usage?.totalTokens),
      // A provider-reported cost (Pi CLI, local runtimes) outranks catalog prices at flush time.
      ...(reportedCost === undefined ? {} : { cost: reportedCost })
    },
    latency: boundedAuditNumber(entry.latency),
    success,
    error,
    // Explicit costs only; everything else is priced when the batch is flushed.
    estimatedCost: optionalAuditCost(entry.estimatedCost),
    metadata: sanitizeIntelligenceAuditMetadata(entry.metadata)
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
  /**
   * Cap on the unflushed buffer. memoryLogs is trimmed at 1000; pendingLogs was not, so a
   * database that keeps rejecting writes grew it without bound while the retry loop above ran
   * every 200ms over an ever-longer array (#779).
   */
  private readonly maxPendingLogs = 5000
  private droppedPendingCount = 0
  /** Consecutive failed flushes, used to back the retry off instead of hammering at 200ms. */
  private consecutiveFlushFailures = 0
  private readonly maxFlushRetryDelayMs = 30_000
  private suppressedFlushErrorCount = 0
  private readonly usageStatsErrorThrottleMs = 60_000
  private lastUsageStatsErrorLogAt = 0
  private suppressedUsageStatsErrorCount = 0
  private lastPricingErrorLogAt = Number.NEGATIVE_INFINITY
  private retentionFloorMs = Number.NEGATIVE_INFINITY
  /**
   * Entries that update the usage buckets but never become a detail row: logged with
   * `detail: false` (audit off), or below the privacy retention floor. The floor only stops detail
   * rows; deleting audit data never removed counters (`privacy-data-lifecycle.md`).
   */
  private readonly countOnlyEntries = new WeakSet<IntelligenceAuditLogEntry>()
  /** Global usage logged but not yet committed; see `usage-ledger/global-deltas.ts`. */
  private readonly globalDeltas = new GlobalUsageDeltas()
  /** Process start: `cutoffMs` of the global backfill marker if this process creates it. */
  private readonly processStartMs = Date.now()
  /** The backfill marker is known to exist, so flushes stop checking for it. */
  private globalBackfillMarkerReady = false
  private readonly backfillTaskId = 'intelligence-usage.global-backfill'
  private readonly backfillMinDelayMs = 60_000
  private readonly backfillRetryIntervalMs = 60 * 60 * 1000
  private backfillRun: Promise<GlobalBackfillOutcome | null> | null = null
  private backfillSettled = false
  private lastBackfillErrorLogAt = Number.NEGATIVE_INFINITY

  constructor() {
    this.startFlushInterval()
    this.startGlobalBackfillSchedule()
  }

  private getDb(): LibSQLDatabase<typeof schema> {
    return databaseModule.getDb()
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
   * Log an audit entry.
   *
   * Every entry is counted (per-caller UTC buckets and the global local bucket, outer agent and
   * workflow rows excepted from the latter). `detail: false` entries — audit turned off — stay out
   * of `memoryLogs` and are never written to `intelligence_audit_logs`.
   */
  async log(entry: IntelligenceAuditLogEntry, options: AuditLogWriteOptions = {}): Promise<void> {
    // No pricing here: entries without an explicit cost are priced when their batch is flushed
    // (`prepareBatchCosts`), off this synchronous path.
    const sanitized = sanitizeIntelligenceAuditEntry(entry)
    if (sanitized.traceId === 'trace-redacted') {
      sanitized.traceId = this.generateTraceId()
    }

    const detail = options.detail !== false && sanitized.timestamp >= this.retentionFloorMs
    if (detail) {
      // Add to memory cache
      this.memoryLogs.push(sanitized)
      if (this.memoryLogs.length > this.maxMemoryLogs) {
        this.memoryLogs.shift()
      }
    } else {
      this.countOnlyEntries.add(sanitized)
    }

    // Counted toward today's totals from this moment, before any flush.
    this.globalDeltas.add(sanitized)

    // Add to buffered batch for persistence
    this.pendingLogs.push(sanitized)
    this.trimPendingLogs()

    // Flush if batch is full
    if (this.pendingLogs.length >= this.flushBatchSize) {
      this.scheduleFlush()
    }
  }

  /**
   * Global usage per period (`day:YYYY-MM-DD` / `month:YYYY-MM`, local time): committed rows plus
   * entries still waiting for a flush. Never waits for a flush. Every requested period is present.
   */
  async readGlobalUsage(periods: readonly string[]): Promise<Map<string, UsageDelta>> {
    return readGlobalUsage(this.getDb(), this.globalDeltas, periods)
  }

  private isDetailEntry(entry: IntelligenceAuditLogEntry): boolean {
    return !this.countOnlyEntries.has(entry) && entry.timestamp >= this.retentionFloorMs
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

  /**
   * Oldest-first, matching how memoryLogs is trimmed. Dropping audit records is bad, so the loss
   * is counted and surfaced rather than absorbed silently.
   */
  private trimPendingLogs(): void {
    if (this.pendingLogs.length <= this.maxPendingLogs) return
    const overflow = this.pendingLogs.length - this.maxPendingLogs
    const dropped = this.pendingLogs.splice(0, overflow)
    // Never written, so never settled: stop counting them as pending usage.
    this.globalDeltas.discard(dropped)
    this.droppedPendingCount += overflow
    auditLog.warn('Dropped audit logs that could not be flushed', {
      meta: {
        dropped: overflow,
        droppedTotal: this.droppedPendingCount,
        pending: this.pendingLogs.length,
        code: 'INTELLIGENCE_AUDIT_PENDING_OVERFLOW'
      }
    })
  }

  private nextFlushDelayMs(): number {
    if (this.consecutiveFlushFailures === 0) return this.flushDelayMs
    const backoff = this.flushDelayMs * 2 ** this.consecutiveFlushFailures
    return Math.min(backoff, this.maxFlushRetryDelayMs)
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
    // Re-check after every awaited owner. Multiple explicit flush callers can resume from the
    // same completed Promise while new logs are queued; an `if` here lets each waiter start a
    // competing drain and overwrite flushPromise.
    while (this.flushPromise) await this.flushPromise
    if (this.pendingLogs.length === 0) return

    this.flushPromise = (async () => {
      while (this.pendingLogs.length > 0) {
        const logsToFlush = this.pendingLogs.splice(0, this.flushBatchSize)
        if (logsToFlush.length === 0) {
          break
        }
        // Priced after the batch leaves the queue and before its write transaction. A batch that
        // is already priced takes no extra await.
        if (logsToFlush.some((log) => log.estimatedCost === undefined)) {
          await this.prepareBatchCosts(logsToFlush)
        }
        const success = await this.flushBatch(logsToFlush)
        if (!success) {
          this.consecutiveFlushFailures += 1
          break
        }
        // Reset on any successful batch: the next failure starts from the short delay again,
        // so a single transient error does not leave the logger backed off for 30s.
        this.consecutiveFlushFailures = 0
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
        // Back off while the database keeps refusing. Retrying a failing write every 200ms only
        // burns CPU and grows the buffer it is trying to drain.
        this.scheduleFlush(this.nextFlushDelayMs())
      }
    }
  }

  /**
   * Puts a failed batch back at the head of the queue. Entries that fell below the retention floor
   * in the meantime lose their detail row but keep counting.
   */
  private requeueAfterRetention(logs: IntelligenceAuditLogEntry[]): void {
    for (const entry of logs) {
      if (entry.timestamp < this.retentionFloorMs) this.countOnlyEntries.add(entry)
    }
    if (logs.length > 0) this.pendingLogs.unshift(...logs)
  }

  /**
   * Fills `estimatedCost` on entries logged without one: provider-reported cost first, then
   * models.dev prices (parent design §2.4). Reads the stored catalog at most once (never the
   * network) and runs outside the write transaction. Without a catalog, or if pricing cannot load,
   * the cost is 0 — never a made-up default price. Entries keep their cost if the write is
   * requeued, so a retry does not price them again.
   */
  private async prepareBatchCosts(logs: IntelligenceAuditLogEntry[]): Promise<void> {
    try {
      const pricing = await loadAuditPricing()
      await pricing.loadPricingCatalog()
      for (const log of logs) {
        if (log.estimatedCost !== undefined) continue
        log.estimatedCost = pricing.estimateCostUsd({
          providerId: log.provider,
          model: log.model,
          usage: log.usage
        })
      }
    } catch {
      const now = Date.now()
      if (now - this.lastPricingErrorLogAt >= this.flushErrorThrottleMs) {
        this.lastPricingErrorLogAt = now
        auditLog.warn('Could not price audit entries; recording reported cost or 0', {
          meta: { count: logs.length, code: 'INTELLIGENCE_AUDIT_PRICING_FAILED' }
        })
      }
      // A provider-reported cost needs no catalog, so it survives even this degraded path.
      for (const log of logs) log.estimatedCost ??= log.usage.cost ?? 0
    }
  }

  private async flushBatch(logsToFlush: IntelligenceAuditLogEntry[]): Promise<boolean> {
    let metadataBytes = 0
    const disposeSerialize = enterPerfContext('IntelligenceAudit.serialize', {
      count: logsToFlush.length
    })
    let rows: Array<typeof intelligenceAuditLogs.$inferInsert> = []
    try {
      rows = logsToFlush
        .filter((log) => this.isDetailEntry(log))
        .map((log) => {
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

      // One transaction: detail rows (audit on), per-caller UTC buckets and the global local
      // bucket commit or roll back together (#780). The backfill marker comes first, so its
      // `cutoffId` never covers a row that is also counted live.
      await scheduleDbWrite('intelligence.audit.flush', async () => {
        await db.transaction(async (tx) => {
          if (!this.globalBackfillMarkerReady) {
            await ensureGlobalBackfillMarker(tx, this.processStartMs)
          }
          if (rows.length > 0) {
            await tx.insert(intelligenceAuditLogs).values(rows)
          }

          await this.updateUsageStats(tx, logsToFlush)
          await this.updateGlobalUsage(tx, logsToFlush)
        })
        // Settled in the continuation that observes the commit, before any other read can resume:
        // `readGlobalUsage` sees either neither the new rows nor this settle, or both.
        this.globalDeltas.settle(logsToFlush)
        this.globalBackfillMarkerReady = true
      })
      const callers = new Map<string, 'plugin' | 'system'>()
      for (const log of logsToFlush) {
        const callerId = log.caller || 'system'
        callers.set(callerId, callerId === 'system' ? 'system' : 'plugin')
      }
      for (const [callerId, callerType] of callers) {
        intelligenceQuotaManager.invalidateUsageCache(callerId, callerType)
      }
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
        await addToUsageBucket(db, { callerId, callerType, period, periodType }, stat, now)
      } catch (error) {
        // Logged and then rethrown. These upserts share a transaction with the audit-log insert
        // precisely so the rows and the counters they aggregate cannot disagree; swallowing the
        // error let the transaction commit with the audit rows written and the counters not
        // advanced, and quota checks read those counters (#780).
        //
        // flushBatch already handles the throw: it logs, requeues the batch through
        // requeueAfterRetention and returns false, so nothing is lost and the retry backs off.
        this.logUsageStatsError(`${callerId}:${period}`, error)
        throw error
      }
    }
  }

  /**
   * Adds the batch to the global bucket (`__global__` / `system`, local day and month), skipping
   * outer agent/workflow rows. Periods are the ones fixed when each entry was logged, so the rows
   * move by exactly what `globalDeltas.settle()` removes after the commit. Same transaction and
   * the same rethrow contract as `updateUsageStats`.
   */
  private async updateGlobalUsage(
    db: Pick<LibSQLDatabase<typeof schema>, 'insert'>,
    logs: IntelligenceAuditLogEntry[]
  ): Promise<void> {
    const periods = new Map<string, UsageDelta>()
    for (const log of logs) {
      const contribution = this.globalDeltas.contributionOf(log)
      if (!contribution) continue
      const delta = entryUsageDelta(log)
      for (const period of [contribution.dayPeriod, contribution.monthPeriod]) {
        let total = periods.get(period)
        if (!total) {
          total = emptyUsageDelta()
          periods.set(period, total)
        }
        addUsageDelta(total, delta)
      }
    }

    const now = new Date()
    for (const [period, total] of periods) {
      try {
        await addToUsageBucket(
          db,
          {
            callerId: GLOBAL_USAGE_CALLER_ID,
            callerType: GLOBAL_USAGE_CALLER_TYPE,
            period,
            periodType: period.startsWith('day:') ? 'day' : 'month'
          },
          {
            requestCount: total.requestCount,
            successCount: total.successCount,
            failureCount: total.failureCount,
            totalTokens: total.totalTokens,
            promptTokens: total.promptTokens,
            completionTokens: total.completionTokens,
            totalCost: total.totalCost,
            avgLatency: total.requestCount > 0 ? total.latencySum / total.requestCount : 0
          },
          now
        )
      } catch (error) {
        this.logUsageStatsError(`${GLOBAL_USAGE_CALLER_ID}:${period}`, error)
        throw error
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
    // Pending entries below the cutoff lose their detail row but are still counted: retention and
    // privacy deletion remove details, never the usage counters.
    for (const entry of this.pendingLogs) {
      if (entry.timestamp < cutoffMs) this.countOnlyEntries.add(entry)
    }
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

    const result = await scheduleDbWrite(
      'intelligence.audit.retention',
      () =>
        db
          .delete(intelligenceAuditLogs)
          .where(
            and(
              inArray(intelligenceAuditLogs.id, ids),
              lt(intelligenceAuditLogs.timestamp, cutoffMs)
            )
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
   * The one-shot global backfill (`usage-ledger/global-backfill.ts`) runs in the background after
   * the startup write window (`database-write-contracts.md` §7), and is retried hourly until it
   * reports done. The callback returns at once, so it never holds a polling slot.
   */
  private startGlobalBackfillSchedule(): void {
    if (this.pollingService.isRegistered(this.backfillTaskId)) {
      this.pollingService.unregister(this.backfillTaskId)
    }
    this.pollingService.register(this.backfillTaskId, () => void this.runGlobalBackfill(), {
      interval: this.backfillRetryIntervalMs,
      unit: 'milliseconds',
      initialDelayMs: Math.max(this.backfillMinDelayMs, getStartupDegradeWindowRemainingMs()),
      lane: 'maintenance'
    })
    this.pollingService.start()
  }

  /**
   * Backfills the global bucket from detail rows once (no-op once done). Resolves to null when the
   * attempt failed and will be retried; never rejects.
   */
  runGlobalBackfill(): Promise<GlobalBackfillOutcome | null> {
    if (this.backfillSettled) return Promise.resolve('already-done')
    if (this.backfillRun) return this.backfillRun

    const run = (async (): Promise<GlobalBackfillOutcome | null> => {
      try {
        const outcome = await runGlobalUsageBackfill({
          cutoffMs: this.processStartMs,
          db: this.getDb()
        })
        // Done, or a marker no retry can repair: either way there is nothing left to schedule.
        this.backfillSettled = true
        this.pollingService.unregister(this.backfillTaskId)
        return outcome
      } catch {
        const now = Date.now()
        if (now - this.lastBackfillErrorLogAt >= this.flushErrorThrottleMs) {
          this.lastBackfillErrorLogAt = now
          auditLog.warn('Global usage backfill failed; it will be retried', {
            meta: { code: 'INTELLIGENCE_USAGE_BACKFILL_FAILED' }
          })
        }
        return null
      }
    })()
    this.backfillRun = run
    void run.finally(() => {
      if (this.backfillRun === run) this.backfillRun = null
    })
    return run
  }

  /**
   * Stop and cleanup
   */
  async destroy(): Promise<void> {
    this.pollingService.unregister(this.flushTaskId)
    this.pollingService.unregister(this.backfillTaskId)
    await this.flushToDB()
  }
}

export const intelligenceAuditLogger = new IntelligenceAuditLogger()
