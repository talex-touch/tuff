/**
 * File embedding under the global AI usage limit (usage-limits task C5, AC-C4): the refusal stops
 * the batch, nothing is retried or re-probed until the limit's reset time, and the pause is
 * readable for the file-index diagnostics. Real temporary libsql file, the SDK mocked.
 */
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../db/schema'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import {
  createUsageLimitError,
  notifyUsageLimitsChanged
} from '../../../ai/usage-ledger/usage-limits'
import { EmbeddingService } from './embedding-service'
import { getSearchIndexReadWorkerTestPath } from '../../search-engine/workers/search-index-read-worker.test-harness'

vi.mock('../../../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    embedding: {
      generate: vi.fn()
    }
  }
}))

// Shape from migration 0000 (the drizzle-migrated table both files get).
const EMBEDDINGS_DDL = `CREATE TABLE embeddings (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id text NOT NULL,
  source_type text NOT NULL,
  embedding text NOT NULL,
  model text NOT NULL,
  content_hash text,
  created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL
)`

const NOW = Date.parse('2026-10-03T02:00:00.000Z')
const RESETS_AT = Date.parse('2026-10-03T16:00:00.000Z')

const generate = vi.mocked(tuffIntelligence.embedding.generate)

function vector() {
  return {
    result: [0.1, 0.2, 0.3],
    usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    model: 'test-model',
    latency: 1,
    traceId: 'trace-embedding',
    provider: 'custom'
  }
}

function refusal() {
  return createUsageLimitError('embedding.generate', {
    key: 'requestsPerDay',
    used: 5,
    max: 5,
    resetsAt: RESETS_AT
  })
}

const clients: Client[] = []
const services: EmbeddingService[] = []
const directories: string[] = []
async function createService(): Promise<EmbeddingService> {
  const workerPath = await getSearchIndexReadWorkerTestPath()
  const directory = await mkdtemp(join(tmpdir(), 'embedding-usage-limit-'))
  directories.push(directory)
  const databasePath = join(directory, 'index.sqlite')
  const client = createClient({ url: `file:${databasePath}` })
  await client.execute(EMBEDDINGS_DDL)
  clients.push(client)
  await client.execute(`CREATE TABLE files (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL,
    mtime INTEGER NOT NULL, ctime INTEGER NOT NULL, content TEXT,
    embedding_status TEXT NOT NULL
  )`)
  await client.batch(
    Array.from({ length: 12 }, (_, index) => ({
      sql: 'INSERT INTO files (id, path, name, mtime, ctime, content, embedding_status) VALUES (?, ?, ?, 0, 0, ?, ?)',
      args: [
        index + 1,
        `/file-${index + 1}.txt`,
        `file-${index + 1}.txt`,
        `distinct content of file ${index + 1}`,
        'pending'
      ]
    })),
    'write'
  )
  await client.execute(
    "INSERT INTO files (id, path, name, mtime, ctime, content, embedding_status) VALUES (99, '/after.txt', 'after.txt', 0, 0, 'after the reset', 'pending')"
  )
  const db = drizzle(client, { schema })
  const service = new EmbeddingService(
    {
      isSplitEnabled: () => false,
      getReadDb: () => db,
      getDatabasePath: () => databasePath,
      getPrimaryDb: () => db,
      execWrite: vi.fn()
    },
    undefined,
    { workerPath }
  )
  services.push(service)
  return service
}

function files(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    fileId: String(index + 1),
    content: `distinct content of file ${index + 1}`
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  generate.mockReset()
})

afterEach(async () => {
  for (const service of services.splice(0)) await service.close()
  for (const client of clients.splice(0)) client.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
  vi.useRealTimers()
})

describe('EmbeddingService under the global usage limit', () => {
  it('stops the batch at the refusal and sends nothing more until the limit resets', async () => {
    const service = await createService()
    // Probe then files one at a time: file four's refusal stops all later inference.
    let call = 0
    generate.mockImplementation(async () => {
      const index = call++
      if (index === 4) throw refusal()
      return vector()
    })

    const first = await service.indexFiles(files(12))

    // Only files one through three commit before file four reaches the usage limit.
    expect(first).toEqual({ indexed: 3, skipped: 9, failed: 0 })
    expect(generate).toHaveBeenCalledTimes(5)
    expect(service.getUsageLimitPause()).toEqual({
      reason: 'USAGE_LIMIT_REACHED',
      limitKey: 'requestsPerDay',
      pausedUntil: RESETS_AT
    })

    // While paused: no batch, no probe, no query embedding — not one call, so no retry loop.
    await expect(service.indexFiles(files(3))).resolves.toEqual({
      indexed: 0,
      skipped: 3,
      failed: 0
    })
    await expect(service.isAvailable()).resolves.toBe(false)
    await expect(service.semanticSearch('anything semantic')).resolves.toEqual([])
    await service.indexFile('file-42', 'more content')
    expect(generate).toHaveBeenCalledTimes(5)

    // After the local reset time the pause lifts by itself and embedding resumes.
    vi.setSystemTime(RESETS_AT)
    expect(service.getUsageLimitPause()).toBeNull()
    await expect(
      service.indexFiles([{ fileId: '99', content: 'after the reset' }])
    ).resolves.toEqual({ indexed: 1, skipped: 0, failed: 0 })
    expect(generate).toHaveBeenCalledTimes(6)
  })

  it('does not remember a probe refused by the limit as "embedding unavailable"', async () => {
    const service = await createService()
    generate.mockRejectedValueOnce(refusal()).mockResolvedValue(vector())

    await expect(service.isAvailable()).resolves.toBe(false)
    expect(service.getUsageLimitPause()?.pausedUntil).toBe(RESETS_AT)
    await expect(service.isAvailable()).resolves.toBe(false)
    expect(generate).toHaveBeenCalledTimes(1)

    vi.setSystemTime(RESETS_AT + 1)
    // Probed again after the reset, and available.
    await expect(service.isAvailable()).resolves.toBe(true)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('asks again once a minute while embedding is not available, and keeps a positive answer', async () => {
    const service = await createService()
    generate
      .mockRejectedValueOnce(new Error('model inference failed'))
      .mockResolvedValueOnce({ ...vector(), result: [0, 0, 0] })
      .mockResolvedValue(vector())

    await expect(service.isAvailable()).resolves.toBe(false)
    vi.setSystemTime(NOW + 59_999)
    await expect(service.isAvailable()).resolves.toBe(false)
    await expect(service.indexFiles(files(2))).resolves.toEqual({
      indexed: 0,
      skipped: 2,
      failed: 0
    })
    expect(generate).toHaveBeenCalledTimes(1)

    // The window is over: asked again, and an unusable vector is still "not available".
    vi.setSystemTime(NOW + 60_000)
    await expect(service.isAvailable()).resolves.toBe(false)
    expect(generate).toHaveBeenCalledTimes(2)
    // Each answer starts a new window.
    vi.setSystemTime(NOW + 119_999)
    await expect(service.isAvailable()).resolves.toBe(false)
    expect(generate).toHaveBeenCalledTimes(2)

    vi.setSystemTime(NOW + 120_000)
    await expect(service.isAvailable()).resolves.toBe(true)
    expect(generate).toHaveBeenCalledTimes(3)
    vi.setSystemTime(NOW + 24 * 60 * 60_000)
    await expect(service.isAvailable()).resolves.toBe(true)
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('resumes as soon as the limits change, not at the reset time', async () => {
    const service = await createService()
    // The availability probe is refused: paused until the reset, nothing sent for the files.
    generate.mockRejectedValueOnce(refusal()).mockResolvedValue(vector())

    await expect(service.indexFiles(files(3))).resolves.toEqual({
      indexed: 0,
      skipped: 3,
      failed: 0
    })
    expect(service.getUsageLimitPause()?.pausedUntil).toBe(RESETS_AT)
    expect(generate).toHaveBeenCalledTimes(1)

    // The user clears the limit in Audit, long before the reset time.
    notifyUsageLimitsChanged({
      requestsPerDay: null,
      requestsPerMonth: null,
      tokensPerDay: null,
      tokensPerMonth: null,
      costUsdPerDay: null,
      costUsdPerMonth: null
    })
    expect(service.getUsageLimitPause()).toBeNull()
    // Probed again, then both files embedded.
    await expect(service.indexFiles(files(2))).resolves.toEqual({
      indexed: 2,
      skipped: 0,
      failed: 0
    })
    expect(generate).toHaveBeenCalledTimes(4)
  })
  it('counts a genuine inference failure as failed without pausing later files', async () => {
    const service = await createService()
    generate
      .mockResolvedValueOnce(vector())
      .mockRejectedValueOnce(new Error('upstream refused'))
      .mockResolvedValue(vector())

    await expect(service.indexFiles(files(2))).resolves.toEqual({
      indexed: 1,
      skipped: 0,
      failed: 1,
      retryFileIds: ['1']
    })
    expect(service.getUsageLimitPause()).toBeNull()
    expect(generate).toHaveBeenCalledTimes(3)
  })
})
