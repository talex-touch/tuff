import type { DbUtils } from '../../../db/utils'
import { createClient, type Client } from '@libsql/client'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDbUtils } from '../../../db/utils'
import * as schema from '../../../db/schema'
import { UsageSummaryService } from './usage-summary-service'

const getStartupDegradeWindowRemainingMsMock = vi.hoisted(() => vi.fn((): number => 0))

// The real helper is uptime-based and the vitest worker usually still sits
// inside the 120s startup degrade window; pin it so scheduling is deterministic.
vi.mock('../../../db/runtime-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../db/runtime-flags')>()
  return {
    ...actual,
    getStartupDegradeWindowRemainingMs: getStartupDegradeWindowRemainingMsMock
  }
})

function spyOnPollingService() {
  const polling = PollingService.getInstance()
  return {
    isRegistered: vi.spyOn(polling, 'isRegistered').mockReturnValue(false),
    register: vi.spyOn(polling, 'register').mockImplementation(() => {}),
    start: vi.spyOn(polling, 'start').mockImplementation(() => {}),
    unregister: vi.spyOn(polling, 'unregister').mockImplementation(() => {}),
    restore(): void {
      this.isRegistered.mockRestore()
      this.register.mockRestore()
      this.start.mockRestore()
      this.unregister.mockRestore()
    }
  }
}

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
  it('leaves both usage statistics and time distributions alone during maintenance', async () => {
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
      const service = new UsageSummaryService(createDbUtils(db), { autoCleanup: true })
      expect(service.getConfig().autoCleanup).toBe(false)
      service.updateConfig({ autoCleanup: true })
      expect(service.getConfig().autoCleanup).toBe(false)
      const usageStatsBeforeMaintenance = await readUsageStats(client)

      await service.runSummary()

      expect(await readUsageStats(client)).toEqual(usageStatsBeforeMaintenance)

      // `item_time_stats` is accumulated by the usage drain now. Scheduled
      // maintenance must NOT re-derive it from `usage_logs`: that rewrite wrote
      // absolute values, so a retention pass that pruned the logs silently
      // erased the accumulated history with it. The rebuild survives only as
      // the explicitly forced repair path.
      const timeStats = await client.execute('SELECT * FROM item_time_stats')
      expect(timeStats.rows).toEqual([])
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('defers the initial run past the startup degrade window remainder', () => {
    const polling = spyOnPollingService()
    try {
      // Startup write-storm gate (R4): 90s of the degrade window remain at start().
      getStartupDegradeWindowRemainingMsMock.mockReturnValue(90_000)
      const service = new UsageSummaryService({} as DbUtils)
      service.start()

      expect(polling.register).toHaveBeenCalledWith(
        'usage-summary.run',
        expect.any(Function),
        expect.objectContaining({
          interval: 24 * 60 * 60 * 1000,
          unit: 'milliseconds',
          initialDelayMs: 90_000 + 30_000
        })
      )
      service.stop()
    } finally {
      getStartupDegradeWindowRemainingMsMock.mockReturnValue(0)
      polling.restore()
    }
  })

  it('keeps the historic 30s initial delay and 24h cadence outside the window', () => {
    const polling = spyOnPollingService()
    try {
      getStartupDegradeWindowRemainingMsMock.mockReturnValue(0)
      const service = new UsageSummaryService({} as DbUtils)
      service.start()

      expect(polling.register).toHaveBeenCalledWith(
        'usage-summary.run',
        expect.any(Function),
        expect.objectContaining({
          interval: 24 * 60 * 60 * 1000,
          unit: 'milliseconds',
          initialDelayMs: 30_000
        })
      )
      service.stop()
    } finally {
      polling.restore()
    }
  })
})
