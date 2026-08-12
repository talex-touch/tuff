import type { DbUtils } from '../../../db/utils'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { scheduleDbWrite } from '../../../db/db-write'
import { parseStoredTimeBuckets } from './item-time-stats-buckets'
import { createLogger } from '../../../utils/logger'
import { enterPerfContext } from '../../../utils/perf-context'
import { resolveTimeSlot } from './item-time-stats-buckets'

const log = createLogger('TimeStatsAggregator')

/**
 * 每次写事务的上限。与 backfillTrendDay 一致：足够摊薄事务开销，又不会让单条
 * 多行 VALUES 语句无界增长。
 */
const AGGREGATE_CHUNK_SIZE = 500

/** 一次读进内存的日志行数上限。 */
const LOG_PAGE_SIZE = 5000

/**
 * Opt-in switch for the destructive full rebuild below. Off by default: the
 * rebuild writes ABSOLUTE values derived from `usage_logs`, so once retention
 * prunes the logs it also erases the distributions accumulated before them.
 */
const TIME_STATS_REBUILD_ENABLED = process.env.TUFF_RECO_TIME_STATS_REBUILD === '1'

export interface AggregateTimeStatsOptions {
  /**
   * Run the rebuild even with the flag off. Reserved for the explicit,
   * user-triggered repair action — never for scheduled maintenance.
   */
  force?: boolean
}

/**
 * 时间维度使用统计汇总器
 *
 * @remarks
 * Steady-state accumulation lives on the usage-stats drain path
 * (usage-stats-queue → item_time_stats, additive). This class is now the
 * REPAIR path only: a full recompute from `usage_logs` that overwrites the
 * accumulated buckets with whatever the surviving logs imply.
 */
export class TimeStatsAggregator {
  constructor(private dbUtils: DbUtils) {}

  /**
   * 从 usage_logs 重建时间统计（修复用途，默认关闭）
   */
  async aggregateTimeStats(options: AggregateTimeStatsOptions = {}): Promise<void> {
    if (!options.force && !TIME_STATS_REBUILD_ENABLED) {
      log.debug('Skipping time stats rebuild (incremental accumulation owns this table)')
      return
    }

    const dispose = enterPerfContext('TimeStatsAggregator.aggregate')

    try {
      const startTime = performance.now()
      log.debug('Starting aggregation...')

      const db = this.dbUtils.getDb()

      // 1-2. 逐页读取执行日志并就地折叠进桶里。
      //
      // 之前是一次 .all() 把整张 usage_logs 的 execute 行物化成数组：保留窗口调大的
      // 老装机会累积上百万行，而这条路径可以被 IPC 强制触发，等于在主进程里一次性
      // 建出上百万个行对象。改成按主键 keyset 分页（id > lastId），常驻内存只剩一页
      // 加上 statsMap —— 后者的规模由「去重后的 item 数」决定，与日志行数无关。
      //
      // 没有按 issue 建议改成 SQL GROUP BY：下面的 getHours()/getDay() 取的是本地时区，
      // 而 SQLite 的 strftime 按 UTC 分组，换过去会静默改变非 UTC 用户的分桶结果。
      const statsMap = new Map<string, ItemTimeStatsData>()
      let totalLogs = 0
      let lastId = 0
      let rowsSinceYield = 0

      for (;;) {
        const page = await db
          .select({
            id: schema.usageLogs.id,
            sourceId: schema.usageLogs.source,
            itemId: schema.usageLogs.itemId,
            timestamp: schema.usageLogs.timestamp
          })
          .from(schema.usageLogs)
          .where(and(eq(schema.usageLogs.action, 'execute'), gt(schema.usageLogs.id, lastId)))
          .orderBy(asc(schema.usageLogs.id))
          .limit(LOG_PAGE_SIZE)
          .all()

        if (page.length === 0) break

        lastId = page[page.length - 1].id
        totalLogs += page.length

        for (const entry of page) {
          const key = `${entry.sourceId}:${entry.itemId}`
          const date = new Date(entry.timestamp)
          const hour = date.getHours()
          const dayOfWeek = date.getDay()
          const timeSlot = resolveTimeSlot(hour)

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
          if (++rowsSinceYield >= 50) {
            rowsSinceYield = 0
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
        }

        if (page.length < LOG_PAGE_SIZE) break
      }

      log.debug(`Found ${totalLogs} execution logs`)

      if (totalLogs === 0) return

      // 3. 批量写入数据库 — 分块提交，每块自成一次 scheduleDbWrite。
      //    之前这里是「一个事务体内部每 20 条 await setImmediate」：让出事件循环时
      //    WAL 写锁仍被握着，整个重建期间 search-index worker 的并发写都会撞
      //    SQLITE_BUSY。改为 backfillTrendDay 同款分块写法后，写锁只在单块内持有，
      //    让步发生在两次事务之间。
      let updatedCount = 0
      const allStats = Array.from(statsMap.values())
      const now = new Date()
      const values = allStats.map((stats) => ({
        sourceId: stats.sourceId,
        itemId: stats.itemId,
        hourDistribution: JSON.stringify(stats.hourDistribution),
        dayOfWeekDistribution: JSON.stringify(stats.dayOfWeekDistribution),
        timeSlotDistribution: JSON.stringify(stats.timeSlotDistribution),
        lastUpdated: now
      }))

      for (let i = 0; i < values.length; i += AGGREGATE_CHUNK_SIZE) {
        const chunk = values.slice(i, i + AGGREGATE_CHUNK_SIZE)
        await scheduleDbWrite(
          'usage.time-stats.aggregate',
          () =>
            db
              .insert(schema.itemTimeStats)
              .values(chunk)
              .onConflictDoUpdate({
                target: [schema.itemTimeStats.sourceId, schema.itemTimeStats.itemId],
                set: {
                  hourDistribution: sql`excluded.hour_distribution`,
                  dayOfWeekDistribution: sql`excluded.day_of_week_distribution`,
                  timeSlotDistribution: sql`excluded.time_slot_distribution`,
                  lastUpdated: sql`excluded.last_updated`
                }
              }),
          { priority: 'background', dropPolicy: 'none' }
        )
        updatedCount += chunk.length

        // 让步放在两次事务之间，此时没有写锁在手。
        if (i + AGGREGATE_CHUNK_SIZE < values.length) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }

      const duration = performance.now() - startTime
      log.debug(`Aggregation completed. Updated ${updatedCount} items in ${duration.toFixed(2)}ms`)
    } finally {
      dispose()
    }
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
    return toParsedItemTimeStats(raw)
  }
}

/**
 * Builds a ParsedItemTimeStats from a stored row, tolerating malformed columns.
 *
 * These three columns are plain TEXT holding JSON. A raw JSON.parse on them threw out of the
 * public getItemTimeStats / getItemTimeStatsBatch API, so a single corrupt row — a partial write,
 * a truncated migration — took down every caller rather than costing that one item its history
 * (#655).
 *
 * parseStoredTimeBuckets already handles this per column, zeroing only what it cannot read.
 * Exported so the recommendation engine can share it instead of repeating the mapping (#649).
 */
export function toParsedItemTimeStats(
  raw: typeof schema.itemTimeStats.$inferSelect
): ParsedItemTimeStats {
  const buckets = parseStoredTimeBuckets(raw)

  return {
    sourceId: raw.sourceId,
    itemId: raw.itemId,
    hourDistribution: buckets.hour,
    dayOfWeekDistribution: buckets.dayOfWeek,
    timeSlotDistribution: buckets.timeSlot,
    lastUpdated: raw.lastUpdated
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
