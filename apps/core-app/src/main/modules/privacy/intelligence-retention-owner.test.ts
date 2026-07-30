import type { Client } from '@libsql/client'
import type { PrivacyOwnerWriteScheduler } from './owner-utils'
import { describe, expect, it } from 'vitest'
import { createIntelligenceRetentionOwner } from './owners/intelligence-retention-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'
import { createPrivacyTestClient } from './retention-test-utils'

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const CUTOFF_MS = NOW_MS - 30 * PRIVACY_RETENTION_DAY_MS

async function createIntelligenceTables(client: Client): Promise<void> {
  const statements = [
    `CREATE TABLE intelligence_audit_logs (id INTEGER PRIMARY KEY, trace_id TEXT NOT NULL UNIQUE, timestamp INTEGER NOT NULL, capability_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, prompt_hash TEXT, caller TEXT, user_id TEXT, prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL, total_tokens INTEGER NOT NULL, estimated_cost REAL, latency INTEGER NOT NULL, success INTEGER NOT NULL, error TEXT, metadata TEXT)`,
    `CREATE TABLE intelligence_usage_stats (caller_id TEXT NOT NULL, caller_type TEXT NOT NULL, period TEXT NOT NULL, period_type TEXT NOT NULL, request_count INTEGER NOT NULL, success_count INTEGER NOT NULL, failure_count INTEGER NOT NULL, total_tokens INTEGER NOT NULL, prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL, total_cost REAL NOT NULL, avg_latency REAL NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (caller_id, caller_type, period))`,
    `CREATE TABLE intelligence_context_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL, objective TEXT, summary TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER, is_pinned INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE intelligence_context_turns (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES intelligence_context_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, privacy_level TEXT NOT NULL, token_estimate INTEGER NOT NULL, metadata TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_context_checkpoints (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES intelligence_context_sessions(id) ON DELETE CASCADE, type TEXT NOT NULL, reason TEXT NOT NULL, summary TEXT, context_scope TEXT NOT NULL, metadata TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_compression_snapshots (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES intelligence_context_sessions(id) ON DELETE CASCADE, goal TEXT, current_state TEXT, decisions TEXT NOT NULL, constraints TEXT NOT NULL, artifacts TEXT NOT NULL, open_questions TEXT NOT NULL, source_turn_from TEXT, source_turn_to TEXT, metadata TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_context_package_logs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES intelligence_context_sessions(id) ON DELETE CASCADE, scope TEXT NOT NULL, trace_id TEXT, token_budget INTEGER NOT NULL, token_estimate INTEGER NOT NULL, items TEXT NOT NULL, metadata TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_memory_items (id TEXT PRIMARY KEY, content TEXT NOT NULL, source_session_id TEXT, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_quotas (id INTEGER PRIMARY KEY, caller_id TEXT NOT NULL, enabled INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE intelligence_workflow_definitions (id TEXT PRIMARY KEY, name TEXT NOT NULL, definition TEXT NOT NULL)`,
    `CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  ]
  for (const statement of statements) await client.execute(statement)
}

async function count(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(result.rows[0].count)
}

async function seedContextSession(
  client: Client,
  id: string,
  status: 'active' | 'archived',
  updatedAt: number,
  pinned = false
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO intelligence_context_sessions VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      status,
      `CANARY_OBJECTIVE_${id}`,
      `CANARY_SUMMARY_${id}`,
      `CANARY_SESSION_META_${id}`,
      updatedAt - 1,
      updatedAt,
      status === 'archived' ? updatedAt : null,
      pinned ? 1 : 0
    ]
  })
  await client.execute({
    sql: `INSERT INTO intelligence_context_turns VALUES (?, ?, 'user', ?, 'sensitive', 1, ?, ?)`,
    args: [`turn-${id}`, id, `CANARY_TURN_${id}`, `CANARY_TURN_META_${id}`, updatedAt]
  })
  await client.execute({
    sql: `INSERT INTO intelligence_context_checkpoints VALUES (?, ?, 'session_end', ?, ?, 'session', ?, ?)`,
    args: [
      `checkpoint-${id}`,
      id,
      `CANARY_REASON_${id}`,
      `CANARY_CHECKPOINT_${id}`,
      `CANARY_CHECKPOINT_META_${id}`,
      updatedAt
    ]
  })
  await client.execute({
    sql: `INSERT INTO intelligence_compression_snapshots VALUES (?, ?, ?, ?, '[]', '[]', '[]', '[]', NULL, NULL, ?, ?)`,
    args: [
      `compression-${id}`,
      id,
      `CANARY_GOAL_${id}`,
      `CANARY_STATE_${id}`,
      `CANARY_COMPRESSION_META_${id}`,
      updatedAt
    ]
  })
  await client.execute({
    sql: `INSERT INTO intelligence_context_package_logs VALUES (?, ?, 'session', ?, 100, 10, ?, ?, ?)`,
    args: [
      `package-${id}`,
      id,
      `CANARY_TRACE_${id}`,
      `CANARY_ITEMS_${id}`,
      `CANARY_PACKAGE_META_${id}`,
      updatedAt
    ]
  })
}

describe('intelligence retention owner', () => {
  it('deletes old audit detail while preserving quotas, config, workflows, and Memory', async () => {
    const { client } = await createPrivacyTestClient('intelligence-audit')
    await createIntelligenceTables(client)
    for (const [suffix, timestampMs] of [
      ['OLD', CUTOFF_MS - 1_000],
      ['EQUAL', CUTOFF_MS],
      ['FRESH', CUTOFF_MS + 1_000]
    ] as const) {
      await client.execute({
        sql: `INSERT INTO intelligence_audit_logs (trace_id, timestamp, capability_id, provider, model, prompt_hash, caller, user_id, prompt_tokens, completion_tokens, total_tokens, latency, success, error, metadata) VALUES (?, ?, 'chat', 'local', 'model', ?, 'system', 'user', 1, 1, 2, 1, 1, NULL, ?)`,
        args: [
          `CANARY_TRACE_${suffix}`,
          timestampMs,
          `CANARY_PROMPT_HASH_${suffix}`,
          `CANARY_AUDIT_META_${suffix}`
        ]
      })
      const timestampSeconds = Math.floor(timestampMs / 1000)
      await client.execute({
        sql: `INSERT INTO intelligence_usage_stats VALUES ('system', 'system', ?, 'day', 1, 1, 0, 2, 1, 1, 0, 1, ?)`,
        args: [suffix, timestampSeconds]
      })
    }
    await client.execute(`INSERT INTO intelligence_quotas VALUES (1, 'system', 1, 1)`)
    await client.execute(
      `INSERT INTO intelligence_workflow_definitions VALUES ('workflow', 'CANARY_WORKFLOW', 'CANARY_DEFINITION')`
    )
    await client.execute(
      `INSERT INTO intelligence_memory_items VALUES ('memory', 'CANARY_MEMORY', NULL, 1)`
    )
    await client.execute(
      `INSERT INTO app_config VALUES ('provider', 'CANARY_PROVIDER_AND_PROMPT_CONFIG')`
    )

    const owner = createIntelligenceRetentionOwner({ client })
    const result = await owner.delete(
      {
        category: 'intelligence-audit',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-audit'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )
    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(await count(client, 'intelligence_audit_logs')).toBe(2)
    expect(await count(client, 'intelligence_usage_stats')).toBe(3)
    for (const table of [
      'intelligence_quotas',
      'intelligence_workflow_definitions',
      'intelligence_memory_items',
      'app_config'
    ]) {
      expect(await count(client, table)).toBe(1)
    }
    expect(JSON.stringify(result)).not.toContain('CANARY_')
  })

  it('passes the committed audit cursor into each domain lifecycle page', async () => {
    const { client } = await createPrivacyTestClient('intelligence-audit-lifecycle')
    const cursors: Array<{ timestampMs: number; id: number } | undefined> = []
    const auditLifecycle = {
      cleanupRetentionPage: async (
        _cutoffMs: number,
        _limit: number,
        _signal: AbortSignal,
        cursor?: { timestampMs: number; id: number }
      ) => {
        cursors.push(cursor)
        if (!cursor) {
          return {
            deletedCount: 2,
            hasMore: true,
            cancelled: false,
            cursor: { timestampMs: CUTOFF_MS - 2_000, id: 2 }
          }
        }
        return {
          deletedCount: 1,
          hasMore: false,
          cancelled: false,
          cursor: { timestampMs: CUTOFF_MS - 1_000, id: 3 }
        }
      }
    }
    const owner = createIntelligenceRetentionOwner({
      client,
      auditLifecycle,
      limits: { batchSize: 2, maxRows: 10 }
    })

    const result = await owner.delete(
      {
        category: 'intelligence-audit',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-audit'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 3, batches: 2 })
    expect(cursors).toEqual([undefined, { timestampMs: CUTOFF_MS - 2_000, id: 2 }])
  })

  it('uses the operation time as the manual audit admission floor', async () => {
    const { client } = await createPrivacyTestClient('intelligence-audit-manual-floor')
    const calls: Array<{ cutoffMs: number; admissionFloorMs: number | undefined }> = []
    const owner = createIntelligenceRetentionOwner({
      client,
      auditLifecycle: {
        async cleanupRetentionPage(_cutoffMs, _limit, _signal, _cursor, admissionFloorMs) {
          calls.push({ cutoffMs: _cutoffMs, admissionFloorMs })
          return { deletedCount: 0, hasMore: false, cancelled: false }
        }
      }
    })

    const result = await owner.delete(
      {
        category: 'intelligence-audit',
        mode: 'manual-delete',
        confirmation: 'delete-selected-data',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-audit'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ cutoffMs: NOW_MS, admissionFloorMs: NOW_MS }])
  })

  it('deletes only inactive Context aggregates in one transaction and preserves Memory', async () => {
    const { client } = await createPrivacyTestClient('intelligence-context')
    await createIntelligenceTables(client)
    await seedContextSession(client, 'archived-old', 'archived', CUTOFF_MS - 1)
    await seedContextSession(client, 'active-old', 'active', CUTOFF_MS - 1)
    await seedContextSession(client, 'archived-equal', 'archived', CUTOFF_MS)
    await seedContextSession(client, 'archived-fresh', 'archived', CUTOFF_MS + 1)
    await seedContextSession(client, 'pinned-old', 'archived', CUTOFF_MS - 1, true)
    await client.execute(
      `INSERT INTO intelligence_memory_items VALUES ('memory', 'CANARY_MEMORY_PRESERVED', 'archived-equal', 1)`
    )

    const owner = createIntelligenceRetentionOwner({ client })
    const request = {
      category: 'intelligence-context' as const,
      mode: 'retention' as const,
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-context'],
      nowMs: NOW_MS
    }
    const preview = await owner.previewDelete(request, new AbortController().signal)
    expect(preview).toMatchObject({ ok: true, eligibleItemCount: 1, protectedItemCount: 2 })
    const result = await owner.delete(request, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(await count(client, 'intelligence_context_sessions')).toBe(4)
    for (const table of [
      'intelligence_context_turns',
      'intelligence_context_checkpoints',
      'intelligence_compression_snapshots',
      'intelligence_context_package_logs'
    ]) {
      expect(await count(client, table)).toBe(4)
    }
    expect(await count(client, 'intelligence_memory_items')).toBe(1)
  })

  it('manual Context deletion removes pinned inactive sessions but never active sessions', async () => {
    const { client } = await createPrivacyTestClient('intelligence-context-manual')
    await createIntelligenceTables(client)
    await seedContextSession(client, 'active-manual', 'active', CUTOFF_MS - 1)
    await seedContextSession(client, 'pinned-manual', 'archived', CUTOFF_MS - 1, true)
    const owner = createIntelligenceRetentionOwner({ client })

    const result = await owner.delete(
      {
        category: 'intelligence-context',
        mode: 'manual-delete',
        confirmation: 'delete-selected-data',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-context'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({
      ok: true,
      deletedItemCount: 1,
      protectedItemCount: 1
    })
    const remaining = await client.execute('SELECT id, status FROM intelligence_context_sessions')
    expect(remaining.rows).toEqual([{ id: 'active-manual', status: 'active' }])
    for (const table of [
      'intelligence_context_turns',
      'intelligence_context_checkpoints',
      'intelligence_compression_snapshots',
      'intelligence_context_package_logs'
    ]) {
      expect(await count(client, table)).toBe(1)
    }
  })

  it('allows explicit Context deletion to include pinned roots while protecting active sessions', async () => {
    const { client } = await createPrivacyTestClient('intelligence-context-manual')
    await createIntelligenceTables(client)
    await seedContextSession(client, 'active-manual', 'active', NOW_MS + 1)
    await seedContextSession(client, 'pinned-manual', 'archived', NOW_MS + 2, true)
    await client.execute(
      `INSERT INTO intelligence_memory_items VALUES ('memory', 'CANARY_MEMORY_PRESERVED', 'active-manual', 1)`
    )
    const owner = createIntelligenceRetentionOwner({ client })
    const request = {
      category: 'intelligence-context' as const,
      mode: 'manual-delete' as const,
      confirmation: 'delete-selected-data' as const,
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-context'],
      nowMs: NOW_MS
    }

    const preview = await owner.previewDelete(request, new AbortController().signal)
    const result = await owner.delete(request, new AbortController().signal)

    expect(preview).toMatchObject({
      ok: true,
      eligibleItemCount: 1,
      protectedItemCount: 1
    })
    expect(result).toMatchObject({ ok: true, deletedItemCount: 1, protectedItemCount: 1 })
    expect(await count(client, 'intelligence_context_sessions')).toBe(1)
    expect(await count(client, 'intelligence_memory_items')).toBe(1)
  })

  it('rechecks Context status atomically when an archived session becomes active', async () => {
    const { client } = await createPrivacyTestClient('intelligence-context-race')
    await createIntelligenceTables(client)
    await seedContextSession(client, 'archived-race', 'archived', CUTOFF_MS - 1)
    const scheduleWrite: PrivacyOwnerWriteScheduler = async (_label, operation) => {
      await client.execute(
        `UPDATE intelligence_context_sessions SET status = 'active' WHERE id = 'archived-race'`
      )
      return operation()
    }
    const owner = createIntelligenceRetentionOwner({ client, scheduleWrite })

    const result = await owner.delete(
      {
        category: 'intelligence-context',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-context'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 0, protectedItemCount: 1 })
    for (const table of [
      'intelligence_context_sessions',
      'intelligence_context_turns',
      'intelligence_context_checkpoints',
      'intelligence_compression_snapshots',
      'intelligence_context_package_logs'
    ]) {
      expect(await count(client, table)).toBe(1)
    }
  })

  it('rolls back the complete Context aggregate when any child deletion fails', async () => {
    const { client } = await createPrivacyTestClient('intelligence-rollback')
    await createIntelligenceTables(client)
    await seedContextSession(client, 'archived-old', 'archived', CUTOFF_MS - 1)
    await client.execute(
      `CREATE TRIGGER reject_turn_delete BEFORE DELETE ON intelligence_context_turns BEGIN SELECT RAISE(ABORT, 'CANARY_NATIVE_DB_ERROR'); END`
    )

    const owner = createIntelligenceRetentionOwner({ client })
    const result = await owner.delete(
      {
        category: 'intelligence-context',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-context'],
        nowMs: NOW_MS
      },
      new AbortController().signal
    )
    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_DATABASE_FAILED',
      retryable: true,
      deletedItemCount: 0
    })
    expect(JSON.stringify(result)).not.toContain('CANARY_NATIVE_DB_ERROR')
    for (const table of [
      'intelligence_context_sessions',
      'intelligence_context_turns',
      'intelligence_context_checkpoints',
      'intelligence_compression_snapshots',
      'intelligence_context_package_logs'
    ]) {
      expect(await count(client, table)).toBe(1)
    }
  })
})
