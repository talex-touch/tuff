import type { DbUtils } from '../../../db/utils'
import { desc, eq } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { createLogger } from '../../../utils/logger'
import { enterPerfContext } from '../../../utils/perf-context'

const log = createLogger('TimeStatsAggregator')

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
    const dispose = enterPerfContext('TimeStatsAggregator.aggregate')

    try {
      const startTime = performance.now()
      log.debug('Starting aggregation...')

      const db = this.dbUtils.getDb()

      // 1. 查询所有执行日志
      const logs = await db
        .select({
          sourceId: schema.usageLogs.source,
          itemId: schema.usageLogs.itemId,
          timestamp: schema.usageLogs.timestamp
        })
        .from(schema.usageLogs)
        .where(eq(schema.usageLogs.action, 'execute'))
        .orderBy(desc(schema.usageLogs.timestamp))
        .all()

      log.debug(`Found ${logs.length} execution logs`)

      if (logs.length === 0) return

      // 2. 构建统计数据 — 每 50 行让出事件循环
      const statsMap = new Map<string, ItemTimeStatsData>()

      for (let i = 0; i < logs.length; i++) {
        const entry = logs[i]
        const key = `${entry.sourceId}:${entry.itemId}`
        const date = new Date(entry.timestamp)
        const hour = date.getHours()
        const dayOfWeek = date.getDay()
        const timeSlot = this.getTimeSlot(hour)

        if (!statsMap.has(key)) {
          statsMap.set(key, {
            sourceId: entry.sourceId,
            itemId: entry.itemId,
            hourDistribution: Array.from({ length: 24 }, () => 0),
            dayOfWeekDistribution: Array.from({ length: 7 }, () => 0),
            timeSlotDistribution: {
              morning: 0,
              afternoon: 0,
              evening: 0,
              night: 0
            }
          })
        }

        const stats = statsMap.get(key)!
        stats.hourDistribution[hour]++
        stats.dayOfWeekDistribution[dayOfWeek]++
        stats.timeSlotDistribution[timeSlot]++

        // 每 50 行让出事件循环，避免连续同步操作累积阻塞
        if ((i + 1) % 50 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }

      // 3. 批量写入数据库 — 抽出事务体，通过统一的单写入队列 (dbWriteScheduler)
      //    串行化，并用共享 withSqliteRetry 处理 SQLITE_BUSY（异步退避，不阻塞事件循环）。
      let updatedCount = 0
      const allStats = Array.from(statsMap.values())

      const writeAggregatedStats = (): Promise<void> =>
        db.transaction(async (tx) => {
          for (let i = 0; i < allStats.length; i++) {
            const stats = allStats[i]
            await tx
              .insert(schema.itemTimeStats)
              .values({
                sourceId: stats.sourceId,
                itemId: stats.itemId,
                hourDistribution: JSON.stringify(stats.hourDistribution),
                dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
                timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
                lastUpdated: new Date()
              })
              .onConflictDoUpdate({
                target: [schema.itemTimeStats.sourceId, schema.itemTimeStats.itemId],
                set: {
                  hourDistribution: JSON.stringify(stats.hourDistribution),
                  dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
                  timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
                  lastUpdated: new Date()
                }
              })
            updatedCount++

            // 每 20 条 upsert 让出事件循环
            if ((i + 1) % 20 === 0) {
              await new Promise<void>((resolve) => setImmediate(resolve))
            }
          }
        })

      await dbWriteScheduler.schedule(
        'usage.time-stats.aggregate',
        () => withSqliteRetry(writeAggregatedStats, { label: 'usage.time-stats.aggregate' }),
        { priority: 'background', dropPolicy: 'none' }
      )

      const duration = performance.now() - startTime
      log.debug(`Aggregation completed. Updated ${updatedCount} items in ${duration.toFixed(2)}ms`)
    } finally {
      dispose()
    }
  }

  /**
   * 获取指定时刻的时间段
   */
  private getTimeSlot(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'afternoon'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'night'
  }

  /**
   * 获取特定项目的时间统计
   */
  async getItemTimeStats(sourceId: string, itemId: string): Promise<ParsedItemTimeStats | null> {
    const results = await this.dbUtils.getItemTimeStatsBatch([{ sourceId, itemId }])

    if (results.length === 0) return null

    const raw = results[0]
    return this.parseTimeStats(raw)
  }

  /**
   * 批量获取时间统计
   */
  async getItemTimeStatsBatch(
    keys: Array<{ sourceId: string; itemId: string }>
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
      lastUpdated: raw.lastUpdated
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
