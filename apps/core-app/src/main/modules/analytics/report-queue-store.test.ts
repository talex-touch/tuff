import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { ReportQueueStore } from './report-queue-store'

let clients: Client[] = []
let directory: string | undefined

afterEach(async () => {
  for (const client of clients) client.close()
  clients = []
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

async function createQueueClient(fileName: string): Promise<Client> {
  directory ??= await mkdtemp(join(tmpdir(), 'tuff-report-queue-'))
  const client = createClient({ url: `file:${join(directory, fileName)}` })
  clients.push(client)
  await client.execute(`
    CREATE TABLE analytics_report_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      last_error TEXT
    )
  `)
  return client
}

async function createStore(maxItems: number): Promise<ReportQueueStore> {
  const client = await createQueueClient('queue.sqlite')
  return new ReportQueueStore({ auxDb: drizzle(client, { schema }), maxItems })
}

describe('ReportQueueStore', () => {
  it('enforces the persistent queue bound in the insert transaction', async () => {
    const store = await createStore(3)
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      await store.insert({
        endpoint: 'https://telemetry.invalid/report',
        payload: { sequence },
        createdAt: sequence
      })
    }

    const rows = await store.list()
    expect(rows.map((row) => row.payload.sequence)).toEqual([3, 4, 5])
  })

  it('stores only stable failure codes and prunes by strict cutoff', async () => {
    const store = await createStore(3)
    await store.insert({ endpoint: 'https://telemetry.invalid/report', payload: {}, createdAt: 1 })
    await store.insert({ endpoint: 'https://telemetry.invalid/report', payload: {}, createdAt: 2 })
    const [first] = await store.list()

    await store.markAttempt(first.id, 'CANARY_SECRET /Users/private/file')
    expect((await store.list())[0]?.lastError).toBe('ANALYTICS_REPORT_FAILED')
    expect(await store.prune(2)).toBe(1)
    expect((await store.list()).map((row) => row.createdAt)).toEqual([2])
  })

  it('writes land on aux only; legacy primary rows stay read-only (compat mirror retired)', async () => {
    const auxClient = await createQueueClient('aux.sqlite')
    const coreClient = await createQueueClient('core.sqlite')
    const store = new ReportQueueStore({
      auxDb: drizzle(auxClient, { schema }),
      coreDb: drizzle(coreClient, { schema }),
      maxItems: 10
    })

    await coreClient.execute({
      sql: `INSERT INTO analytics_report_queue (endpoint, payload, created_at, retry_count)
            VALUES (?, ?, ?, 0)`,
      args: ['https://telemetry.invalid/report', '{"legacy":true}', 1]
    })

    // Read fallback stays: with aux empty, list() surfaces the legacy rows.
    const [legacyRow] = await store.list()
    expect(legacyRow.payload.legacy).toBe(true)

    // The retired `${label}.compat` mirror would have replayed these writes on
    // the primary DB (bumping retry state, deleting/pruning the legacy row).
    // Since 2026-08-05 they must leave the primary DB untouched.
    await store.markAttempt(legacyRow.id, 'ANALYTICS_REPORT_FAILED')
    await store.remove(legacyRow.id)
    expect(await store.prune(10)).toBe(0)

    const coreRows = await coreClient.execute(
      'SELECT retry_count, last_error FROM analytics_report_queue'
    )
    expect(coreRows.rows).toHaveLength(1)
    expect(Number(coreRows.rows[0]?.retry_count)).toBe(0)
    expect(coreRows.rows[0]?.last_error).toBeNull()

    // New writes land on aux only; the legacy primary row count is unchanged.
    await store.insert({
      endpoint: 'https://telemetry.invalid/report',
      payload: { fresh: true },
      createdAt: 2
    })
    const auxCount = await auxClient.execute('SELECT COUNT(*) AS n FROM analytics_report_queue')
    expect(Number(auxCount.rows[0]?.n)).toBe(1)
    const coreCount = await coreClient.execute('SELECT COUNT(*) AS n FROM analytics_report_queue')
    expect(Number(coreCount.rows[0]?.n)).toBe(1)
  })
})
