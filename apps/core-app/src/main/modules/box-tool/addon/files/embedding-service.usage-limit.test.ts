/**
 * File embedding under the global AI usage limit (usage-limits task C5, AC-C4): the refusal stops
 * the batch, nothing is retried or re-probed until the limit's reset time, and the pause is
 * readable for the file-index diagnostics. Real libsql in memory, the SDK mocked.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../db/schema'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import {
  createUsageLimitError,
  notifyUsageLimitsChanged
} from '../../../ai/usage-ledger/usage-limits'
import { EmbeddingService } from './embedding-service'

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

async function createService(): Promise<EmbeddingService> {
  const client = createClient({ url: ':memory:' })
  await client.execute(EMBEDDINGS_DDL)
  const db = drizzle(client, { schema })
  return new EmbeddingService({
    isSplitEnabled: () => false,
    getReadDb: () => db,
    getPrimaryDb: () => db,
    execWrite: vi.fn()
  })
}

function files(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    fileId: `file-${index + 1}`,
    content: `distinct content of file ${index + 1}`
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  generate.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EmbeddingService under the global usage limit', () => {
  it('stops the batch at the refusal and sends nothing more until the limit resets', async () => {
    const service = await createService()
    // Call 0 is the availability probe; calls 1–5 are the first batch, where file 4 is refused.
    let call = 0
    generate.mockImplementation(async () => {
      const index = call++
      if (index === 4) throw refusal()
      return vector()
    })

    const first = await service.indexFiles(files(12))

    // Files 1, 2, 3 and 5 were embedded, file 4 was refused, files 6–12 were never sent.
    expect(first).toEqual({ indexed: 4, skipped: 8, failed: 0 })
    expect(generate).toHaveBeenCalledTimes(6)
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
    expect(generate).toHaveBeenCalledTimes(6)

    // After the local reset time the pause lifts by itself and embedding resumes.
    vi.setSystemTime(RESETS_AT)
    expect(service.getUsageLimitPause()).toBeNull()
    await expect(
      service.indexFiles([{ fileId: 'file-99', content: 'after the reset' }])
    ).resolves.toEqual({ indexed: 1, skipped: 0, failed: 0 })
    expect(generate).toHaveBeenCalledTimes(7)
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
  it('keeps other failures on their old path: logged per file, not a pause', async () => {
    const service = await createService()
    generate
      .mockResolvedValueOnce(vector())
      .mockRejectedValueOnce(new Error('upstream refused'))
      .mockResolvedValue(vector())

    await expect(service.indexFiles(files(2))).resolves.toEqual({
      indexed: 2,
      skipped: 0,
      failed: 0
    })
    expect(service.getUsageLimitPause()).toBeNull()
    expect(generate).toHaveBeenCalledTimes(3)
  })
})
