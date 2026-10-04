import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'
import { listProviderHealthChecks } from './providerHealthStore'

/**
 * The health check list filters, run against real SQLite: several statuses at
 * once are the store's own `IN` condition, which only a real database evaluates.
 */

let d1: SqliteD1Database
let event: H3Event

async function insertCheck(id: string, status: string, checkedAt: string) {
  await d1.prepare(`
    INSERT INTO provider_health_checks (
      id, provider_id, provider_name, vendor, capability, status, latency_ms, endpoint,
      request_id, degraded_reason, error_code, error_message, checked_at
    )
    VALUES (?, 'prv_a', 'Provider A', 'openai', 'text.chat', ?, 120, 'https://example.invalid',
      NULL, NULL, NULL, NULL, ?)
  `).bind(id, status, checkedAt).run()
}

function ids(list: { entries: Array<{ id: string }> }) {
  return list.entries.map(entry => entry.id)
}

beforeEach(async () => {
  d1 = createSqliteD1()
  event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
  // The store creates its table on first use.
  await listProviderHealthChecks(event)
  await insertCheck('healthy', 'healthy', '2026-10-01T00:00:00.000Z')
  await insertCheck('degraded', 'degraded', '2026-10-02T00:00:00.000Z')
  await insertCheck('unhealthy', 'unhealthy', '2026-10-03T00:00:00.000Z')
})

describe('listProviderHealthChecks status filter', () => {
  it('returns the checks in any of several statuses', async () => {
    const list = await listProviderHealthChecks(event, { status: 'degraded,unhealthy' })

    expect(ids(list)).toEqual(['unhealthy', 'degraded'])
    expect(list.total).toBe(2)
  })

  it('still filters on a single status', async () => {
    const list = await listProviderHealthChecks(event, { status: 'healthy' })

    expect(ids(list)).toEqual(['healthy'])
    expect(list.total).toBe(1)
  })

  it('ignores surrounding spaces and repeated statuses', async () => {
    const list = await listProviderHealthChecks(event, { status: ' degraded , degraded ' })

    expect(ids(list)).toEqual(['degraded'])
  })

  it('refuses a list with an unknown or empty status', async () => {
    await expect(listProviderHealthChecks(event, { status: 'degraded,bogus' }))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: 'status is invalid.' })
    await expect(listProviderHealthChecks(event, { status: 'degraded,' }))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: 'status is invalid.' })
  })

  it('returns every check when no status is given', async () => {
    const list = await listProviderHealthChecks(event)

    expect(list.total).toBe(3)
  })
})
