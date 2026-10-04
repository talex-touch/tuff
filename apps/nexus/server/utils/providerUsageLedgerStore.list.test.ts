import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'
import { listProviderUsageLedgerEntries } from './providerUsageLedgerStore'

/**
 * The usage ledger list filters, run against real SQLite.
 *
 * 需关注 and 估算 are the store's own `WHERE` conditions, so only a real database
 * evaluates them; a fake that matches statements by their text would agree with
 * whatever condition the store happened to write.
 */

let d1: SqliteD1Database
let event: H3Event

async function insertLedgerRow(id: string, status: string, estimated: boolean, createdAt: string) {
  await d1.prepare(`
    INSERT INTO provider_usage_ledger (
      id, run_id, scene_id, mode, status, strategy_mode, capability, provider_id,
      unit, quantity, billable, estimated, pricing_ref, provider_usage_ref,
      error_code, error_message, trace_json, fallback_trail_json, selected_json, created_at
    )
    VALUES (?, ?, 'corebox.selection.translate', 'execute', ?, 'priority', 'text.translate', 'prv_a',
      'characters', 10, 1, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', ?)
  `).bind(id, `run_${id}`, status, estimated, createdAt).run()
}

function ids(list: { entries: Array<{ id: string }> }) {
  return list.entries.map(entry => entry.id)
}

beforeEach(async () => {
  d1 = createSqliteD1()
  event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
  // The store creates its table on first use.
  await listProviderUsageLedgerEntries(event)
  await insertLedgerRow('completed', 'completed', false, '2026-10-01T00:00:00.000Z')
  await insertLedgerRow('estimated', 'completed', true, '2026-10-02T00:00:00.000Z')
  await insertLedgerRow('failed', 'failed', false, '2026-10-03T00:00:00.000Z')
  await insertLedgerRow('planned', 'planned', false, '2026-10-04T00:00:00.000Z')
})

describe('listProviderUsageLedgerEntries filters', () => {
  it('returns every row, newest first, when no filter is given', async () => {
    const list = await listProviderUsageLedgerEntries(event)

    expect(ids(list)).toEqual(['planned', 'failed', 'estimated', 'completed'])
    expect(list.total).toBe(4)
  })

  it('keeps the failed, planned and estimated rows for attention', async () => {
    const list = await listProviderUsageLedgerEntries(event, { attention: true })

    expect(ids(list)).toEqual(['planned', 'failed', 'estimated'])
    expect(list.total).toBe(3)
  })

  it('keeps only the estimated rows for estimated', async () => {
    const list = await listProviderUsageLedgerEntries(event, { estimated: true })

    expect(ids(list)).toEqual(['estimated'])
    expect(list.total).toBe(1)
  })

  it('combines attention with a status', async () => {
    const list = await listProviderUsageLedgerEntries(event, { attention: true, status: 'failed' })

    expect(ids(list)).toEqual(['failed'])
    expect(list.total).toBe(1)
  })

  it('counts every filtered row in total, whatever the page', async () => {
    const list = await listProviderUsageLedgerEntries(event, { attention: true, limit: 1, page: 2 })

    expect(ids(list)).toEqual(['failed'])
    expect(list).toMatchObject({ page: 2, limit: 1, total: 3 })
  })

  it('treats false like an absent filter', async () => {
    const list = await listProviderUsageLedgerEntries(event, { attention: false, estimated: false })

    expect(list.total).toBe(4)
  })
})
