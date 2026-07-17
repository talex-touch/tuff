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
      expect(
        (
          await client.execute(`
            SELECT item_id AS itemId, source, action
            FROM usage_logs
          `)
        ).rows
      ).toEqual([{ itemId: 'app-item', source: 'application', action: 'execute' }])

      await new UsageSummaryService(dbUtils, { autoCleanup: false }).runSummary()

      expect((await readUsageStats()).rows).toEqual(expectedUsageStats)
    } finally {
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
