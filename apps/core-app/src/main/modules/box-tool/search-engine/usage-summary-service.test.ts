import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDbUtils } from '../../../db/utils'
import * as schema from '../../../db/schema'
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
  )
]

interface UsageStatsSnapshot {
  sourceId: string
  itemId: string
  sourceType: string
  searchCount: number
  executeCount: number
  cancelCount: number
  lastSearched: number | null
  lastExecuted: number | null
  lastCancelled: number | null
  createdAt: number
  updatedAt: number
}

async function applyMigration(client: Client, migrationUrl: URL): Promise<void> {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

async function readUsageStats(client: Client): Promise<UsageStatsSnapshot[]> {
  const result = await client.execute(`
    SELECT
      source_id AS sourceId,
      item_id AS itemId,
      source_type AS sourceType,
      search_count AS searchCount,
      execute_count AS executeCount,
      cancel_count AS cancelCount,
      last_searched AS lastSearched,
      last_executed AS lastExecuted,
      last_cancelled AS lastCancelled,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM item_usage_stats
    ORDER BY source_id, item_id
  `)

  return result.rows as unknown as UsageStatsSnapshot[]
}

describe('UsageSummaryService', () => {
  it('rebuilds time distributions without changing provider-keyed usage statistics', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-usage-summary-service-'))
    let client: Client | undefined

    try {
      client = createClient({ url: `file:${join(directory, 'usage-summary.sqlite')}` })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }

      const executedAt = new Date(2026, 6, 16, 9, 15, 0, 0).getTime()
      const existingUsageStats: UsageStatsSnapshot = {
        sourceId: 'app-provider',
        itemId: 'app-item',
        sourceType: 'application',
        searchCount: 13,
        executeCount: 1,
        cancelCount: 2,
        lastSearched: 1_783_000_001_000,
        lastExecuted: 1_783_000_002_000,
        lastCancelled: 1_783_000_003_000,
        createdAt: 1_783_000_004_000,
        updatedAt: 1_783_000_005_000
      }
      await client.execute({
        sql: `
          INSERT INTO item_usage_stats (
            source_id, item_id, source_type, search_count, execute_count, cancel_count,
            last_searched, last_executed, last_cancelled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          existingUsageStats.sourceId,
          existingUsageStats.itemId,
          existingUsageStats.sourceType,
          existingUsageStats.searchCount,
          existingUsageStats.executeCount,
          existingUsageStats.cancelCount,
          existingUsageStats.lastSearched,
          existingUsageStats.lastExecuted,
          existingUsageStats.lastCancelled,
          existingUsageStats.createdAt,
          existingUsageStats.updatedAt
        ]
      })
      await client.execute({
        sql: `
          INSERT INTO usage_logs (item_id, source, action, timestamp)
          VALUES (?, ?, ?, ?)
        `,
        args: ['app-item', 'application', 'execute', executedAt]
      })

      const db = drizzle(client, { schema })
      const service = new UsageSummaryService(createDbUtils(db), { autoCleanup: false })
      const usageStatsBeforeMaintenance = await readUsageStats(client)
      const storedExecution = await db
        .select({ timestamp: schema.usageLogs.timestamp })
        .from(schema.usageLogs)
        .get()
      const executedHour = storedExecution!.timestamp.getHours()
      const executedDay = storedExecution!.timestamp.getDay()
      const hourDistribution = Array.from({ length: 24 }, (_, hour) =>
        hour === executedHour ? 1 : 0
      )
      const dayOfWeekDistribution = Array.from({ length: 7 }, (_, day) =>
        day === executedDay ? 1 : 0
      )
      const timeSlotDistribution = {
        morning: executedHour >= 6 && executedHour < 12 ? 1 : 0,
        afternoon: executedHour >= 12 && executedHour < 18 ? 1 : 0,
        evening: executedHour >= 18 && executedHour < 22 ? 1 : 0,
        night: executedHour < 6 || executedHour >= 22 ? 1 : 0
      }

      await service.runSummary()

      expect(await readUsageStats(client)).toEqual(usageStatsBeforeMaintenance)
      const timeStats = await client.execute(`
        SELECT
          source_id AS sourceId,
          item_id AS itemId,
          hour_distribution AS hourDistribution,
          day_of_week_distribution AS dayOfWeekDistribution,
          time_slot_distribution AS timeSlotDistribution
        FROM item_time_stats
      `)
      expect(timeStats.rows).toEqual([
        {
          sourceId: 'application',
          itemId: 'app-item',
          hourDistribution: JSON.stringify(hourDistribution),
          dayOfWeekDistribution: JSON.stringify(dayOfWeekDistribution),
          timeSlotDistribution: JSON.stringify(timeSlotDistribution)
        }
      ])
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
