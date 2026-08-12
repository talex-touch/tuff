import type { TuffItem } from '@talex-touch/utils'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { createDbUtils } from '../../../db/utils'
import { SearchUsageService } from './search-usage-service'
import { TimeStatsAggregator } from './time-stats-aggregator'
import { UsageSummaryService } from './usage-summary-service'

const schemaMigrationUrls = [
  new URL('../../../../../resources/db/migrations/0000_whole_mister_fear.sql', import.meta.url),
  new URL('../../../../../resources/db/migrations/0005_orange_wiccan.sql', import.meta.url),
  new URL(
    '../../../../../resources/db/migrations/0007_remarkable_silver_sable.sql',
    import.meta.url
  ),
  new URL(
    '../../../../../resources/db/migrations/0011_add_recommendation_tables.sql',
    import.meta.url
  ),
  new URL('../../../../../resources/db/migrations/0019_usage_trend_daily.sql', import.meta.url)
]

const item: TuffItem = {
  id: 'app-item',
  kind: 'app',
  render: { basic: { title: 'Open app' }, mode: 'default' },
  scoring: { final: 1 },
  source: { id: 'application-provider', name: 'Application provider', type: 'application' }
}

async function applyMigration(client: Client, migrationUrl: URL): Promise<void> {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

describe('SearchUsageService execution persistence', () => {
  it('writes one provider-keyed execution and leaves it unchanged after maintenance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-service-'))
    let client: Client | undefined

    try {
      client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const db = drizzle(client, { schema })
      const dbUtils = createDbUtils(db)
      const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
      usageService.initialize(db)

      await usageService.recordExecute('execute-session', item, item.id)
      await usageService.flush()

      const expectedUsageStats = [
        {
          sourceId: 'application-provider',
          itemId: 'app-item',
          sourceType: 'application',
          executeCount: 1
        }
      ]
      const readUsageStats = () =>
        client!.execute(`
          SELECT
            source_id AS sourceId,
            item_id AS itemId,
            source_type AS sourceType,
            execute_count AS executeCount
          FROM item_usage_stats
          ORDER BY source_id, item_id
        `)

      expect((await readUsageStats()).rows).toEqual(expectedUsageStats)
      expect(
        (
          await client.execute(`
            SELECT item_id AS itemId, click_count AS clickCount
            FROM usage_summary
          `)
        ).rows
      ).toEqual([{ itemId: 'app-item', clickCount: 1 }])
      // usage_logs.source carries the provider id, the same key
      // item_usage_stats / item_time_stats / usage_trend_daily use — the time
      // aggregator copies this column into item_time_stats.sourceId, and a
      // source TYPE here makes every later lookup miss.
      expect(
        (
          await client.execute(`
            SELECT item_id AS itemId, source, action
            FROM usage_logs
          `)
        ).rows
      ).toEqual([{ itemId: 'app-item', source: 'application-provider', action: 'execute' }])
      expect(
        (
          await client.execute(`
            SELECT source_id AS sourceId, item_id AS itemId, execute_count AS executeCount
            FROM usage_trend_daily
          `)
        ).rows
      ).toEqual([{ sourceId: 'application-provider', itemId: 'app-item', executeCount: 1 }])

      await new UsageSummaryService(dbUtils, { autoCleanup: false }).runSummary()

      expect((await readUsageStats()).rows).toEqual(expectedUsageStats)
    } finally {
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accumulates time stats on the drain path under the key the candidate lookup joins on', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-time-stats-'))
    let client: Client | undefined

    try {
      client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const db = drizzle(client, { schema })
      const dbUtils = createDbUtils(db)
      const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
      usageService.initialize(db)

      // No aggregator run: the usage drain owns item_time_stats now.
      await usageService.recordExecute('time-stats-session', item, item.id)
      await usageService.flush()
      await dbWriteScheduler.drain()

      // The exact lookup getTimeBasedTopItems performs: item_time_stats rows
      // are re-read through item_usage_stats, and a candidate only exists when
      // both tables agree on the source key.
      const timeStats = await dbUtils.getAllItemTimeStats()
      const usageStats = await dbUtils.getUsageStatsBatch(
        timeStats.map(({ sourceId, itemId }) => ({ sourceId, itemId }))
      )

      expect(timeStats.map((row) => row.sourceId)).toEqual(['application-provider'])
      expect(usageStats).toHaveLength(1)

      const hourDistribution = JSON.parse(timeStats[0].hourDistribution) as number[]
      const dayOfWeekDistribution = JSON.parse(timeStats[0].dayOfWeekDistribution) as number[]
      const timeSlotDistribution = JSON.parse(timeStats[0].timeSlotDistribution) as Record<
        string,
        number
      >
      const now = new Date()

      expect(hourDistribution).toHaveLength(24)
      expect(hourDistribution[now.getHours()]).toBe(1)
      expect(dayOfWeekDistribution[now.getDay()]).toBe(1)
      expect(Object.values(timeSlotDistribution).reduce((a, b) => a + b, 0)).toBe(1)

      // A second execution adds to the buckets instead of replacing them.
      await usageService.recordExecute('time-stats-session', item, item.id)
      await usageService.flush()
      await dbWriteScheduler.drain()

      const [updated] = await dbUtils.getAllItemTimeStats()
      expect((JSON.parse(updated.hourDistribution) as number[])[now.getHours()]).toBe(2)
    } finally {
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps accumulated time distributions after usage logs are pruned', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-time-stats-prune-'))
    let client: Client | undefined

    try {
      client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const db = drizzle(client, { schema })
      const dbUtils = createDbUtils(db)
      const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
      usageService.initialize(db)

      await usageService.recordExecute('retention-session', item, item.id)
      await usageService.flush()
      await dbWriteScheduler.drain()

      const before = await dbUtils.getAllItemTimeStats()
      expect(before).toHaveLength(1)

      // Privacy retention deletes the raw logs the old full rebuild derived
      // these distributions from.
      await client.execute('DELETE FROM usage_logs')
      expect((await client.execute('SELECT COUNT(*) AS count FROM usage_logs')).rows[0]).toEqual({
        count: 0
      })

      // Scheduled maintenance must not rebuild (and therefore not erase) them.
      await new UsageSummaryService(dbUtils, { autoCleanup: false }).runSummary()
      await dbWriteScheduler.drain()

      const after = await dbUtils.getAllItemTimeStats()
      expect(after).toHaveLength(1)
      expect(after[0].hourDistribution).toBe(before[0].hourDistribution)
      expect(after[0].timeSlotDistribution).toBe(before[0].timeSlotDistribution)
    } finally {
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('still rebuilds from logs when the repair path is explicitly forced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-time-stats-repair-'))
    let client: Client | undefined

    try {
      client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const db = drizzle(client, { schema })
      const dbUtils = createDbUtils(db)
      const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
      usageService.initialize(db)

      await usageService.recordExecute('repair-session', item, item.id)
      await usageService.flush()
      await dbWriteScheduler.drain()

      // Corrupt the accumulated row, then repair it from the surviving logs.
      await client.execute(
        `UPDATE item_time_stats SET hour_distribution = '${JSON.stringify(
          Array.from({ length: 24 }, () => 99)
        )}'`
      )

      await new TimeStatsAggregator(dbUtils).aggregateTimeStats({ force: true })
      await dbWriteScheduler.drain()

      const [row] = await dbUtils.getAllItemTimeStats()
      const hourDistribution = JSON.parse(row.hourDistribution) as number[]
      expect(hourDistribution[new Date().getHours()]).toBe(1)
      expect(hourDistribution.filter((count) => count === 99)).toHaveLength(0)
    } finally {
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accumulates the same distribution a forced rebuild derives from the same logs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-time-stats-parity-'))
    let client: Client | undefined

    try {
      // shouldAdvanceTime keeps the write scheduler's own timers running while
      // the clock is moved between executions.
      vi.useFakeTimers({ shouldAdvanceTime: true })

      client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const db = drizzle(client, { schema })
      const dbUtils = createDbUtils(db)
      const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
      usageService.initialize(db)

      // Spread over hours, slots and weekdays, across several flushes so the
      // incremental path has to add batches together.
      for (const localTime of [
        '2026-05-04T09:15:00',
        '2026-05-04T09:40:00',
        '2026-05-04T14:05:00',
        '2026-05-05T21:30:00',
        '2026-05-09T02:10:00'
      ]) {
        vi.setSystemTime(new Date(localTime))
        await usageService.recordExecute('parity-session', item, item.id)
        await usageService.flush()
      }
      // A displayed-but-not-executed result: neither path may count it.
      await usageService.recordDisplayedResults([item])
      await usageService.flush()
      await dbWriteScheduler.drain()

      const [accumulated] = await dbUtils.getAllItemTimeStats()

      await new TimeStatsAggregator(dbUtils).aggregateTimeStats({ force: true })
      await dbWriteScheduler.drain()

      const [rebuilt] = await dbUtils.getAllItemTimeStats()

      expect(JSON.parse(rebuilt.hourDistribution)).toEqual(JSON.parse(accumulated.hourDistribution))
      expect(JSON.parse(rebuilt.dayOfWeekDistribution)).toEqual(
        JSON.parse(accumulated.dayOfWeekDistribution)
      )
      expect(JSON.parse(rebuilt.timeSlotDistribution)).toEqual(
        JSON.parse(accumulated.timeSlotDistribution)
      )
      expect((JSON.parse(rebuilt.hourDistribution) as number[]).reduce((a, b) => a + b, 0)).toBe(5)
    } finally {
      vi.useRealTimers()
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('falls back to exactly one direct usage increment before the queue is initialized', async () => {
    const incrementUsageStats = vi.fn(async () => undefined)
    const fallbackDbUtils = {
      addUsageLog: vi.fn(async () => undefined),
      incrementUsageSummary: vi.fn(async () => undefined),
      incrementUsageStats,
      incrementUsageTrendDaily: vi.fn(async () => undefined)
    }
    const usageService = new SearchUsageService({ getDbUtils: () => fallbackDbUtils as never })

    await usageService.recordExecute('fallback-session', item, item.id)

    expect(incrementUsageStats).toHaveBeenCalledTimes(1)
    expect(incrementUsageStats).toHaveBeenCalledWith(
      'application-provider',
      'app-item',
      'application',
      'execute'
    )
  })
})
