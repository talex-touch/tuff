import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * Releases of held credits against real SQLite: one release per business key, into the team and
 * month that took the hold, and legacy release rows replayable exactly once.
 */

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))
const teamMocks = vi.hoisted(() => ({
  getTeamQuota: vi.fn(),
}))

vi.mock('./subscriptionStore', () => subscriptionMocks)
vi.mock('./teamStore', () => teamMocks)

const AUTH_DDL = `
  CREATE TABLE auth_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, email_verified TEXT,
    email_state TEXT NOT NULL DEFAULT 'unverified', role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
  );
  CREATE TABLE auth_accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE auth_passkeys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, created_at TEXT NOT NULL);
`

let store: typeof import('./creditsStore')
let d1: SqliteD1Database
let event: H3Event

function used(scope: 'team' | 'user', scopeId: string, month: string): number | undefined {
  const row = d1.sqlite.prepare('SELECT used FROM credit_balances WHERE scope = ? AND scope_id = ? AND month = ?').get(scope, scopeId, month) as { used: number } | undefined
  return row === undefined ? undefined : Number(row.used)
}

function releases() {
  return d1.sqlite.prepare(`SELECT id, scope_id FROM credit_ledger WHERE reason = 'asr-reservation-release'`).all() as Array<{ id: string, scope_id: string }>
}

function insertLedger(row: { id: string, scopeId: string, delta: number, reason: string, createdAt: string, metadata: string }) {
  d1.sqlite.prepare(`INSERT INTO credit_ledger (id, scope, scope_id, delta, reason, created_at, metadata) VALUES (?, 'team', ?, ?, ?, ?, ?)`)
    .run(row.id, row.scopeId, row.delta, row.reason, row.createdAt, row.metadata)
}

function setUsed(scope: 'team' | 'user', scopeId: string, month: string, value: number) {
  d1.sqlite.prepare(`
    INSERT INTO credit_balances (scope, scope_id, month, quota, used) VALUES (?, ?, ?, 100000, ?)
    ON CONFLICT(scope, scope_id, month) DO UPDATE SET used = excluded.used
  `).run(scope, scopeId, month, value)
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./creditsStore')
  d1 = createSqliteD1()
  d1.sqlite.exec(AUTH_DDL)
  d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES ('user_1', 'u1@example.com', '2026-01-01T00:00:00.000Z')`).run()
  event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
  subscriptionMocks.getUserSubscription.mockReset().mockResolvedValue({ plan: 'PRO' })
  teamMocks.getTeamQuota.mockReset()
  // Creates the credit tables.
  await store.getCreditSummary(event, 'user_1')
})

afterEach(() => {
  d1.close()
})

describe('releaseConsumedCredits reservation idempotency', () => {
  it('releases a reservation once from both held balances when retried with its business key', async () => {
    const month = new Date().toISOString().slice(0, 7)
    setUsed('team', 'team_user_1', month, 13)
    setUsed('user', 'user_1', month, 13)
    const idempotencyKey = 'asr-release:request-1:0'

    const first = await store.releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', { requestId: 'request-1' }, { idempotencyKey })
    const second = await store.releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', { requestId: 'request-1' }, { idempotencyKey })

    expect(second.ledgerId).toBe(first.ledgerId)
    expect(second.amount).toBe(7)
    expect(releases()).toHaveLength(1)
    expect(used('team', 'team_user_1', month)).toBe(6)
    expect(used('user', 'user_1', month)).toBe(6)
  })

  /**
   * A held ASR request can outlive a team switch. Releasing against the active team then would
   * credit a bucket the hold never touched — and leave the original team short.
   */
  it('releases against the reservation ledger’s original team and month even after the active team changes', async () => {
    const reservationId = 'ledger_reservation_1'
    const reservationMonth = '2026-08'
    insertLedger({
      id: reservationId,
      scopeId: 'team_original',
      delta: -10,
      reason: 'asr-reservation',
      createdAt: '2026-08-05T00:00:00.000Z',
      metadata: JSON.stringify({ userId: 'user_1' }),
    })
    setUsed('team', 'team_original', reservationMonth, 10)
    setUsed('user', 'user_1', reservationMonth, 10)
    // The team active *now* is a different bucket; a naive release would use it (and the
    // current month) instead of the ledger that actually took the hold.
    const activeMonth = new Date().toISOString().slice(0, 7)
    setUsed('team', 'team_user_1', activeMonth, 4)
    setUsed('user', 'user_1', activeMonth, 4)

    const options = { idempotencyKey: 'asr-release:request-1:0', reservationLedgerId: reservationId }
    const first = await store.releaseConsumedCredits(event, 'user_1', 10, 'asr-reservation-release', { requestId: 'request-1' }, options)
    const second = await store.releaseConsumedCredits(event, 'user_1', 10, 'asr-reservation-release', { requestId: 'request-1' }, options)

    expect(first.teamId).toBe('team_original')
    expect(used('team', 'team_original', reservationMonth)).toBe(0)
    expect(used('user', 'user_1', reservationMonth)).toBe(0)
    expect(used('team', 'team_user_1', activeMonth)).toBe(4)
    expect(used('user', 'user_1', activeMonth)).toBe(4)

    // A retry with the same business key collapses onto the one release entry, not a second refund.
    expect(second.ledgerId).toBe(first.ledgerId)
    expect(releases()).toEqual([{ id: first.ledgerId, scope_id: 'team_original' }])
  })

  /**
   * Requests admitted before release learned about reservation ledgers already wrote their
   * release entry — with a hash that has no ledger in its metadata. Those rows must be
   * replayable exactly once, or a retried release either double-refunds or strands the hold.
   */
  it('accepts a legacy release entry whose metadata predates the reservation ledger, then rejects altered replays', async () => {
    const idempotencyKey = 'asr-release:request-1:0'
    const month = new Date().toISOString().slice(0, 7)
    setUsed('team', 'team_user_1', month, 13)
    setUsed('user', 'user_1', month, 13)
    const reservationId = 'ledger_reservation_legacy'
    insertLedger({
      id: reservationId,
      scopeId: 'team_user_1',
      delta: -7,
      reason: 'asr-reservation',
      createdAt: `${month}-05T00:00:00.000Z`,
      metadata: JSON.stringify({ userId: 'user_1' }),
    })

    // The old release path: no reservation option, so the hash covers metadata without a ledger.
    const legacy = await store.releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', { requestId: 'request-1' }, { idempotencyKey })
    // The current path replays the same release while pointing at the reservation ledger.
    const replayed = await store.releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', { requestId: 'request-1' }, { idempotencyKey, reservationLedgerId: reservationId })

    expect(replayed.ledgerId).toBe(legacy.ledgerId)
    expect(releases()).toHaveLength(1)
    expect(used('team', 'team_user_1', month)).toBe(6)
    expect(used('user', 'user_1', month)).toBe(6)

    // Same business key, different money: not the same release.
    await expect(store.releaseConsumedCredits(event, 'user_1', 6, 'asr-reservation-release', { requestId: 'request-1' }, { idempotencyKey, reservationLedgerId: reservationId }))
      .rejects.toThrow('Credit idempotency conflict.')
    // Same key and amount, different request: still not the same release.
    await expect(store.releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', { requestId: 'request-2' }, { idempotencyKey, reservationLedgerId: reservationId }))
      .rejects.toThrow('Credit idempotency conflict.')

    expect(releases()).toHaveLength(1)
    expect(used('team', 'team_user_1', month)).toBe(6)
  })
})
