import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Each provider's latest health check against real SQLite, however much history the table keeps. */

let store: typeof import('./providerHealthStore')
let d1: SqliteD1Database

function eventFor() {
  return { context: { cloudflare: { env: { DB: d1 } } } } as any
}

function insertCheck(id: string, providerId: string, capability: string, latencyMs: number, checkedAt: string) {
  d1.sqlite.prepare(`
    INSERT INTO provider_health_checks (id, provider_id, provider_name, vendor, capability, status, latency_ms, endpoint, checked_at)
    VALUES (?, ?, ?, 'custom', ?, 'healthy', ?, 'https://example.com', ?)
  `).run(id, providerId, providerId, capability, latencyMs, checkedAt)
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./providerHealthStore')
  d1 = createSqliteD1()
  // Creates the health table.
  await store.getLatestProviderHealthChecks(eventFor(), { providerIds: ['warm-up'] })
})

afterEach(() => {
  d1.close()
})

describe('getLatestProviderHealthChecks', () => {
  it('answers with each provider\'s latest check, for the capability when one is given', async () => {
    insertCheck('a-1', 'prv_a', 'text.chat', 300, '2026-10-01T00:00:00.000Z')
    insertCheck('a-2', 'prv_a', 'text.chat', 30, '2026-10-02T00:00:00.000Z')
    insertCheck('a-3', 'prv_a', 'vision.ocr', 900, '2026-10-03T00:00:00.000Z')
    insertCheck('b-1', 'prv_b', 'text.chat', 50, '2026-09-01T00:00:00.000Z')

    const all = await store.getLatestProviderHealthChecks(eventFor(), { providerIds: ['prv_a', 'prv_b', 'prv_none'] })
    const chat = await store.getLatestProviderHealthChecks(eventFor(), { providerIds: ['prv_a', 'prv_b'], capability: 'text.chat' })

    expect(Object.fromEntries([...all].map(([key, entry]) => [key, entry.latencyMs]))).toEqual({ prv_a: 900, prv_b: 50 })
    expect(Object.fromEntries([...chat].map(([key, entry]) => [key, entry.latencyMs]))).toEqual({ prv_a: 30, prv_b: 50 })
  })

  it('takes more providers than one statement may bind parameters', async () => {
    const providerIds = Array.from({ length: 150 }, (_, index) => `prv_${index}`)
    providerIds.forEach((providerId, index) => insertCheck(`check-${index}`, providerId, 'text.chat', index, '2026-10-01T00:00:00.000Z'))

    const latest = await store.getLatestProviderHealthChecks(eventFor(), { providerIds })

    expect(latest.size).toBe(150)
  })
})
