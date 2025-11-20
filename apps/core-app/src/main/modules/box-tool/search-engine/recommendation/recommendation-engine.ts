import type { TuffItem } from '../types'
import type { DbUtils } from '../../../../db/utils'
import type { ContextSignal, TimePattern } from './context-provider'
import { ContextProvider } from './context-provider'
import { TimeStatsAggregator, type ParsedItemTimeStats } from '../time-stats-aggregator'
import * as schema from '../../../../db/schema'
import { desc } from 'drizzle-orm'

/**
 * 推荐引擎
 * 基于上下文和历史行为生成个性化推荐
 */
export class RecommendationEngine {
  private contextProvider: ContextProvider
  private timeStatsAggregator: TimeStatsAggregator

  constructor(private dbUtils: DbUtils) {
    this.contextProvider = new ContextProvider()
    this.timeStatsAggregator = new TimeStatsAggregator(dbUtils)
  }

  /**
   * 生成推荐列表
   */
  async recommend(options: RecommendationOptions = {}): Promise<RecommendationResult> {
    const startTime = performance.now()

    // 1. 获取当前上下文
    const context = await this.contextProvider.getCurrentContext()

    // 2. 检查缓存
    const cached = await this.getCachedRecommendations(context)
    if (cached && !options.forceRefresh) {
      console.log('[RecommendationEngine] Using cached recommendations')
      return {
        items: cached.items,
        context,
        duration: performance.now() - startTime,
        fromCache: true,
      }
    }

    // 3. 生成候选池
    const candidates = await this.getCandidates(context, options)
    console.log(`[RecommendationEngine] Generated ${candidates.length} candidates`)

    // 4. 计算推荐分数
    const scored = await this.scoreAndRank(candidates, context)

    // 5. 应用多样性过滤
    const limit = options.limit || 10
    const diversified = this.applyDiversityFilter(scored, limit)

    // 6. 缓存结果
    await this.cacheRecommendations(context, diversified)

    const duration = performance.now() - startTime
    console.log(`[RecommendationEngine] Generated ${diversified.length} recommendations in ${duration.toFixed(2)}ms`)

    return {
      items: diversified,
      context,
      duration,
      fromCache: false,
    }
  }

  /**
   * 获取候选项目池
   */
  private async getCandidates(
    context: ContextSignal,
    options: RecommendationOptions,
  ): Promise<CandidateItem[]> {
    const candidates: CandidateItem[] = []

    // 维度 1: 全局高频项目 (Top 30)
    const frequentItems = await this.getFrequentItems(30)
    candidates.push(...frequentItems.map(item => ({ 
      ...item, 
      source: 'frequent' as const 
    })))

    // 维度 2: 最近使用 (Top 20)
    const recentItems = await this.getRecentItems(20)
    candidates.push(...recentItems.map(item => ({ 
      ...item, 
      source: 'recent' as const 
    })))

    // 维度 3: 时段热门 (Top 20)
    const timeBasedItems = await this.getTimeBasedTopItems(context.time, 20)
    candidates.push(...timeBasedItems.map(item => ({ 
      ...item, 
      source: 'time-based' as const 
    })))

    // 去重(同一 sourceId + itemId 只保留第一次出现)
    return this.deduplicateCandidates(candidates)
  }

  /**
   * 获取全局高频项目
   */
  private async getFrequentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()
    
    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .orderBy(desc(schema.itemUsageStats.executeCount))
      .limit(limit)
      .all()

    return stats.map(stat => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId,
      sourceType: stat.sourceType,
      usageStats: stat,
    }))
  }

  /**
   * 获取最近使用的项目
   */
  private async getRecentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()
    
    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .orderBy(desc(schema.itemUsageStats.lastExecuted))
      .limit(limit)
      .all()

    return stats.filter(stat => stat.lastExecuted != null).map(stat => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId,
      sourceType: stat.sourceType,
      usageStats: stat,
    }))
  }

  /**
   * 获取当前时段的热门项目
   */
  private async getTimeBasedTopItems(
    timePattern: TimePattern,
    limit: number,
  ): Promise<ItemCandidate[]> {
    const allTimeStats = await this.dbUtils.getAllItemTimeStats()
    const scored: Array<{ item: ItemCandidate, score: number }> = []

    // 获取对应的使用统计
    const keys = allTimeStats.map(stat => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId,
    }))
    const usageStatsMap = new Map(
      (await this.dbUtils.getUsageStatsBatch(keys)).map(stat => 
        [`${stat.sourceId}:${stat.itemId}`, stat]
      )
    )

    for (const raw of allTimeStats) {
      const parsed: ParsedItemTimeStats = {
        sourceId: raw.sourceId,
        itemId: raw.itemId,
        hourDistribution: JSON.parse(raw.hourDistribution),
        dayOfWeekDistribution: JSON.parse(raw.dayOfWeekDistribution),
        timeSlotDistribution: JSON.parse(raw.timeSlotDistribution),
        lastUpdated: raw.lastUpdated,
      }

      const timeScore = this.calculateTimeRelevance(parsed, timePattern)
      if (timeScore > 0) {
        const key = `${raw.sourceId}:${raw.itemId}`
        const usageStats = usageStatsMap.get(key)

        if (usageStats) {
          scored.push({
            item: {
              sourceId: raw.sourceId,
              itemId: raw.itemId,
              sourceType: usageStats.sourceType,
              usageStats,
              timeStats: parsed,
            },
            score: timeScore,
          })
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item)
  }

  /**
   * 计算时间相关性分数
   */
  private calculateTimeRelevance(
    itemTimeStats: ParsedItemTimeStats,
    currentTime: TimePattern,
  ): number {
    const slotUsage = itemTimeStats.timeSlotDistribution[currentTime.timeSlot]
    const totalUsage = Object.values(itemTimeStats.timeSlotDistribution)
      .reduce((a, b) => a + b, 0)

    if (totalUsage === 0)
      return 0

    // 当前时段的使用占比
    const slotRatio = slotUsage / totalUsage

    // 星期几的加权
    const dayUsage = itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek]
    const avgDayUsage = itemTimeStats.dayOfWeekDistribution
      .reduce((a, b) => a + b, 0) / 7
    const dayFactor = dayUsage / (avgDayUsage || 1)

    return slotRatio * 100 * dayFactor
  }

  /**
   * 计算分数并排序
   */
  private async scoreAndRank(
    candidates: CandidateItem[],
    context: ContextSignal,
  ): Promise<ScoredItem[]> {
    const scored: ScoredItem[] = []

    for (const candidate of candidates) {
      const score = await this.calculateRecommendationScore(candidate, context)
      scored.push({ ...candidate, score })
    }

    return scored.sort((a, b) => b.score - a.score)
  }

  /**
   * 计算推荐分数
   */
  private async calculateRecommendationScore(
    candidate: CandidateItem,
    context: ContextSignal,
  ): Promise<number> {
    let score = 0

    // 1. 上下文匹配度 (最高权重)
    const contextMatch = this.calculateContextMatch(candidate, context)
    score += contextMatch * 1e6

    // 2. 时间相关性
    if (candidate.timeStats) {
      const timeRelevance = this.calculateTimeRelevance(candidate.timeStats, context.time)
      score += timeRelevance * 1e5
    }

    // 3. 频率分数(带时间衰减)
    const frequencyScore = this.calculateFrequencyScore(candidate.usageStats)
    score += frequencyScore * 1e4

    // 4. 最近使用加成
    const recencyBoost = this.calculateRecencyBoost(candidate.usageStats.lastExecuted)
    score += recencyBoost * 1e3

    return score
  }

  /**
   * 计算上下文匹配度
   */
  private calculateContextMatch(candidate: CandidateItem, context: ContextSignal): number {
    let score = 0

    // TODO: 实现剪贴板内容类型匹配
    // TODO: 实现前台应用关联匹配

    return score
  }

  /**
   * 计算频率分数(带时间衰减)
   */
  private calculateFrequencyScore(stats: typeof schema.itemUsageStats.$inferSelect): number {
    const executeCount = stats.executeCount
    const searchCount = stats.searchCount
    const cancelCount = stats.cancelCount || 0

    const lastInteraction = Math.max(
      stats.lastExecuted?.getTime() || 0,
      stats.lastSearched?.getTime() || 0,
      stats.lastCancelled?.getTime() || 0,
    )

    const daysSince = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24)
    const decayFactor = Math.exp(-0.1 * daysSince) // lambda = 0.1

    return (executeCount * 1.0 + searchCount * 0.3 + cancelCount * (-0.5)) * decayFactor
  }

  /**
   * 计算最近使用加成
   */
  private calculateRecencyBoost(lastUsed: Date | null): number {
    if (!lastUsed)
      return 0

    const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)

    // 1 小时内: 100 分
    // 24 小时:  50 分
    // 7 天:     10 分
    return Math.max(0, 100 * Math.exp(-0.1 * hoursSince))
  }

  /**
   * 应用多样性过滤
   */
  private applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
    const result: ScoredItem[] = []
    const typeCount = new Map<string, number>()

    for (const item of scored) {
      if (result.length >= limit)
        break

      const currentCount = typeCount.get(item.sourceType) || 0

      // 同类型不超过总数的 40%
      const maxPerType = Math.ceil(limit * 0.4)
      if (currentCount >= maxPerType && result.length >= limit / 2) {
        continue
      }

      result.push(item)
      typeCount.set(item.sourceType, currentCount + 1)
    }

    return result
  }

  /**
   * 去重候选项
   */
  private deduplicateCandidates(candidates: CandidateItem[]): CandidateItem[] {
    const seen = new Set<string>()
    const result: CandidateItem[] = []

    for (const candidate of candidates) {
      const key = `${candidate.sourceId}:${candidate.itemId}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(candidate)
      }
    }

    return result
  }

  /**
   * 获取缓存的推荐
   */
  private async getCachedRecommendations(context: ContextSignal): Promise<{ items: ScoredItem[] } | null> {
    const cacheKey = this.contextProvider.generateCacheKey(context)
    const cached = await this.dbUtils.getRecommendationCache(cacheKey)

    if (!cached)
      return null

    // 检查是否过期
    if (cached.expiresAt.getTime() < Date.now())
      return null

    try {
      const items = JSON.parse(cached.recommendedItems)
      return { items }
    }
    catch (error) {
      console.error('[RecommendationEngine] Failed to parse cached recommendations:', error)
      return null
    }
  }

  /**
   * 缓存推荐结果
   */
  private async cacheRecommendations(context: ContextSignal, items: ScoredItem[]): Promise<void> {
    const cacheKey = this.contextProvider.generateCacheKey(context)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 分钟过期

    await this.dbUtils.setRecommendationCache(cacheKey, items, expiresAt)
  }
}

/**
 * 推荐选项
 */
export interface RecommendationOptions {
  limit?: number
  forceRefresh?: boolean
  includeTypes?: string[]
  excludeTypes?: string[]
}

/**
 * 推荐结果
 */
export interface RecommendationResult {
  items: ScoredItem[]
  context: ContextSignal
  duration: number
  fromCache: boolean
}

/**
 * 项目候选
 */
interface ItemCandidate {
  sourceId: string
  itemId: string
  sourceType: string
  usageStats: typeof schema.itemUsageStats.$inferSelect
  timeStats?: ParsedItemTimeStats
}

/**
 * 候选项(带来源标记)
 */
interface CandidateItem extends ItemCandidate {
  source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'context'
}

/**
 * 评分后的项目
 */
export interface ScoredItem extends CandidateItem {
  score: number
}
