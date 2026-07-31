import type { Client, InStatement } from '@libsql/client'
import type { PrivacyOwnerWriteScheduler } from './owner-utils'
import { describe, expect, it, vi } from 'vitest'
import { createSearchRetentionOwner } from './owners/search-retention-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'
import { createPrivacyTestClient } from './retention-test-utils'

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const POLICY = DEFAULT_PRIVACY_RETENTION_POLICY.categories['search-history']
const CUTOFF_SECONDS = Math.floor((NOW_MS - 30 * PRIVACY_RETENTION_DAY_MS) / 1000)
const CUTOFF_DAY = Math.floor((NOW_MS - 30 * PRIVACY_RETENTION_DAY_MS) / 86_400_000)

async function createSearchTables(client: Client): Promise<void> {
  const statements = [
    `CREATE TABLE query_completions (id INTEGER PRIMARY KEY AUTOINCREMENT, prefix TEXT NOT NULL, source_id TEXT NOT NULL, item_id TEXT NOT NULL, completion_count INTEGER NOT NULL, last_completed INTEGER NOT NULL, avg_query_length REAL NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE contextual_embeddings (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, context_text TEXT NOT NULL, embedding BLOB NOT NULL, model TEXT NOT NULL, timestamp INTEGER NOT NULL)`,
    `CREATE TABLE usage_logs (id INTEGER PRIMARY KEY, session_id TEXT, item_id TEXT NOT NULL, action TEXT NOT NULL, source TEXT NOT NULL, keyword TEXT, timestamp INTEGER NOT NULL, context TEXT)`,
    `CREATE TABLE usage_summary (item_id TEXT PRIMARY KEY, click_count INTEGER NOT NULL, last_used INTEGER NOT NULL)`,
    `CREATE TABLE item_usage_stats (source_id TEXT NOT NULL, item_id TEXT NOT NULL, source_type TEXT NOT NULL, search_count INTEGER NOT NULL, execute_count INTEGER NOT NULL, cancel_count INTEGER NOT NULL, last_searched INTEGER, last_executed INTEGER, last_cancelled INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (source_id, item_id))`,
    `CREATE TABLE item_time_stats (source_id TEXT NOT NULL, item_id TEXT NOT NULL, hour_distribution TEXT NOT NULL, day_of_week_distribution TEXT NOT NULL, time_slot_distribution TEXT NOT NULL, last_updated INTEGER NOT NULL, PRIMARY KEY (source_id, item_id))`,
    `CREATE TABLE usage_trend_daily (source_id TEXT NOT NULL, item_id TEXT NOT NULL, day INTEGER NOT NULL, execute_count INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (source_id, item_id, day))`,
    `CREATE TABLE recommendation_cache (cache_key TEXT PRIMARY KEY, recommended_items TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE index_items (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL)`,
    `CREATE TABLE embeddings (id TEXT PRIMARY KEY, embedding BLOB NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE pinned_items (source_id TEXT NOT NULL, item_id TEXT NOT NULL, source_type TEXT NOT NULL, pinned_at INTEGER NOT NULL, "order" INTEGER NOT NULL, PRIMARY KEY (source_id, item_id))`
  ]
  for (const statement of statements) await client.execute(statement)
}

async function seedSearchRows(client: Client): Promise<void> {
  const old = CUTOFF_SECONDS - 1
  const equal = CUTOFF_SECONDS
  const fresh = CUTOFF_SECONDS + 1
  for (const [suffix, timestamp] of [
    ['OLD', old],
    ['EQUAL', equal],
    ['FRESH', fresh]
  ] as const) {
    await client.execute({
      sql: `INSERT INTO query_completions (prefix, source_id, item_id, completion_count, last_completed, avg_query_length, created_at) VALUES (?, 'file', ?, 1, ?, 1, ?)`,
      args: [`CANARY_QUERY_${suffix}`, `CANARY_COMPLETION_${suffix}`, timestamp, timestamp]
    })
    await client.execute({
      sql: `INSERT INTO contextual_embeddings (session_id, context_text, embedding, model, timestamp) VALUES (?, ?, X'01', 'current-model', ?)`,
      args: [`session-${suffix}`, `CANARY_CONTEXT_${suffix}`, timestamp]
    })
    await client.execute({
      sql: `INSERT INTO usage_logs (session_id, item_id, action, source, keyword, timestamp, context) VALUES (?, ?, 'execute', 'file', ?, ?, ?)`,
      args: [
        `session-${suffix}`,
        `CANARY_ITEM_${suffix}`,
        `CANARY_QUERY_${suffix}`,
        timestamp,
        `CANARY_CONTEXT_${suffix}`
      ]
    })
    await client.execute({
      sql: `INSERT INTO usage_summary VALUES (?, 1, ?)`,
      args: [`CANARY_ITEM_${suffix}`, timestamp]
    })
    await client.execute({
      sql: `INSERT INTO item_usage_stats VALUES ('file', ?, 'file', 1, 1, 0, ?, ?, NULL, ?, ?)`,
      args: [`CANARY_ITEM_${suffix}`, timestamp, timestamp, timestamp, timestamp]
    })
    await client.execute({
      sql: `INSERT INTO item_time_stats VALUES ('file', ?, '[]', '[]', '{}', ?)`,
      args: [`CANARY_ITEM_${suffix}`, timestamp]
    })
    await client.execute({
      sql: `INSERT INTO usage_trend_daily VALUES ('file', ?, ?, 1, ?)`,
      args: [
        `CANARY_ITEM_${suffix}`,
        suffix === 'OLD' ? CUTOFF_DAY - 1 : suffix === 'EQUAL' ? CUTOFF_DAY : CUTOFF_DAY + 1,
        timestamp
      ]
    })
    await client.execute({
      sql: `INSERT INTO recommendation_cache VALUES (?, ?, ?, ?)`,
      args: [
        `CANARY_CACHE_${suffix}`,
        `["CANARY_RECOMMEND_${suffix}"]`,
        timestamp,
        Math.floor(NOW_MS / 1000) + 60
      ]
    })
  }
  await client.execute(
    `INSERT INTO index_items VALUES ('preserved-index', 'file', 'CANARY_FILE_ROW')`
  )
  await client.execute(
    `INSERT INTO embeddings VALUES ('preserved-embedding', X'01', 'current-model', 1)`
  )
  await client.execute(`INSERT INTO pinned_items VALUES ('file', 'preserved-pin', 'file', 1, 0)`)
}

async function count(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(result.rows[0].count)
}

function createTracingClient(client: Client): {
  client: Pick<Client, 'execute' | 'batch'>
  queryCompletionCursors: number[]
  candidateSql: string[]
} {
  const queryCompletionCursors: number[] = []
  const candidateSql: string[] = []
  const execute = async (statement: InStatement | string) => {
    const sql = typeof statement === 'string' ? statement : statement.sql
    if (/SELECT\s+rowid\s+AS\s+owner_id[\s\S]+FROM\s+query_completions/i.test(sql)) {
      candidateSql.push(sql)
      const rawArgs = typeof statement === 'string' ? undefined : statement.args
      const args = Array.isArray(rawArgs) ? rawArgs : []
      queryCompletionCursors.push(Number(args[1]))
    }
    return client.execute(statement)
  }
  return {
    client: {
      execute: execute as Client['execute'],
      batch: client.batch.bind(client) as Client['batch']
    },
    queryCompletionCursors,
    candidateSql
  }
}

describe('search retention owner', () => {
  it('cleans only historical query, usage, context, and cache detail before the strict cutoff', async () => {
    const { client } = await createPrivacyTestClient('search')
    await createSearchTables(client)
    await seedSearchRows(client)
    const deletedPages: string[] = []
    const onCompleted = vi.fn(async () => undefined)
    const owner = createSearchRetentionOwner({
      coreClient: client,
      auxiliaryClient: client,
      onDeletedPage: (target) => deletedPages.push(target),
      onCompleted
    })
    const request = {
      category: 'search-history' as const,
      mode: 'retention' as const,
      policy: POLICY,
      nowMs: NOW_MS
    }

    const preview = await owner.previewDelete(request, new AbortController().signal)
    expect(preview).toMatchObject({ ok: true, eligibleItemCount: 8, bounded: false })
    const result = await owner.delete(request, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, deletedItemCount: 8, partial: false })

    for (const table of [
      'query_completions',
      'contextual_embeddings',
      'usage_logs',
      'usage_summary',
      'item_usage_stats',
      'item_time_stats',
      'usage_trend_daily',
      'recommendation_cache'
    ]) {
      expect(await count(client, table)).toBe(2)
    }
    expect(await count(client, 'index_items')).toBe(1)
    expect(await count(client, 'embeddings')).toBe(1)
    expect(await count(client, 'pinned_items')).toBe(1)
    expect(JSON.stringify({ preview, result })).not.toContain('CANARY_')
    expect(new Set(deletedPages)).toEqual(
      new Set([
        'query-completions',
        'contextual-embeddings',
        'usage-logs',
        'usage-summary',
        'item-usage',
        'item-time',
        'usage-trend',
        'recommendation-cache'
      ])
    )
    expect(onCompleted).toHaveBeenCalledOnce()

    const idempotent = await owner.delete(request, new AbortController().signal)
    expect(idempotent).toMatchObject({ ok: true, deletedItemCount: 0 })
  })

  it('deletes the previous day bucket when the strict cutoff is exactly UTC midnight', async () => {
    const { client } = await createPrivacyTestClient('search-day-boundary')
    await createSearchTables(client)
    const midnightNowMs = Date.UTC(2026, 6, 31)
    const midnightCutoffMs = midnightNowMs - 30 * PRIVACY_RETENTION_DAY_MS
    const midnightCutoffDay = Math.floor(midnightCutoffMs / 86_400_000)
    await client.execute({
      sql: `INSERT INTO usage_trend_daily VALUES ('file', 'eligible', ?, 1, ?)`,
      args: [midnightCutoffDay - 2, Math.floor(midnightCutoffMs / 1000) - 1]
    })
    await client.execute({
      sql: `INSERT INTO usage_trend_daily VALUES ('file', 'boundary', ?, 1, ?)`,
      args: [midnightCutoffDay - 1, Math.floor(midnightCutoffMs / 1000)]
    })
    const owner = createSearchRetentionOwner({ coreClient: client, auxiliaryClient: client })
    const request = {
      category: 'search-history' as const,
      mode: 'retention' as const,
      policy: POLICY,
      nowMs: midnightNowMs
    }

    await expect(owner.previewDelete(request, new AbortController().signal)).resolves.toMatchObject(
      {
        ok: true,
        eligibleItemCount: 2
      }
    )
    await expect(owner.delete(request, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      deletedItemCount: 2
    })
    const remaining = await client.execute(
      'SELECT item_id, day FROM usage_trend_daily ORDER BY item_id'
    )
    expect(remaining.rows).toEqual([])
  })

  it('cleans expired recommendation entries even before the policy cutoff', async () => {
    const { client } = await createPrivacyTestClient('search-expired-cache')
    await createSearchTables(client)
    const freshCreatedAt = Math.floor(NOW_MS / 1000) - 60
    const nowSeconds = Math.floor(NOW_MS / 1000)
    for (const [key, expiresAt] of [
      ['expired', nowSeconds - 1],
      ['expires-now', nowSeconds],
      ['future', nowSeconds + 60]
    ] as const) {
      await client.execute({
        sql: 'INSERT INTO recommendation_cache (cache_key, recommended_items, created_at, expires_at) VALUES (?, ?, ?, ?)',
        args: [key, '[]', freshCreatedAt, expiresAt]
      })
    }
    const owner = createSearchRetentionOwner({ coreClient: client, auxiliaryClient: client })

    const preview = await owner.previewDelete(
      {
        category: 'search-history',
        mode: 'retention',
        policy: POLICY,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )
    const result = await owner.delete(
      {
        category: 'search-history',
        mode: 'retention',
        policy: POLICY,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(preview).toMatchObject({ ok: true, eligibleItemCount: 2 })
    expect(result).toMatchObject({ ok: true, deletedItemCount: 2 })
    const remaining = await client.execute(
      'SELECT cache_key FROM recommendation_cache ORDER BY cache_key'
    )
    expect(remaining.rows.map((row) => String(row.cache_key))).toEqual(['future'])
  })

  it('routes recommendation cleanup to auxiliary storage and never touches search-index source rows', async () => {
    const { client: primary } = await createPrivacyTestClient('search-primary-routing')
    const { client: auxiliary } = await createPrivacyTestClient('search-aux-routing')
    const { client: searchIndex } = await createPrivacyTestClient('search-index-routing')
    await createSearchTables(primary)
    await auxiliary.execute(
      `CREATE TABLE recommendation_cache (cache_key TEXT PRIMARY KEY, recommended_items TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`
    )
    await searchIndex.execute(
      `CREATE TABLE index_items (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL)`
    )
    for (const client of [primary, auxiliary]) {
      await client.execute({
        sql: `INSERT INTO recommendation_cache VALUES ('old-cache', '[]', ?, ?)`,
        args: [CUTOFF_SECONDS - 1, Math.floor(NOW_MS / 1000) + 60]
      })
    }
    await searchIndex.execute(
      `INSERT INTO index_items VALUES ('source-row', 'file', 'CANARY_SEARCH_INDEX_SOURCE')`
    )

    const owner = createSearchRetentionOwner({
      coreClient: primary,
      auxiliaryClient: auxiliary
    })
    const result = await owner.delete(
      {
        category: 'search-history',
        mode: 'retention',
        policy: POLICY,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(await count(auxiliary, 'recommendation_cache')).toBe(0)
    expect(await count(primary, 'recommendation_cache')).toBe(1)
    expect(await count(searchIndex, 'index_items')).toBe(1)
    expect(JSON.stringify(result)).not.toContain('CANARY_')
  })

  it('advances a stable keyset after each committed page', async () => {
    const { client } = await createPrivacyTestClient('search-keyset')
    await createSearchTables(client)
    for (const timestamp of [CUTOFF_SECONDS - 3, CUTOFF_SECONDS - 2, CUTOFF_SECONDS - 1]) {
      await client.execute({
        sql: `INSERT INTO query_completions (prefix, source_id, item_id, completion_count, last_completed, avg_query_length, created_at) VALUES (?, 'file', ?, 1, ?, 1, ?)`,
        args: [`query-${timestamp}`, `item-${timestamp}`, timestamp, timestamp]
      })
    }
    const traced = createTracingClient(client)
    const owner = createSearchRetentionOwner({
      coreClient: traced.client,
      auxiliaryClient: traced.client,
      limits: { batchSize: 1, maxRows: 20 }
    })

    const result = await owner.delete(
      {
        category: 'search-history',
        mode: 'retention',
        policy: POLICY,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 3, batches: 3 })
    expect(traced.queryCompletionCursors).toEqual([
      -1,
      CUTOFF_SECONDS - 3,
      CUTOFF_SECONDS - 2,
      CUTOFF_SECONDS - 1
    ])
    expect(traced.candidateSql.every((sql) => !/\bOFFSET\b/i.test(sql))).toBe(true)
    expect(traced.candidateSql.every((sql) => /last_completed\s*>\s*\?/i.test(sql))).toBe(true)
  })

  it('commits bounded pages and stops before the next one after cancellation', async () => {
    const { client } = await createPrivacyTestClient('search-cancel')
    await createSearchTables(client)
    await seedSearchRows(client)
    const controller = new AbortController()
    const onCompleted = vi.fn(async () => undefined)
    const scheduleWrite: PrivacyOwnerWriteScheduler = async (_label, operation) => {
      const result = await operation()
      controller.abort()
      return result
    }
    const owner = createSearchRetentionOwner({
      coreClient: client,
      auxiliaryClient: client,
      limits: { batchSize: 1, maxRows: 50 },
      scheduleWrite,
      onCompleted
    })

    const result = await owner.delete(
      {
        category: 'search-history',
        mode: 'retention',
        policy: POLICY,
        nowMs: NOW_MS
      },
      controller.signal
    )
    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      cancelled: true,
      deletedItemCount: 1,
      partial: true
    })
    expect(await count(client, 'query_completions')).toBe(2)
    expect(await count(client, 'contextual_embeddings')).toBe(3)
    expect(onCompleted).toHaveBeenCalledOnce()
  })
})
