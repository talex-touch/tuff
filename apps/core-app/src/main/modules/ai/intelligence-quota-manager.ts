import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { intelligenceAuditLogs, intelligenceQuotas, intelligenceUsageStats } from '../../db/schema'
import { databaseModule } from '../database'
import { GLOBAL_USAGE_CALLER_ID, GLOBAL_USAGE_CALLER_TYPE } from './usage-ledger/constants'
import { emptyUsageLimits } from './usage-ledger/usage-limits'

/**
 * The reserved `intelligence_quotas` row holding the device-local global usage limits (parent
 * design §3.1): the same `('__global__', 'system')` identity as the global usage bucket it limits.
 * Per-caller checks query `(caller, 'plugin')` and can never match it; `getAllQuotas()` hides it.
 */
const GLOBAL_LIMITS_CALLER_ID = GLOBAL_USAGE_CALLER_ID
const GLOBAL_LIMITS_CALLER_TYPE = GLOBAL_USAGE_CALLER_TYPE

function isGlobalLimitsRow(callerId: string, callerType: string): boolean {
  return callerId === GLOBAL_LIMITS_CALLER_ID && callerType === GLOBAL_LIMITS_CALLER_TYPE
}

/**
 * Quota configuration for a caller
 */
export interface QuotaConfig {
  callerId: string
  callerType: 'plugin' | 'user' | 'system'
  requestsPerMinute?: number
  requestsPerDay?: number
  requestsPerMonth?: number
  tokensPerMinute?: number
  tokensPerDay?: number
  tokensPerMonth?: number
  costLimitPerDay?: number
  costLimitPerMonth?: number
  enabled?: boolean
}

/**
 * Current usage for a caller
 */
export interface CurrentUsage {
  requestsThisMinute: number
  requestsToday: number
  requestsThisMonth: number
  tokensThisMinute: number
  tokensToday: number
  tokensThisMonth: number
  costToday: number
  costThisMonth: number
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  remainingRequests?: number
  remainingTokens?: number
  remainingCost?: number
}

/**
 * IntelligenceQuotaManager - Manages usage quotas and rate limiting
 */
export class IntelligenceQuotaManager {
  /**
   * `null` caches "no quota row": every built-in `core.*` caller goes through `checkQuota` on each
   * call, and without it each call would read the table to learn the same absence.
   */
  private quotaCache = new Map<string, QuotaConfig | null>()
  /** Bumped by every quota write, so a lookup that raced one does not cache what it read. */
  private quotaCacheGeneration = 0
  private usageCache = new Map<string, { usage: CurrentUsage; timestamp: number }>()
  private readonly usageCacheTTL = 10000 // 10 seconds
  /**
   * Timestamps of requests this manager has admitted, per caller.
   *
   * The cached snapshot is built from intelligence_audit_logs, so it only ever reflects
   * requests already flushed to the database - and it is reused for 10s on top of that. A
   * caller with requestsPerMinute: 10 could therefore fire hundreds of calls in two seconds and
   * every one of them would read the same stale zero (#778). Admissions are counted here the
   * moment they are granted, so a burst binds against the limit immediately.
   */
  private admissions = new Map<string, number[]>()
  /**
   * The global usage limits as last read or written. Filled after a commit (`setGlobalLimits`) or
   * a read that no write overtook, so it never holds anything the database does not.
   */
  private globalLimitsCache: UsageLimits | null = null
  /** Bumped by every write of the reserved row, so a racing read does not cache a stale value. */
  private globalLimitsGeneration = 0

  private getDb() {
    return databaseModule.getDb()
  }

  /** Any write that may have touched the reserved row through the generic quota API. */
  private invalidateGlobalLimits(callerId: string, callerType: string): void {
    if (!isGlobalLimitsRow(callerId, callerType)) return
    this.globalLimitsGeneration += 1
    this.globalLimitsCache = null
  }

  /**
   * The device-local global usage limits (usage-limits task C1). All `null` when none are set.
   * Cached; the cache only ever holds what the database holds (`setGlobalLimits` refreshes it after
   * its commit, and a read overtaken by a write is not cached).
   */
  async getGlobalLimits(): Promise<UsageLimits> {
    if (this.globalLimitsCache) return { ...this.globalLimitsCache }

    const generation = this.globalLimitsGeneration
    const [row] = await this.getDb()
      .select()
      .from(intelligenceQuotas)
      .where(
        and(
          eq(intelligenceQuotas.callerId, GLOBAL_LIMITS_CALLER_ID),
          eq(intelligenceQuotas.callerType, GLOBAL_LIMITS_CALLER_TYPE)
        )
      )
      .orderBy(asc(intelligenceQuotas.id))
      .limit(1)
    const limits: UsageLimits = row
      ? {
          requestsPerDay: row.requestsPerDay ?? null,
          requestsPerMonth: row.requestsPerMonth ?? null,
          tokensPerDay: row.tokensPerDay ?? null,
          tokensPerMonth: row.tokensPerMonth ?? null,
          costUsdPerDay: row.costLimitPerDay ?? null,
          costUsdPerMonth: row.costLimitPerMonth ?? null
        }
      : emptyUsageLimits()
    if (generation === this.globalLimitsGeneration) this.globalLimitsCache = limits
    return { ...limits }
  }

  /**
   * Replaces the whole global limit set: every field is written, a `null` clears its limit, and the
   * row is always `enabled` with the per-minute columns empty. Validated by the caller
   * (`usage-ledger/usage-limits.ts`). One transaction on the primary write lane upserts the reserved
   * row (and folds away duplicates — the table has no unique key); the cache is refreshed only after
   * the commit, so a read that follows this call sees what it wrote.
   */
  async setGlobalLimits(limits: UsageLimits): Promise<UsageLimits> {
    const next: UsageLimits = {
      requestsPerDay: limits.requestsPerDay,
      requestsPerMonth: limits.requestsPerMonth,
      tokensPerDay: limits.tokensPerDay,
      tokensPerMonth: limits.tokensPerMonth,
      costUsdPerDay: limits.costUsdPerDay,
      costUsdPerMonth: limits.costUsdPerMonth
    }
    const db = this.getDb()
    await scheduleDbWrite(
      'intelligence.usage-limits.set',
      async () => {
        await db.transaction(async (tx) => {
          const existing = await tx
            .select({ id: intelligenceQuotas.id })
            .from(intelligenceQuotas)
            .where(
              and(
                eq(intelligenceQuotas.callerId, GLOBAL_LIMITS_CALLER_ID),
                eq(intelligenceQuotas.callerType, GLOBAL_LIMITS_CALLER_TYPE)
              )
            )
            .orderBy(asc(intelligenceQuotas.id))
          // `null`, never `undefined`: drizzle drops undefined fields from an UPDATE, which would
          // leave the old limit in place.
          const values = {
            requestsPerMinute: null,
            requestsPerDay: next.requestsPerDay,
            requestsPerMonth: next.requestsPerMonth,
            tokensPerMinute: null,
            tokensPerDay: next.tokensPerDay,
            tokensPerMonth: next.tokensPerMonth,
            costLimitPerDay: next.costUsdPerDay,
            costLimitPerMonth: next.costUsdPerMonth,
            enabled: true,
            updatedAt: new Date()
          }
          const [first, ...duplicates] = existing
          if (!first) {
            await tx.insert(intelligenceQuotas).values({
              callerId: GLOBAL_LIMITS_CALLER_ID,
              callerType: GLOBAL_LIMITS_CALLER_TYPE,
              ...values
            })
            return
          }
          await tx.update(intelligenceQuotas).set(values).where(eq(intelligenceQuotas.id, first.id))
          if (duplicates.length > 0) {
            await tx.delete(intelligenceQuotas).where(
              inArray(
                intelligenceQuotas.id,
                duplicates.map((row) => row.id)
              )
            )
          }
        })
      },
      { priority: 'interactive', dropPolicy: 'none' }
    )
    this.globalLimitsGeneration += 1
    this.globalLimitsCache = next
    return { ...next }
  }

  /**
   * Set quota for a caller
   */
  async setQuota(config: QuotaConfig): Promise<void> {
    const db = this.getDb()

    // Check if quota exists
    const existing = await db
      .select()
      .from(intelligenceQuotas)
      .where(
        and(
          eq(intelligenceQuotas.callerId, config.callerId),
          eq(intelligenceQuotas.callerType, config.callerType)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      // Update existing
      await db
        .update(intelligenceQuotas)
        .set({
          requestsPerMinute: config.requestsPerMinute,
          requestsPerDay: config.requestsPerDay,
          requestsPerMonth: config.requestsPerMonth,
          tokensPerMinute: config.tokensPerMinute,
          tokensPerDay: config.tokensPerDay,
          tokensPerMonth: config.tokensPerMonth,
          costLimitPerDay: config.costLimitPerDay,
          costLimitPerMonth: config.costLimitPerMonth,
          enabled: config.enabled ?? true,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(intelligenceQuotas.callerId, config.callerId),
            eq(intelligenceQuotas.callerType, config.callerType)
          )
        )
    } else {
      // Insert new
      await db.insert(intelligenceQuotas).values({
        callerId: config.callerId,
        callerType: config.callerType,
        requestsPerMinute: config.requestsPerMinute,
        requestsPerDay: config.requestsPerDay,
        requestsPerMonth: config.requestsPerMonth,
        tokensPerMinute: config.tokensPerMinute,
        tokensPerDay: config.tokensPerDay,
        tokensPerMonth: config.tokensPerMonth,
        costLimitPerDay: config.costLimitPerDay,
        costLimitPerMonth: config.costLimitPerMonth,
        enabled: config.enabled ?? true
      })
    }

    // Update cache
    this.quotaCacheGeneration += 1
    this.quotaCache.set(`${config.callerType}:${config.callerId}`, config)
    this.invalidateGlobalLimits(config.callerId, config.callerType)
  }

  /**
   * Get quota configuration for a caller
   */
  async getQuota(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system' = 'plugin'
  ): Promise<QuotaConfig | null> {
    const cacheKey = `${callerType}:${callerId}`

    // Check cache
    if (this.quotaCache.has(cacheKey)) {
      return this.quotaCache.get(cacheKey) ?? null
    }

    const generation = this.quotaCacheGeneration
    const db = this.getDb()
    const rows = await db
      .select()
      .from(intelligenceQuotas)
      .where(
        and(
          eq(intelligenceQuotas.callerId, callerId),
          eq(intelligenceQuotas.callerType, callerType)
        )
      )
      .limit(1)

    if (rows.length === 0) {
      if (generation === this.quotaCacheGeneration) this.quotaCache.set(cacheKey, null)
      return null
    }

    const row = rows[0]
    const config: QuotaConfig = {
      callerId: row.callerId,
      callerType: row.callerType as 'plugin' | 'user' | 'system',
      requestsPerMinute: row.requestsPerMinute ?? undefined,
      requestsPerDay: row.requestsPerDay ?? undefined,
      requestsPerMonth: row.requestsPerMonth ?? undefined,
      tokensPerMinute: row.tokensPerMinute ?? undefined,
      tokensPerDay: row.tokensPerDay ?? undefined,
      tokensPerMonth: row.tokensPerMonth ?? undefined,
      costLimitPerDay: row.costLimitPerDay ?? undefined,
      costLimitPerMonth: row.costLimitPerMonth ?? undefined,
      enabled: row.enabled
    }

    if (generation === this.quotaCacheGeneration) this.quotaCache.set(cacheKey, config)
    return config
  }

  /**
   * Delete quota for a caller
   */
  async deleteQuota(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system' = 'plugin'
  ): Promise<void> {
    const db = this.getDb()

    await db
      .delete(intelligenceQuotas)
      .where(
        and(
          eq(intelligenceQuotas.callerId, callerId),
          eq(intelligenceQuotas.callerType, callerType)
        )
      )

    this.quotaCacheGeneration += 1
    this.quotaCache.delete(`${callerType}:${callerId}`)
    this.invalidateGlobalLimits(callerId, callerType)
  }

  /**
   * Get current usage for a caller
   */
  async getCurrentUsage(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system' = 'plugin'
  ): Promise<CurrentUsage> {
    const cacheKey = `usage:${callerType}:${callerId}`
    const cached = this.usageCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.usageCacheTTL) {
      return cached.usage
    }

    const db = this.getDb()
    const now = new Date()
    const minuteAgo = now.getTime() - 60 * 1000

    // Query audit logs for minute usage
    const minuteStats = await db
      .select({
        count: sql<number>`count(*)`,
        tokens: sql<number>`coalesce(sum(${intelligenceAuditLogs.totalTokens}), 0)`
      })
      .from(intelligenceAuditLogs)
      .where(
        and(
          eq(intelligenceAuditLogs.caller, callerId),
          gte(intelligenceAuditLogs.timestamp, minuteAgo)
        )
      )

    // Query usage stats for today
    const todayPeriod = `day:${now.toISOString().split('T')[0]}`
    const todayStats = await db
      .select()
      .from(intelligenceUsageStats)
      .where(
        and(
          eq(intelligenceUsageStats.callerId, callerId),
          eq(intelligenceUsageStats.period, todayPeriod)
        )
      )
      .limit(1)

    // Query usage stats for this month
    const monthPeriod = `month:${now.toISOString().substring(0, 7)}`
    const monthStats = await db
      .select()
      .from(intelligenceUsageStats)
      .where(
        and(
          eq(intelligenceUsageStats.callerId, callerId),
          eq(intelligenceUsageStats.period, monthPeriod)
        )
      )
      .limit(1)

    const usage: CurrentUsage = {
      requestsThisMinute: minuteStats[0]?.count || 0,
      tokensThisMinute: minuteStats[0]?.tokens || 0,
      requestsToday: todayStats[0]?.requestCount || 0,
      tokensToday: todayStats[0]?.totalTokens || 0,
      costToday: todayStats[0]?.totalCost || 0,
      requestsThisMonth: monthStats[0]?.requestCount || 0,
      tokensThisMonth: monthStats[0]?.totalTokens || 0,
      costThisMonth: monthStats[0]?.totalCost || 0
    }

    this.usageCache.set(cacheKey, { usage, timestamp: Date.now() })
    return usage
  }

  /**
   * Check if a request is allowed based on quota
   */
  async checkQuota(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system' = 'plugin',
    estimatedTokens: number = 0
  ): Promise<QuotaCheckResult> {
    const quota = await this.getQuota(callerId, callerType)

    // No quota configured = unlimited
    if (!quota) {
      return { allowed: true }
    }

    // Quota disabled
    if (!quota.enabled) {
      return { allowed: false, reason: 'Quota is disabled for this caller' }
    }

    const snapshot = await this.getCurrentUsage(callerId, callerType)
    // Whichever is higher: the database has the truth once rows are flushed, the ledger has it
    // during a burst. Taking the max rather than the sum keeps a request from being counted
    // twice as its audit row lands.
    const usage: CurrentUsage = {
      ...snapshot,
      requestsThisMinute: Math.max(
        snapshot.requestsThisMinute,
        this.countRecentAdmissions(callerId, callerType)
      )
    }

    // Check requests per minute
    if (quota.requestsPerMinute && usage.requestsThisMinute >= quota.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded (requests per minute)',
        remainingRequests: 0
      }
    }

    // Check requests per day
    if (quota.requestsPerDay && usage.requestsToday >= quota.requestsPerDay) {
      return {
        allowed: false,
        reason: 'Daily request limit exceeded',
        remainingRequests: 0
      }
    }

    // Check requests per month
    if (quota.requestsPerMonth && usage.requestsThisMonth >= quota.requestsPerMonth) {
      return {
        allowed: false,
        reason: 'Monthly request limit exceeded',
        remainingRequests: 0
      }
    }

    // Check tokens per minute
    if (quota.tokensPerMinute && usage.tokensThisMinute + estimatedTokens > quota.tokensPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded (tokens per minute)',
        remainingTokens: Math.max(0, quota.tokensPerMinute - usage.tokensThisMinute)
      }
    }

    // Check tokens per day
    if (quota.tokensPerDay && usage.tokensToday + estimatedTokens > quota.tokensPerDay) {
      return {
        allowed: false,
        reason: 'Daily token limit exceeded',
        remainingTokens: Math.max(0, quota.tokensPerDay - usage.tokensToday)
      }
    }

    // Check tokens per month
    if (quota.tokensPerMonth && usage.tokensThisMonth + estimatedTokens > quota.tokensPerMonth) {
      return {
        allowed: false,
        reason: 'Monthly token limit exceeded',
        remainingTokens: Math.max(0, quota.tokensPerMonth - usage.tokensThisMonth)
      }
    }

    // Check cost per day
    if (quota.costLimitPerDay && usage.costToday >= quota.costLimitPerDay) {
      return {
        allowed: false,
        reason: 'Daily cost limit exceeded',
        remainingCost: 0
      }
    }

    // Check cost per month
    if (quota.costLimitPerMonth && usage.costThisMonth >= quota.costLimitPerMonth) {
      return {
        allowed: false,
        reason: 'Monthly cost limit exceeded',
        remainingCost: 0
      }
    }

    // Counted at admission, not when the audit row lands, so the next check in the same burst
    // sees this request. The unlimited early-return above is deliberately not counted: there is
    // no limit for it to bind against.
    this.recordAdmission(callerId, callerType)

    // Calculate remaining
    return {
      allowed: true,
      remainingRequests: quota.requestsPerDay
        ? quota.requestsPerDay - usage.requestsToday
        : undefined,
      remainingTokens: quota.tokensPerDay ? quota.tokensPerDay - usage.tokensToday : undefined,
      remainingCost: quota.costLimitPerDay ? quota.costLimitPerDay - usage.costToday : undefined
    }
  }

  /**
   * Get all quotas. Per-caller quotas only: the reserved global-limits row is read through
   * `getGlobalLimits()`.
   */
  async getAllQuotas(): Promise<QuotaConfig[]> {
    const db = this.getDb()
    const rows = await db.select().from(intelligenceQuotas)

    return rows
      .filter((row) => !isGlobalLimitsRow(row.callerId, row.callerType))
      .map((row) => ({
        callerId: row.callerId,
        callerType: row.callerType as 'plugin' | 'user' | 'system',
        requestsPerMinute: row.requestsPerMinute ?? undefined,
        requestsPerDay: row.requestsPerDay ?? undefined,
        requestsPerMonth: row.requestsPerMonth ?? undefined,
        tokensPerMinute: row.tokensPerMinute ?? undefined,
        tokensPerDay: row.tokensPerDay ?? undefined,
        tokensPerMonth: row.tokensPerMonth ?? undefined,
        costLimitPerDay: row.costLimitPerDay ?? undefined,
        costLimitPerMonth: row.costLimitPerMonth ?? undefined,
        enabled: row.enabled
      }))
  }

  /**
   * Clear quota cache
   */
  private admissionKey(callerId: string, callerType: 'plugin' | 'user' | 'system'): string {
    return `${callerType}:${callerId}`
  }

  /** Admissions inside the trailing minute, pruning anything older as it goes. */
  private countRecentAdmissions(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system',
    now: number = Date.now()
  ): number {
    const key = this.admissionKey(callerId, callerType)
    const recent = (this.admissions.get(key) ?? []).filter((at) => now - at < 60 * 1000)
    if (recent.length === 0) {
      this.admissions.delete(key)
      return 0
    }
    this.admissions.set(key, recent)
    return recent.length
  }

  private recordAdmission(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system',
    now: number = Date.now()
  ): void {
    const key = this.admissionKey(callerId, callerType)
    this.countRecentAdmissions(callerId, callerType, now)
    this.admissions.set(key, [...(this.admissions.get(key) ?? []), now])
  }

  invalidateUsageCache(
    callerId: string,
    callerType: 'plugin' | 'user' | 'system' = 'plugin'
  ): void {
    this.usageCache.delete(`usage:${callerType}:${callerId}`)
  }

  clearCache(): void {
    this.admissions.clear()
    this.quotaCacheGeneration += 1
    this.quotaCache.clear()
    this.usageCache.clear()
    this.globalLimitsGeneration += 1
    this.globalLimitsCache = null
  }

  /**
   * Set default quotas for plugins
   */
  async setDefaultPluginQuota(config: Omit<QuotaConfig, 'callerId' | 'callerType'>): Promise<void> {
    await this.setQuota({
      ...config,
      callerId: '__default_plugin__',
      callerType: 'plugin'
    })
  }

  /**
   * Get default quota for plugins
   */
  async getDefaultPluginQuota(): Promise<QuotaConfig | null> {
    return this.getQuota('__default_plugin__', 'plugin')
  }
}

export const intelligenceQuotaManager = new IntelligenceQuotaManager()
