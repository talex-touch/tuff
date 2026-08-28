import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// This file drives a real libsql migration chain. It runs in 549ms here, but on a CI
// runner -- fewer cores, the whole suite in parallel workers -- it went past vitest's 5s
// default and timed out (#1596). Raised per file rather than globally so a genuine hang
// elsewhere still fails fast.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import {
  applyPrivacyMigrations,
  createPrivacyTestClient,
  getPrivacyMigrationNames
} from './retention-test-utils'

const MIGRATIONS_URL = new URL('../../../../resources/db/migrations/', import.meta.url)
const RETENTION_INDEXES_MIGRATION = '0034_privacy_retention_indexes.sql'
const ORCHESTRATOR_RETENTION_INDEX_MIGRATION = '0041_ai_orchestrator_run_retention.sql'
const ORCHESTRATOR_RETENTION_INDEX = 'idx_ai_orchestrator_runs_retention'
const STALE_ORCHESTRATOR_RETENTION_INDEX_SQL = `CREATE INDEX \`${ORCHESTRATOR_RETENTION_INDEX}\`
ON \`ai_orchestrator_runs\` (\`created_at\`, \`id\`)
WHERE \`status\` = 'running'`
const ORCHESTRATOR_RETENTION_QUERY = `SELECT r.id
FROM ai_orchestrator_runs AS r INDEXED BY idx_ai_orchestrator_runs_retention
WHERE r.status IN ('completed', 'failed', 'cancelled', 'interrupted')
  AND r.updated_at < 10
  AND NOT EXISTS (
    SELECT 1
    FROM ai_orchestrator_events fresh_event
    WHERE fresh_event.run_id = r.id
      AND fresh_event.created_at >= 10
  )
  AND (r.updated_at > -1 OR (r.updated_at = -1 AND r.id > ''))
ORDER BY r.updated_at, r.id
LIMIT 10`
const MIGRATIONS_FOLDER = fileURLToPath(MIGRATIONS_URL)

interface MigrationJournal {
  version: string
  dialect: string
  entries: Array<{ tag: string; when: number } & Record<string, unknown>>
}

async function readMigrationJournal(): Promise<MigrationJournal> {
  return JSON.parse(
    await readFile(new URL('meta/_journal.json', MIGRATIONS_URL), 'utf8')
  ) as MigrationJournal
}

function normalizeSql(sql: unknown): string {
  return String(sql ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function stageMigrationChain(
  target: string,
  entryCount: number,
  lastMigrationOverride?: string
): Promise<void> {
  const journal = await readMigrationJournal()
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
    // Target the retention-indexes migration by name rather than assuming it is
    // last. Pinning it to the tail meant that once a later migration landed this
    // suite would keep passing while exercising a different one entirely --
    // worse than failing, which is what it did when 0035 and 0036 arrived.
    const target = migrations.indexOf(RETENTION_INDEXES_MIGRATION)
    expect(
      target,
      `${RETENTION_INDEXES_MIGRATION} is missing from the chain`
    ).toBeGreaterThanOrEqual(0)
    await applyPrivacyMigrations(client, migrations.slice(0, target))

    await client.execute(
      `INSERT INTO clipboard_history (type, content, timestamp, is_favorite)
       VALUES ('text', 'CANARY_MIGRATION_ROW', 1, 0)`
    )
    await client.execute(
      `INSERT INTO intelligence_context_sessions
        (id, owner, status, created_at, updated_at)
       VALUES ('CANARY_CONTEXT_ROW', 'assistant', 'archived', 1, 1)`
    )

    await applyPrivacyMigrations(client, [migrations[target]!])

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
    // Derived from the journal: a hardcoded count fails on every new migration
    // while proving nothing about whether they all applied.
    expect(Number(journalRows.rows[0]?.count)).toBe((await getPrivacyMigrationNames()).length)
    const clipboardColumns = await client.execute(`PRAGMA table_info('clipboard_history')`)
    expect(clipboardColumns.rows.some((row) => row.name === 'retention_protected')).toBe(true)
    const contextColumns = await client.execute(
      `PRAGMA table_info('intelligence_context_sessions')`
    )
    expect(contextColumns.rows.some((row) => row.name === 'is_pinned')).toBe(true)
  })

  it('replaces a conflicting 0040 retention index and preserves event cascade behavior', async () => {
    const { client, directory } = await createPrivacyTestClient('orchestrator-retention-migration')
    const stagedFolder = join(directory, 'migrations')
    const migrations = await getPrivacyMigrationNames()
    const target = migrations.indexOf(ORCHESTRATOR_RETENTION_INDEX_MIGRATION)
    expect(
      target,
      `${ORCHESTRATOR_RETENTION_INDEX_MIGRATION} is missing from the chain`
    ).toBeGreaterThan(0)
    expect(migrations[target - 1]).toBe('0040_conversation_sync_state_migration.sql')

    await stageMigrationChain(stagedFolder, target)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })
    const journalBeforeUpgrade = await client.execute(
      'SELECT COUNT(*) AS count FROM __drizzle_migrations'
    )
    expect(Number(journalBeforeUpgrade.rows[0]?.count)).toBe(target)

    await client.execute(
      `INSERT INTO ai_orchestrator_runs
        (id, session_id, objective, profile_id, runtime_provider, cwd, status, output,
         error, usage, metadata, parent_run_id, delegation_plan, approval_reason,
         created_at, started_at, completed_at, updated_at)
       VALUES
        ('CANARY_ORCHESTRATOR_RUN', 'session-canary', 'verify retention migration',
         'profile-canary', 'codex', '/tmp', 'completed', 'CANARY_OUTPUT', 'CANARY_ERROR',
         '{"tokens":7}', '{"marker":"CANARY_METADATA"}', 'CANARY_PARENT_RUN',
         '{"steps":["CANARY_DELEGATION"]}', 'CANARY_APPROVAL', 1, 2, 3, 4)`
    )
    await client.execute(
      `INSERT INTO ai_orchestrator_events
        (id, run_id, seq, type, level, payload, created_at)
       VALUES
        ('CANARY_ORCHESTRATOR_EVENT', 'CANARY_ORCHESTRATOR_RUN', 1, 'trace', 'info',
         '{"marker":"CANARY_EVENT"}', 5)`
    )
    await client.execute(STALE_ORCHESTRATOR_RETENTION_INDEX_SQL)

    await expect(
      client.execute(`EXPLAIN QUERY PLAN ${ORCHESTRATOR_RETENTION_QUERY}`)
    ).rejects.toThrow(/no query solution/i)

    await stageMigrationChain(stagedFolder, target + 1)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })

    const journalRows = await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    expect(Number(journalRows.rows[0]?.count)).toBe(target + 1)

    const run = await client.execute(
      `SELECT session_id, objective, profile_id, runtime_provider, cwd, status, output,
              error, usage, metadata, parent_run_id, delegation_plan, approval_reason,
              created_at, started_at, completed_at, updated_at
       FROM ai_orchestrator_runs WHERE id = 'CANARY_ORCHESTRATOR_RUN'`
    )
    expect(run.rows[0]).toMatchObject({
      session_id: 'session-canary',
      objective: 'verify retention migration',
      profile_id: 'profile-canary',
      runtime_provider: 'codex',
      cwd: '/tmp',
      status: 'completed',
      output: 'CANARY_OUTPUT',
      error: 'CANARY_ERROR',
      usage: '{"tokens":7}',
      metadata: '{"marker":"CANARY_METADATA"}',
      parent_run_id: 'CANARY_PARENT_RUN',
      delegation_plan: '{"steps":["CANARY_DELEGATION"]}',
      approval_reason: 'CANARY_APPROVAL',
      created_at: 1,
      started_at: 2,
      completed_at: 3,
      updated_at: 4
    })
    const event = await client.execute(
      `SELECT run_id, seq, type, level, payload, created_at
       FROM ai_orchestrator_events WHERE id = 'CANARY_ORCHESTRATOR_EVENT'`
    )
    expect(event.rows[0]).toMatchObject({
      run_id: 'CANARY_ORCHESTRATOR_RUN',
      seq: 1,
      type: 'trace',
      level: 'info',
      payload: '{"marker":"CANARY_EVENT"}',
      created_at: 5
    })

    const runColumns = await client.execute(`PRAGMA table_info('ai_orchestrator_runs')`)
    expect(runColumns.rows.map((row) => String(row.name))).toEqual(
      expect.arrayContaining(['parent_run_id', 'delegation_plan', 'approval_reason'])
    )
    const eventForeignKeys = await client.execute(
      `PRAGMA foreign_key_list('ai_orchestrator_events')`
    )
    expect(eventForeignKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'ai_orchestrator_runs',
          from: 'run_id',
          to: 'id',
          on_delete: 'CASCADE'
        })
      ])
    )

    const index = await client.execute(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'index' AND name = '${ORCHESTRATOR_RETENTION_INDEX}'`
    )
    expect(index.rows).toHaveLength(1)
    expect(index.rows[0]?.name).toBe(ORCHESTRATOR_RETENTION_INDEX)
    expect(normalizeSql(index.rows[0]?.sql)).toBe(
      `CREATE INDEX \`${ORCHESTRATOR_RETENTION_INDEX}\` ON \`ai_orchestrator_runs\` ` +
        "(\`updated_at\`, \`id\`) WHERE \`status\` IN ('completed', 'failed', 'cancelled', 'interrupted')"
    )

    const indexColumns = await client.execute(
      `PRAGMA index_xinfo('${ORCHESTRATOR_RETENTION_INDEX}')`
    )
    expect(
      indexColumns.rows
        .filter((row) => Number(row.key) === 1)
        .map((row) => ({ name: String(row.name), descending: Number(row.desc) }))
    ).toEqual([
      { name: 'updated_at', descending: 0 },
      { name: 'id', descending: 0 }
    ])

    const plan = await client.execute(`EXPLAIN QUERY PLAN ${ORCHESTRATOR_RETENTION_QUERY}`)
    const detail = plan.rows.map((row) => String(row.detail)).join(' ')
    expect(detail).toContain(ORCHESTRATOR_RETENTION_INDEX)
    expect(detail).not.toContain('USE TEMP B-TREE')
    const retentionRows = await client.execute(ORCHESTRATOR_RETENTION_QUERY)
    expect(retentionRows.rows.map((row) => String(row.id))).toEqual(['CANARY_ORCHESTRATOR_RUN'])

    const deletedRun = await client.execute(
      `DELETE FROM ai_orchestrator_runs WHERE id = 'CANARY_ORCHESTRATOR_RUN'`
    )
    expect(Number(deletedRun.rowsAffected)).toBe(1)
    const remainingCanaries = await client.execute(
      `SELECT
         (SELECT COUNT(*) FROM ai_orchestrator_runs
          WHERE id = 'CANARY_ORCHESTRATOR_RUN') AS run_count,
         (SELECT COUNT(*) FROM ai_orchestrator_events
          WHERE id = 'CANARY_ORCHESTRATOR_EVENT') AS event_count`
    )
    expect(remainingCanaries.rows[0]).toMatchObject({ run_count: 0, event_count: 0 })
  })

  it('rolls back 0041 schema, data, index, and journal changes atomically', async () => {
    const { client, directory } = await createPrivacyTestClient(
      'orchestrator-retention-migration-rollback'
    )
    const stagedFolder = join(directory, 'migrations')
    const migrations = await getPrivacyMigrationNames()
    const target = migrations.indexOf(ORCHESTRATOR_RETENTION_INDEX_MIGRATION)
    expect(
      target,
      `${ORCHESTRATOR_RETENTION_INDEX_MIGRATION} is missing from the chain`
    ).toBeGreaterThan(0)

    const journal = await readMigrationJournal()
    const previousEntry = journal.entries[target - 1]
    expect(previousEntry?.tag).toBe('0040_conversation_sync_state_migration')

    await stageMigrationChain(stagedFolder, target)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })
    await client.execute(
      `INSERT INTO ai_orchestrator_runs
        (id, session_id, objective, profile_id, runtime_provider, cwd, status, output,
         created_at, updated_at)
       VALUES
        ('ROLLBACK_ORCHESTRATOR_RUN', 'rollback-session', 'CANARY_OBJECTIVE_BEFORE',
         'rollback-profile', 'codex', '/tmp', 'completed', 'CANARY_OUTPUT_BEFORE', 1, 2)`
    )
    await client.execute(
      `INSERT INTO ai_orchestrator_events
        (id, run_id, seq, type, level, payload, created_at)
       VALUES
        ('ROLLBACK_ORCHESTRATOR_EVENT', 'ROLLBACK_ORCHESTRATOR_RUN', 1, 'trace', 'info',
         '{"marker":"CANARY_EVENT_BEFORE"}', 3)`
    )
    await client.execute(STALE_ORCHESTRATOR_RETENTION_INDEX_SQL)

    const migrationSql = await readFile(
      new URL(ORCHESTRATOR_RETENTION_INDEX_MIGRATION, MIGRATIONS_URL),
      'utf8'
    )
    await stageMigrationChain(
      stagedFolder,
      target + 1,
      `${migrationSql}
--> statement-breakpoint
ALTER TABLE ai_orchestrator_runs ADD COLUMN rollback_probe text;
--> statement-breakpoint
UPDATE ai_orchestrator_runs
SET objective = 'CANARY_OBJECTIVE_MUTATED', output = 'CANARY_OUTPUT_MUTATED'
WHERE id = 'ROLLBACK_ORCHESTRATOR_RUN';
--> statement-breakpoint
CREATE INDEX impossible_orchestrator_retention_index ON missing_orchestrator_table (id);`
    )

    await expect(migrate(drizzle(client), { migrationsFolder: stagedFolder })).rejects.toThrow(
      /missing_orchestrator_table/
    )

    const index = await client.execute(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'index' AND name = '${ORCHESTRATOR_RETENTION_INDEX}'`
    )
    expect(index.rows).toHaveLength(1)
    expect(index.rows[0]?.name).toBe(ORCHESTRATOR_RETENTION_INDEX)
    expect(normalizeSql(index.rows[0]?.sql)).toBe(
      normalizeSql(STALE_ORCHESTRATOR_RETENTION_INDEX_SQL)
    )
    const indexColumns = await client.execute(
      `PRAGMA index_xinfo('${ORCHESTRATOR_RETENTION_INDEX}')`
    )
    expect(
      indexColumns.rows.filter((row) => Number(row.key) === 1).map((row) => String(row.name))
    ).toEqual(['created_at', 'id'])
    await expect(
      client.execute(`EXPLAIN QUERY PLAN ${ORCHESTRATOR_RETENTION_QUERY}`)
    ).rejects.toThrow(/no query solution/i)
    const runColumns = await client.execute(`PRAGMA table_info('ai_orchestrator_runs')`)
    expect(runColumns.rows.some((row) => row.name === 'rollback_probe')).toBe(false)

    const run = await client.execute(
      `SELECT objective, output FROM ai_orchestrator_runs
       WHERE id = 'ROLLBACK_ORCHESTRATOR_RUN'`
    )
    expect(run.rows[0]).toMatchObject({
      objective: 'CANARY_OBJECTIVE_BEFORE',
      output: 'CANARY_OUTPUT_BEFORE'
    })
    const event = await client.execute(
      `SELECT payload FROM ai_orchestrator_events
       WHERE id = 'ROLLBACK_ORCHESTRATOR_EVENT'`
    )
    expect(event.rows[0]).toMatchObject({ payload: '{"marker":"CANARY_EVENT_BEFORE"}' })

    const journalRows = await client.execute(
      'SELECT created_at FROM __drizzle_migrations ORDER BY created_at'
    )
    expect(journalRows.rows).toHaveLength(target)
    expect(Number(journalRows.rows.at(-1)?.created_at)).toBe(previousEntry?.when)
  })

  it('upgrades a journaled 0033 database while preserving existing rows', async () => {
    const { client, directory } = await createPrivacyTestClient('migration-upgrade')
    const stagedFolder = join(directory, 'migrations')
    // Both counts are derived from the chain: this test upgrades a database
    // journaled at the migration before the retention indexes, up to and
    // including them. Literal 34/35 silently drift as the chain grows.
    const migrationNames = await getPrivacyMigrationNames()
    const retentionIndex = migrationNames.indexOf(RETENTION_INDEXES_MIGRATION)
    expect(retentionIndex).toBeGreaterThan(0)
    const beforeRetention = retentionIndex
    const throughRetention = retentionIndex + 1
    await stageMigrationChain(stagedFolder, beforeRetention)
    await migrate(drizzle(client), { migrationsFolder: stagedFolder })
    await client.execute(
      `INSERT INTO clipboard_history (type, content, timestamp, is_favorite)
       VALUES ('text', 'CANARY_JOURNALED_UPGRADE', 1, 0)`
    )
    await client.execute(
      `INSERT INTO intelligence_context_sessions (id, owner, status, created_at, updated_at)
       VALUES ('journal-upgrade', 'assistant', 'archived', 1, 1)`
    )

    await stageMigrationChain(stagedFolder, throughRetention)
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
    // The staged folder holds only the chain through the retention indexes, so
    // the journal reflects that subset rather than every migration on disk.
    expect(Number(journalRows.rows[0]?.count)).toBe(throughRetention)
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
