import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * getFrequentItems orders by execute_count and getRecentItems by last_executed,
 * but item_usage_stats declared only its composite primary key and a retention
 * expression index. Both queries were `SCAN item_usage_stats` plus
 * `USE TEMP B-TREE FOR ORDER BY` over a table that gains a row per distinct item
 * ever searched or executed (#677).
 *
 * This runs the real migration chain rather than a hand-built table, so it also
 * catches a schema change that never made it into a migration.
 */

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../resources/db/migrations'
)

let directory: string
let client: Client

async function queryPlan(sql: string): Promise<string> {
  const result = await client.execute(`EXPLAIN QUERY PLAN ${sql}`)
  return result.rows.map((row) => String(row.detail)).join(' | ')
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-usage-stats-idx-'))
  client = createClient({ url: `file:${join(directory, 'db.sqlite')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
}, 60_000)

afterAll(async () => {
  client?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('item_usage_stats ordering indexes', () => {
  it('creates both ordering indexes through the migration chain', async () => {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='item_usage_stats'"
    )
    const names = result.rows.map((row) => String(row.name))

    expect(names).toContain('item_usage_stats_execute_count_idx')
    expect(names).toContain('item_usage_stats_last_executed_idx')
  })

  it('serves the frequent-items query from an index rather than a sort', async () => {
    const plan = await queryPlan(
      'SELECT * FROM item_usage_stats ORDER BY execute_count DESC LIMIT 10'
    )

    expect(plan).toContain('item_usage_stats_execute_count_idx')
    expect(plan).not.toContain('TEMP B-TREE')
  })

  it('serves the recent-items query from an index rather than a sort', async () => {
    const plan = await queryPlan(
      'SELECT * FROM item_usage_stats ORDER BY last_executed DESC LIMIT 10'
    )

    expect(plan).toContain('item_usage_stats_last_executed_idx')
    expect(plan).not.toContain('TEMP B-TREE')
  })

  it('keeps the retention index the privacy owner depends on', async () => {
    // Control: the new indexes must be additive, not a replacement.
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='item_usage_stats'"
    )

    expect(result.rows.map((row) => String(row.name))).toContain('item_usage_stats_retention_idx')
  })
})
