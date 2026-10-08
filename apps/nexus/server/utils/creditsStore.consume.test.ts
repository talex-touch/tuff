import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * Debits and releases against real SQLite. The guards that decide whether money moves are SQL
 * conditions, so only a real database can say whether they hold.
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

const USER = 'user_1'
const MONTH = '2026-10'

let store: typeof import('./creditsStore')
let d1: SqliteD1Database

function eventFor(db: unknown = d1): H3Event {
  return { context: { cloudflare: { env: { DB: db } } } } as unknown as H3Event
}

function balance(scope: 'team' | 'user', scopeId: string, month = MONTH) {
  const row = d1.sqlite.prepare('SELECT quota, used FROM credit_balances WHERE scope = ? AND scope_id = ? AND month = ?').get(scope, scopeId, month) as { quota: number, used: number } | undefined
  return row ? { quota: Number(row.quota), used: Number(row.used) } : null
}

function ledgerCount() {
  return (d1.sqlite.prepare('SELECT COUNT(*) AS n FROM credit_ledger').get() as { n: number }).n
}

function countingD1(inner: SqliteD1Database) {
  let roundTrips = 0
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return inner.batch(statements)
    },
  }
  return { db: db as unknown as D1Database, roundTrips: () => roundTrips }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  vi.resetModules()
  store = await import('./creditsStore')
  d1 = createSqliteD1()
  d1.sqlite.exec(AUTH_DDL)
  d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')`).run(USER, 'u1@example.com')
  subscriptionMocks.getUserSubscription.mockReset().mockResolvedValue({ plan: 'FREE' })
  teamMocks.getTeamQuota.mockReset().mockResolvedValue({ seatsLimit: 5 })
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

describe('consumeCredits', () => {
  it('opens the month, writes the ledger row and moves both balances', async () => {
    const result = await store.consumeCredits(eventFor(), USER, 120, 'probe', { a: 1 })

    expect(result).toMatchObject({ teamId: `team_${USER}`, userId: USER, amount: 120, reason: 'probe', metadata: { a: 1, userId: USER } })
    expect(balance('user', USER)).toEqual({ quota: 20000, used: 120 })
    expect(balance('team', `team_${USER}`)).toEqual({ quota: 2000000, used: 120 })
    expect(ledgerCount()).toBe(1)
  })

  it('refuses a debit the user cannot afford and writes nothing for it', async () => {
    await store.consumeCredits(eventFor(), USER, 19900, 'probe')

    await expect(store.consumeCredits(eventFor(), USER, 200, 'probe')).rejects.toThrow('User credits exceeded.')
    expect(balance('user', USER)).toEqual({ quota: 20000, used: 19900 })
    expect(ledgerCount()).toBe(1)
  })

  it('refuses a debit the team pool cannot afford', async () => {
    await store.consumeCredits(eventFor(), USER, 1, 'probe')
    d1.sqlite.prepare(`UPDATE credit_balances SET used = quota WHERE scope = 'team'`).run()

    await expect(store.consumeCredits(eventFor(), USER, 1, 'probe')).rejects.toThrow('Team credits exceeded.')
  })

  it('returns the first debit for a repeated key, even once the balance is spent', async () => {
    const first = await store.consumeCredits(eventFor(), USER, 20000, 'probe', {}, { idempotencyKey: 'probe-key-0001' })
    const again = await store.consumeCredits(eventFor(), USER, 20000, 'probe', {}, { idempotencyKey: 'probe-key-0001' })

    expect(again.ledgerId).toBe(first.ledgerId)
    expect(balance('user', USER)).toEqual({ quota: 20000, used: 20000 })
    expect(ledgerCount()).toBe(1)
  })

  it('fails closed when a key is reused for another payload', async () => {
    await store.consumeCredits(eventFor(), USER, 10, 'probe', {}, { idempotencyKey: 'probe-key-0001' })
    await expect(store.consumeCredits(eventFor(), USER, 11, 'probe', {}, { idempotencyKey: 'probe-key-0001' })).rejects.toThrow('Credit idempotency conflict.')
  })

  it('debits once for concurrent requests with the same key', async () => {
    await store.consumeCredits(eventFor(), USER, 1, 'warm')
    const results = await Promise.all([1, 2, 3].map(() => store.consumeCredits(eventFor(), USER, 50, 'probe', {}, { idempotencyKey: 'probe-key-concurrent' })))

    expect(new Set(results.map(result => result.ledgerId)).size).toBe(1)
    expect(balance('user', USER)).toEqual({ quota: 20000, used: 51 })
  })

  it('raises the user floor to the boosted allowance once the profile was completed in an earlier month', async () => {
    d1.sqlite.exec(`
      UPDATE auth_users SET email_state = 'verified', email_verified = '2026-08-01T00:00:00.000Z' WHERE id = '${USER}';
      INSERT INTO auth_accounts VALUES ('a1', '${USER}', 'github', 'gh', '2026-08-01T00:00:00.000Z');
      INSERT INTO auth_passkeys VALUES ('p1', '${USER}', 'c1', 'k', '2026-08-01T00:00:00.000Z');
    `)
    await store.consumeCredits(eventFor(), USER, 30000, 'probe')
    expect(balance('user', USER)).toEqual({ quota: 40000, used: 30000 })
  })

  it('takes two round trips for a FREE user in a personal team', async () => {
    await store.consumeCredits(eventFor(), USER, 1, 'warm')
    const counting = countingD1(d1)
    await store.consumeCredits(eventFor(counting.db), USER, 1, 'warm-binding')
    const before = counting.roundTrips()

    await store.consumeCredits(eventFor(counting.db), USER, 1, 'probe', {}, { idempotencyKey: 'probe-key-roundtrip' })

    // The plan is read beside the first batch (mocked here).
    expect(counting.roundTrips() - before).toBe(2)
  })
})

describe('releaseConsumedCredits', () => {
  it('releases a reservation into the month it was taken, after the month turned', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:00.000Z'))
    const hold = await store.consumeCredits(eventFor(), USER, 500, 'intelligence-invoke-reserve')

    vi.setSystemTime(new Date('2026-11-01T00:01:00.000Z'))
    const released = await store.releaseConsumedCredits(eventFor(), USER, 200, 'intelligence-invoke-release', {}, {
      idempotencyKey: 'release-key-0001',
      reservationLedgerId: hold.ledgerId,
    })

    expect(released.amount).toBe(200)
    expect(balance('user', USER, '2026-10')).toEqual({ quota: 20000, used: 300 })
    expect(balance('user', USER, '2026-11')).toBeNull()
  })

  it('returns the first release for a repeated key', async () => {
    const hold = await store.consumeCredits(eventFor(), USER, 500, 'reserve')
    const options = { idempotencyKey: 'release-key-0002', reservationLedgerId: hold.ledgerId }
    const first = await store.releaseConsumedCredits(eventFor(), USER, 100, 'release', {}, options)
    const again = await store.releaseConsumedCredits(eventFor(), USER, 100, 'release', {}, options)

    expect(again.ledgerId).toBe(first.ledgerId)
    expect(balance('user', USER)).toEqual({ quota: 20000, used: 400 })
  })
})
