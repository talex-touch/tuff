import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { ReportQueueStore } from './report-queue-store'

let client: Client | undefined
let directory: string | undefined

afterEach(async () => {
  client?.close()
  client = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

async function createStore(maxItems: number): Promise<ReportQueueStore> {
  directory = await mkdtemp(join(tmpdir(), 'tuff-report-queue-'))
  client = createClient({ url: `file:${join(directory, 'queue.sqlite')}` })
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
})
