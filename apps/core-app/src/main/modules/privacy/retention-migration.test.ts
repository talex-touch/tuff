import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyPrivacyMigrations,
  createPrivacyTestClient,
  getPrivacyMigrationNames
} from './retention-test-utils'

const MIGRATIONS_URL = new URL('../../../../resources/db/migrations/', import.meta.url)
const MIGRATIONS_FOLDER = fileURLToPath(MIGRATIONS_URL)

interface MigrationJournal {
  version: string
  dialect: string
  entries: Array<{ tag: string } & Record<string, unknown>>
}

async function stageMigrationChain(
  target: string,
  entryCount: number,
  lastMigrationOverride?: string
): Promise<void> {
  const journal = JSON.parse(
    await readFile(new URL('meta/_journal.json', MIGRATIONS_URL), 'utf8')
  ) as MigrationJournal
  const entries = journal.entries.slice(0, entryCount)
  await mkdir(join(target, 'meta'), { recursive: true })
  await writeFile(
    join(target, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries }, null, 2)
  )
  await Promise.all(
    entries.map((entry) =>
      copyFile(new URL(`${entry.tag}.sql`, MIGRATIONS_URL), join(target, `${entry.tag}.sql`))
    )
  )
  if (lastMigrationOverride !== undefined && entries.length > 0) {
    await writeFile(join(target, `${entries.at(-1)!.tag}.sql`), lastMigrationOverride)
  }
}

const EXPECTED_INDEXES = [
  'analytics_snapshots_retention_idx',
  'clipboard_history_retention_idx',
  'contextual_embeddings_retention_idx',
  'intelligence_context_sessions_retention_idx',
  'item_usage_stats_retention_idx',
  'ocr_jobs_retention_idx',
  'plugin_analytics_retention_idx',
  'query_completions_retention_idx',
  'recommendation_cache_retention_idx',
  'telemetry_upload_stats_retention_idx',
  'usage_logs_retention_idx',
  'usage_summary_retention_idx'
]

describe('privacy retention indexes migration', () => {
  it('extends the real migration chain without deleting existing rows', async () => {
    const { client } = await createPrivacyTestClient('migration')
    const migrations = await getPrivacyMigrationNames()
    expect(migrations.at(-1)).toBe('0034_privacy_retention_indexes.sql')
    await applyPrivacyMigrations(client, migrations.slice(0, -1))

    await client.execute(
      `INSERT INTO clipboard_history (type, content, timestamp, is_favorite)
       VALUES ('text', 'CANARY_MIGRATION_ROW', 1, 0)`
    )
    await client.execute(
      `INSERT INTO intelligence_context_sessions
        (id, owner, status, created_at, updated_at)
       VALUES ('CANARY_CONTEXT_ROW', 'assistant', 'archived', 1, 1)`
    )

    await applyPrivacyMigrations(client, migrations.slice(-1))

    const indexes = await client.execute(
      `SELECT name FROM sqlite_master
        WHERE type = 'index' AND name LIKE '%retention_idx'
        ORDER BY name`
    )
    expect(indexes.rows.map((row) => String(row.name))).toEqual(EXPECTED_INDEXES)

    const clipboard = await client.execute(
      `SELECT content, retention_protected FROM clipboard_history WHERE id = 1`
    )
    expect(clipboard.rows[0]).toMatchObject({
      content: 'CANARY_MIGRATION_ROW',
      retention_protected: 0
    })
    const context = await client.execute(
      `SELECT id, is_pinned FROM intelligence_context_sessions WHERE id = 'CANARY_CONTEXT_ROW'`
    )
    expect(context.rows[0]).toMatchObject({ id: 'CANARY_CONTEXT_ROW', is_pinned: 0 })

    const queryPlans = [
      {
        index: 'clipboard_history_retention_idx',
        sql: `SELECT id FROM clipboard_history
               WHERE timestamp < 10
                 AND COALESCE(is_favorite, 0) = 0
                 AND COALESCE(retention_protected, 0) = 0
                 AND (timestamp > -1 OR (timestamp = -1 AND id > 0))
               ORDER BY timestamp, id LIMIT 10`
      },
      {
        index: 'ocr_jobs_retention_idx',
        sql: `SELECT id FROM ocr_jobs
               WHERE status IN ('completed', 'failed', 'cancelled')
                 AND COALESCE(finished_at, queued_at) < 10
                 AND (COALESCE(finished_at, queued_at) > -1
                   OR (COALESCE(finished_at, queued_at) = -1 AND id > 0))
               ORDER BY COALESCE(finished_at, queued_at), id LIMIT 10`
      },
      {
        index: 'query_completions_retention_idx',
        sql: `SELECT id FROM query_completions
               WHERE last_completed < 10 ORDER BY last_completed, id LIMIT 10`
      },
      {
        index: 'contextual_embeddings_retention_idx',
        sql: `SELECT id FROM contextual_embeddings
               WHERE timestamp < 10 ORDER BY timestamp, id LIMIT 10`
      },
      {
        index: 'usage_logs_retention_idx',
        sql: `SELECT id FROM usage_logs WHERE timestamp < 10 ORDER BY timestamp, id LIMIT 10`
      },
      {
        index: 'usage_summary_retention_idx',
        sql: `SELECT rowid FROM usage_summary WHERE last_used < 10 ORDER BY last_used, rowid LIMIT 10`
      },
      {
        index: 'item_usage_stats_retention_idx',
        sql: `SELECT rowid FROM item_usage_stats
               WHERE MAX(COALESCE(last_searched, 0), COALESCE(last_executed, 0), COALESCE(last_cancelled, 0), updated_at) < 10
               ORDER BY MAX(COALESCE(last_searched, 0), COALESCE(last_executed, 0), COALESCE(last_cancelled, 0), updated_at), rowid LIMIT 10`
      },
      {
        index: 'idx_item_time_stats_updated',
        sql: `SELECT rowid FROM item_time_stats
               WHERE last_updated < 10
                 AND (last_updated > -1 OR (last_updated = -1 AND rowid > 0))
               ORDER BY last_updated, rowid LIMIT 10`
      },
      {
        index: 'idx_usage_trend_daily_day',
        sql: `SELECT rowid FROM usage_trend_daily
               WHERE day < 10
                 AND (day > -1 OR (day = -1 AND rowid > 0))
               ORDER BY day, rowid LIMIT 10`
      },
      {
        index: 'recommendation_cache_retention_idx',
        alsoIndexes: ['idx_recommendation_cache_expires'],
        sql: `SELECT rowid FROM recommendation_cache
               WHERE (created_at < 10 OR expires_at <= 20)
                 AND (MIN(created_at, expires_at) > -1
                   OR (MIN(created_at, expires_at) = -1 AND rowid > 0))
               ORDER BY MIN(created_at, expires_at), rowid LIMIT 10`
      },
      {
        index: 'intelligence_context_sessions_retention_idx',
        sql: `SELECT id FROM intelligence_context_sessions
               WHERE status IN ('archived', 'expired')
                 AND COALESCE(is_pinned, 0) = 0
                 AND updated_at < 10
                 AND (updated_at > -1 OR (updated_at = -1 AND id > ''))
               ORDER BY updated_at, id LIMIT 10`
      },
      {
        index: 'analytics_snapshots_retention_idx',
        sql: `SELECT id FROM analytics_snapshots
               WHERE timestamp < 10 ORDER BY timestamp, id LIMIT 10`
      },
      {
        index: 'plugin_analytics_retention_idx',
        sql: `SELECT id FROM plugin_analytics
               WHERE timestamp < 10 ORDER BY timestamp, id LIMIT 10`
      },
      {
        index: 'idx_analytics_report_queue_created_at',
        sql: `SELECT rowid FROM analytics_report_queue
               WHERE created_at < 10
                 AND (created_at > -1 OR (created_at = -1 AND rowid > 0))
               ORDER BY created_at, rowid LIMIT 10`
      },
      {
        index: 'idx_audit_timestamp',
        sql: `SELECT rowid FROM intelligence_audit_logs
               WHERE timestamp < 10
                 AND (timestamp > -1 OR (timestamp = -1 AND rowid > 0))
               ORDER BY timestamp, rowid LIMIT 10`
      },
      {
        index: 'telemetry_upload_stats_retention_idx',
        sql: `SELECT id FROM telemetry_upload_stats
               WHERE last_failure_at < 10 ORDER BY last_failure_at, id LIMIT 10`
      }
    ]
    for (const query of queryPlans) {
      const plan = await client.execute(`EXPLAIN QUERY PLAN ${query.sql}`)
      const detail = plan.rows.map((row) => String(row.detail)).join(' ')
      expect(detail, query.index).toContain(query.index)
      for (const index of 'alsoIndexes' in query ? (query.alsoIndexes ?? []) : []) {
        expect(detail, index).toContain(index)
      }
      if (
        query.index === 'clipboard_history_retention_idx' ||
        query.index === 'ocr_jobs_retention_idx' ||
        query.index === 'intelligence_context_sessions_retention_idx'
      ) {
        expect(detail, query.index).not.toContain('USE TEMP B-TREE')
      }
    }
  })

  it('applies the journaled chain to a fresh libSQL database', async () => {
    const { client } = await createPrivacyTestClient('migration-fresh')

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })

    const journalRows = await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    expect(Number(journalRows.rows[0]?.count)).toBe(35)
    const clipboardColumns = await client.execute(`PRAGMA table_info('clipboard_history')`)
    expect(clipboardColumns.rows.some((row) => row.name === 'retention_protected')).toBe(true)
    const contextColumns = await client.execute(
      `PRAGMA table_info('intelligence_context_sessions')`
    )
    expect(contextColumns.rows.some((row) => row.name === 'is_pinned')).toBe(true)
  })

  it('upgrades a journaled 0033 database while preserving existing rows', async () => {
    const { client, directory } = await createPrivacyTestClient('migration-upgrade')
    const stagedFolder = join(directory, 'migrations')
    await stageMigrationChain(stagedFolder, 34)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })
    await client.execute(
      `INSERT INTO clipboard_history (type, content, timestamp, is_favorite)
       VALUES ('text', 'CANARY_JOURNALED_UPGRADE', 1, 0)`
    )
    await client.execute(
      `INSERT INTO intelligence_context_sessions (id, owner, status, created_at, updated_at)
       VALUES ('journal-upgrade', 'assistant', 'archived', 1, 1)`
    )

    await stageMigrationChain(stagedFolder, 35)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })

    const clipboard = await client.execute(
      `SELECT content, retention_protected FROM clipboard_history WHERE content = 'CANARY_JOURNALED_UPGRADE'`
    )
    expect(clipboard.rows[0]).toMatchObject({
      content: 'CANARY_JOURNALED_UPGRADE',
      retention_protected: 0
    })
    const context = await client.execute(
      `SELECT is_pinned FROM intelligence_context_sessions WHERE id = 'journal-upgrade'`
    )
    expect(context.rows[0]?.is_pinned).toBe(0)
    const journalRows = await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    expect(Number(journalRows.rows[0]?.count)).toBe(35)
  })

  it('rolls back schema and journal state when 0034 fails mid-migration', async () => {
    const { client, directory } = await createPrivacyTestClient('migration-rollback')
    const stagedFolder = join(directory, 'migrations')
    await stageMigrationChain(stagedFolder, 34)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })
    await stageMigrationChain(
      stagedFolder,
      35,
      `ALTER TABLE clipboard_history ADD retention_protected integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX impossible_privacy_index ON missing_privacy_table (id);`
    )

    await expect(migrate(drizzle(client), { migrationsFolder: stagedFolder })).rejects.toThrow()

    const clipboardColumns = await client.execute(`PRAGMA table_info('clipboard_history')`)
    expect(clipboardColumns.rows.some((row) => row.name === 'retention_protected')).toBe(false)
    const contextColumns = await client.execute(
      `PRAGMA table_info('intelligence_context_sessions')`
    )
    expect(contextColumns.rows.some((row) => row.name === 'is_pinned')).toBe(false)
    const journalRows = await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    expect(Number(journalRows.rows[0]?.count)).toBe(34)
  })
})
