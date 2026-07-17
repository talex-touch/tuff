import { createClient, type Client } from '@libsql/client'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../../../../resources/db/migrations/0027_usage_stats_single_writer_repair.sql',
  import.meta.url
)

interface UsageStatsRow {
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

async function withTemporaryDatabase<T>(test: (client: Client) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-usage-stats-repair-'))
  let client: Client | undefined

  try {
    client = createClient({ url: `file:${join(directory, 'usage-stats.sqlite')}` })
    await client.execute(`
      CREATE TABLE item_usage_stats (
        source_id text NOT NULL,
        item_id text NOT NULL,
        source_type text NOT NULL,
        search_count integer NOT NULL,
        execute_count integer NOT NULL,
        cancel_count integer NOT NULL,
        last_searched integer,
        last_executed integer,
        last_cancelled integer,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        PRIMARY KEY (source_id, item_id)
      )
    `)
    await client.execute(`
      CREATE TABLE usage_summary (
        item_id text PRIMARY KEY NOT NULL,
        click_count integer NOT NULL,
        last_used integer NOT NULL
      )
    `)

    return await test(client)
  } finally {
    client?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function applyRepairMigration(client: Client): Promise<void> {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

async function insertUsageStats(client: Client, row: UsageStatsRow): Promise<void> {
  await client.execute({
    sql: `
      INSERT INTO item_usage_stats (
        source_id, item_id, source_type, search_count, execute_count, cancel_count,
        last_searched, last_executed, last_cancelled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      row.sourceId,
      row.itemId,
      row.sourceType,
      row.searchCount,
      row.executeCount,
      row.cancelCount,
      row.lastSearched,
      row.lastExecuted,
      row.lastCancelled,
      row.createdAt,
      row.updatedAt
    ]
  })
}

async function readUsageStats(client: Client): Promise<UsageStatsRow[]> {
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
    ORDER BY item_id, source_id
  `)

  return result.rows as unknown as UsageStatsRow[]
}

describe('0027 usage stats single-writer repair', () => {
  it('removes only proven phantom rows, conservatively caps counts, and is replay-safe', async () => {
    await withTemporaryDatabase(async (client) => {
      const canonicalRow: UsageStatsRow = {
        sourceId: 'app-provider',
        itemId: 'canonical-item',
        sourceType: 'application',
        searchCount: 17,
        executeCount: 9,
        cancelCount: 4,
        lastSearched: 1_784_000_001_000,
        lastExecuted: 1_784_000_002_000,
        lastCancelled: 1_784_000_003_000,
        createdAt: 1_784_000_004_000,
        updatedAt: 1_784_000_005_000
      }
      const phantomRow: UsageStatsRow = {
        sourceId: 'application',
        itemId: 'canonical-item',
        sourceType: 'application',
        searchCount: 12,
        executeCount: 8,
        cancelCount: 2,
        lastSearched: 1_784_000_006_000,
        lastExecuted: 1_784_000_007_000,
        lastCancelled: 1_784_000_008_000,
        createdAt: 1_784_000_009_000,
        updatedAt: 1_784_000_010_000
      }
      const providerNamedForType: UsageStatsRow = {
        sourceId: 'file',
        itemId: 'equal-type-item',
        sourceType: 'file',
        searchCount: 6,
        executeCount: 7,
        cancelCount: 3,
        lastSearched: 1_784_000_011_000,
        lastExecuted: 1_784_000_012_000,
        lastCancelled: 1_784_000_013_000,
        createdAt: 1_784_000_014_000,
        updatedAt: 1_784_000_015_000
      }
      const underCountedRow: UsageStatsRow = {
        sourceId: 'browser-provider',
        itemId: 'under-count-item',
        sourceType: 'browser',
        searchCount: 8,
        executeCount: 2,
        cancelCount: 5,
        lastSearched: 1_784_000_016_000,
        lastExecuted: 1_784_000_017_000,
        lastCancelled: 1_784_000_018_000,
        createdAt: 1_784_000_019_000,
        updatedAt: 1_784_000_020_000
      }
      const noSummaryRow: UsageStatsRow = {
        sourceId: 'plugin-provider',
        itemId: 'no-summary-item',
        sourceType: 'plugin',
        searchCount: 1,
        executeCount: 11,
        cancelCount: 9,
        lastSearched: 1_784_000_021_000,
        lastExecuted: 1_784_000_022_000,
        lastCancelled: 1_784_000_023_000,
        createdAt: 1_784_000_024_000,
        updatedAt: 1_784_000_025_000
      }

      for (const row of [
        canonicalRow,
        phantomRow,
        providerNamedForType,
        underCountedRow,
        noSummaryRow
      ]) {
        await insertUsageStats(client, row)
      }
      await client.execute({
        sql: `
          INSERT INTO usage_summary (item_id, click_count, last_used)
          VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
        `,
        args: [
          'canonical-item',
          3,
          1_784_000_030_000,
          'equal-type-item',
          5,
          1_784_000_031_000,
          'under-count-item',
          10,
          1_784_000_032_000
        ]
      })

      await applyRepairMigration(client)

      const repairedRows = await readUsageStats(client)
      expect(repairedRows).toEqual([
        { ...canonicalRow, executeCount: 3 },
        { ...providerNamedForType, executeCount: 5 },
        noSummaryRow,
        underCountedRow
      ])

      await applyRepairMigration(client)
      expect(await readUsageStats(client)).toEqual(repairedRows)
    })
  })
})
