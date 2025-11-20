import { desc, eq } from 'drizzle-orm'
import type { DbUtils } from '../../../db/utils'
import * as schema from '../../../db/schema'

/**
 * 时间维度使用统计汇总器
 * 负责从 usage_logs 中提取时间维度的使用模式并更新到 item_time_stats
 */
export class TimeStatsAggregator {
  constructor(private dbUtils: DbUtils) {}

  /**
   * 从 usage_logs 汇总时间统计到 item_time_stats
   */
  async aggregateTimeStats(): Promise<void> {
    const startTime = performance.now()
    console.log('[TimeStatsAggregator] Starting aggregation...')

    const db = this.dbUtils.getDb()

    // 1. 查询所有执行日志
    const logs = await db
      .select({
        sourceId: schema.usageLogs.source,
        itemId: schema.usageLogs.itemId,
        timestamp: schema.usageLogs.timestamp,
      })
      .from(schema.usageLogs)
      .where(eq(schema.usageLogs.action, 'execute'))
      .orderBy(desc(schema.usageLogs.timestamp))
      .all()

    console.log(`[TimeStatsAggregator] Found ${logs.length} execution logs`)

    // 2. 构建统计数据
    const statsMap = new Map<string, ItemTimeStatsData>()

    for (const log of logs) {
      const key = `${log.sourceId}:${log.itemId}`
      const date = new Date(log.timestamp)
      const hour = date.getHours()
      const dayOfWeek = date.getDay()
      const timeSlot = this.getTimeSlot(hour)

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          sourceId: log.sourceId,
          itemId: log.itemId,
          hourDistribution: new Array(24).fill(0),
          dayOfWeekDistribution: new Array(7).fill(0),
          timeSlotDistribution: {
            morning: 0,
            afternoon: 0,
            evening: 0,
            night: 0,
          },
        })
      }

      const stats = statsMap.get(key)!
      stats.hourDistribution[hour]++
      stats.dayOfWeekDistribution[dayOfWeek]++
      stats.timeSlotDistribution[timeSlot]++
    }

    // 3. 批量写入数据库
    let updatedCount = 0
    for (const stats of statsMap.values()) {
      await this.dbUtils.upsertItemTimeStats({
        sourceId: stats.sourceId,
        itemId: stats.itemId,
        hourDistribution: JSON.stringify(stats.hourDistribution),
        dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
        timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
        lastUpdated: new Date(),
      })
      updatedCount++
    }

    const duration = performance.now() - startTime
    console.log(
      `[TimeStatsAggregator] Aggregation completed. Updated ${updatedCount} items in ${duration.toFixed(2)}ms`,
    )
  }

  /**
   * 获取指定时刻的时间段
   */
  private getTimeSlot(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 6 && hour < 12)
      return 'morning'
    if (hour >= 12 && hour < 18)
      return 'afternoon'
    if (hour >= 18 && hour < 22)
      return 'evening'
    return 'night'
  }

  /**
   * 获取特定项目的时间统计
   */
  async getItemTimeStats(sourceId: string, itemId: string): Promise<ParsedItemTimeStats | null> {
    const results = await this.dbUtils.getItemTimeStatsBatch([{ sourceId, itemId }])
    
    if (results.length === 0)
      return null
    
    const raw = results[0]
    return this.parseTimeStats(raw)
  }

  /**
   * 批量获取时间统计
   */
  async getItemTimeStatsBatch(
    keys: Array<{ sourceId: string, itemId: string }>,
  ): Promise<Map<string, ParsedItemTimeStats>> {
    const results = await this.dbUtils.getItemTimeStatsBatch(keys)
    const statsMap = new Map<string, ParsedItemTimeStats>()

    for (const raw of results) {
      const key = `${raw.sourceId}:${raw.itemId}`
      statsMap.set(key, this.parseTimeStats(raw))
    }

    return statsMap
  }

  /**
   * 解析存储的JSON字符串为对象
   */
  private parseTimeStats(raw: typeof schema.itemTimeStats.$inferSelect): ParsedItemTimeStats {
    return {
      sourceId: raw.sourceId,
      itemId: raw.itemId,
      hourDistribution: JSON.parse(raw.hourDistribution),
      dayOfWeekDistribution: JSON.parse(raw.dayOfWeekDistribution),
      timeSlotDistribution: JSON.parse(raw.timeSlotDistribution),
      lastUpdated: raw.lastUpdated,
    }
  }
}

/**
 * 内部使用的时间统计数据结构
 */
interface ItemTimeStatsData {
  sourceId: string
  itemId: string
  hourDistribution: number[]
  dayOfWeekDistribution: number[]
  timeSlotDistribution: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
}

/**
 * 解析后的时间统计数据结构
 */
export interface ParsedItemTimeStats {
  sourceId: string
  itemId: string
  hourDistribution: number[]
  dayOfWeekDistribution: number[]
  timeSlotDistribution: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
  lastUpdated: Date
}
