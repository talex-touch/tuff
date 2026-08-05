import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { sanitizeTelemetryFailureCode, TelemetryUploadStatsStore } from './telemetry-upload-stats-store'

let clients: Client[] = []
let directory: string | undefined

afterEach(async () => {
  for (const client of clients) client.close()
  clients = []
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

async function createStatsClient(fileName: string): Promise<Client> {
  directory ??= await mkdtemp(join(tmpdir(), 'tuff-telemetry-stats-'))
  const client = createClient({ url: `file:${join(directory, fileName)}` })
  clients.push(client)
  await client.execute(`
    CREATE TABLE telemetry_upload_stats (
      id INTEGER PRIMARY KEY,
      search_count INTEGER NOT NULL DEFAULT 0,
      total_uploads INTEGER NOT NULL DEFAULT 0,
      failed_uploads INTEGER NOT NULL DEFAULT 0,
      last_upload_time INTEGER,
      last_failure_at INTEGER,
      last_failure_message TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `)
  return client
}

async function seedFailureRow(client: Client, failedAtMs: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO telemetry_upload_stats
            (id, search_count, total_uploads, failed_uploads, last_upload_time,
             last_failure_at, last_failure_message, updated_at)
          VALUES (1, 5, 4, 1, ?, ?, 'NETWORK_TIMEOUT', ?)`,
    args: [failedAtMs, failedAtMs, failedAtMs]
  })
}

describe('telemetry upload failure projection', () => {
  it('keeps stable codes and replaces native detail', () => {
    expect(sanitizeTelemetryFailureCode('NETWORK_TIMEOUT')).toBe('NETWORK_TIMEOUT')
    expect(sanitizeTelemetryFailureCode('CANARY_NATIVE_ERROR path=/private query=secret')).toBe(
      'TELEMETRY_UPLOAD_FAILED'
    )
    expect(sanitizeTelemetryFailureCode(null)).toBeNull()
  })
})

describe('TelemetryUploadStatsStore aux-only writes (compat retirement)', () => {
  it('clearFailureBefore clears the aux row only; the legacy primary row is never written', async () => {
    const auxClient = await createStatsClient('aux.sqlite')
    const coreClient = await createStatsClient('core.sqlite')
    await seedFailureRow(auxClient, 1_000)
    await seedFailureRow(coreClient, 1_000)

    const store = new TelemetryUploadStatsStore({
      auxDb: drizzle(auxClient, { schema }),
      coreDb: drizzle(coreClient, { schema })
    })

    // The retired `telemetry.upload-stats.retention.compat` dual-write would
    // have cleared BOTH rows here (aux cleared 1 < maxRows 2 → primary write
    // fired). Aux is the sole write home now.
    await expect(store.clearFailureBefore(2_000)).resolves.toBe(1)

    const auxRow = await auxClient.execute(
      'SELECT last_failure_at, last_failure_message FROM telemetry_upload_stats WHERE id = 1'
    )
    expect(auxRow.rows[0]?.last_failure_at).toBeNull()
    expect(auxRow.rows[0]?.last_failure_message).toBeNull()

    const coreRow = await coreClient.execute(
      'SELECT last_failure_at, last_failure_message FROM telemetry_upload_stats WHERE id = 1'
    )
    expect(Number(coreRow.rows[0]?.last_failure_at)).toBe(1_000)
    expect(coreRow.rows[0]?.last_failure_message).toBe('NETWORK_TIMEOUT')
  })

  it('get() still falls back to the legacy primary row while aux has none', async () => {
    const auxClient = await createStatsClient('aux.sqlite')
    const coreClient = await createStatsClient('core.sqlite')
    await seedFailureRow(coreClient, 1_000)

    const store = new TelemetryUploadStatsStore({
      auxDb: drizzle(auxClient, { schema }),
      coreDb: drizzle(coreClient, { schema })
    })

    const record = await store.get()
    expect(record?.lastFailureAt).toBe(1_000)
    expect(record?.lastFailureMessage).toBe('NETWORK_TIMEOUT')
    expect(record?.searchCount).toBe(5)
  })
})
