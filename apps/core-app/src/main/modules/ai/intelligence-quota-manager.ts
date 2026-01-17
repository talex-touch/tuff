import { and, eq, gte, sql } from 'drizzle-orm'
import { intelligenceAuditLogs, intelligenceQuotas, intelligenceUsageStats } from '../../db/schema'
import { databaseModule } from '../database'

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
  private quotaCache = new Map<string, QuotaConfig>()
  private usageCache = new Map<string, { usage: CurrentUsage; timestamp: number }>()
  private readonly usageCacheTTL = 10000 // 10 seconds

  private getDb() {
    return databaseModule.getDb()
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
    this.quotaCache.set(`${config.callerType}:${config.callerId}`, config)
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
      return this.quotaCache.get(cacheKey)!
    }

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

    if (rows.length === 0) return null

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

    this.quotaCache.set(cacheKey, config)
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

    this.quotaCache.delete(`${callerType}:${callerId}`)
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

    const usage = await this.getCurrentUsage(callerId, callerType)

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
   * Get all quotas
   */
  async getAllQuotas(): Promise<QuotaConfig[]> {
    const db = this.getDb()
    const rows = await db.select().from(intelligenceQuotas)

    return rows.map((row) => ({
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
  clearCache(): void {
    this.quotaCache.clear()
    this.usageCache.clear()
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
