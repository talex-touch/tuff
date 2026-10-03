import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * An administrator's credit deduction, run against real SQLite.
 *
 * The plan allowance is a floor every read re-applies (`ensureBalance` raises the
 * month's quota back to it), so a deduction under it used to answer 200, write
 * its ledger row and its audit, and be undone by the very next read. The guard is
 * now the deduction's own `UPDATE` condition; only a real database evaluates it,
 * which is why these tests do not fake the statements.
 */

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))

const teamMocks = vi.hoisted(() => ({
  getTeamQuota: vi.fn(),
}))

vi.mock('./subscriptionStore', () => subscriptionMocks)
vi.mock('./teamStore', () => teamMocks)

/** The `auth_*` tables `authStore` owns, cut to the columns `creditsStore` reads (the FREE boost check). */
const AUTH_DDL = `
  CREATE TABLE auth_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    email_verified TEXT,
    email_state TEXT NOT NULL DEFAULT 'unverified',
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE auth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE auth_passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`

const USER = 'user_1'
const MONTH = '2026-10'

let store: typeof import('./creditsStore')
let d1: SqliteD1Database
let event: H3Event

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  // The store creates its tables once per module instance; a fresh module runs
  // that DDL again on each test's fresh database.
  vi.resetModules()
  store = await import('./creditsStore')

  d1 = createSqliteD1()
  d1.sqlite.exec(AUTH_DDL)
  d1.sqlite
    .prepare(`INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, ?)`)
    .run(USER, 'owner@example.com', '2026-01-01T00:00:00.000Z')
  event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event

  subscriptionMocks.getUserSubscription.mockReset().mockResolvedValue({ plan: 'FREE' })
  teamMocks.getTeamQuota.mockReset().mockResolvedValue({ seatsLimit: 5 })
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

/** Opens the user's month through the store (which also creates its tables), then sets the balance. */
async function seedBalance(userId: string, balance: { quota: number, used: number }) {
  await store.getUserCreditAdjustLimits(event, userId)
  d1.sqlite
    .prepare(`UPDATE credit_balances SET quota = ?, used = ? WHERE scope = 'user' AND scope_id = ? AND month = ?`)
    .run(balance.quota, balance.used, userId, MONTH)
}

function balanceOf(userId: string) {
  const row = d1.sqlite
    .prepare(`SELECT quota, used FROM credit_balances WHERE scope = 'user' AND scope_id = ? AND month = ?`)
    .get(userId, MONTH)
  return row ? { quota: Number(row.quota), used: Number(row.used) } : null
}

function ledgerOf(userId: string) {
  return d1.sqlite
    .prepare(`SELECT delta, reason FROM credit_ledger WHERE scope = 'user' AND scope_id = ? ORDER BY created_at, rowid`)
    .all(userId)
    .map(row => ({ delta: Number(row.delta), reason: String(row.reason) }))
}

/** A verified email, a linked OAuth account and a passkey, all from `at`: a FREE account then earns the boosted allowance. */
function completeProfile(userId: string, at: string) {
  d1.sqlite.prepare(`UPDATE auth_users SET email_state = 'verified', email_verified = ? WHERE id = ?`).run(at, userId)
  d1.sqlite
    .prepare(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at) VALUES (?, ?, 'github', ?, ?)`)
    .run(`account_${userId}`, userId, `gh_${userId}`, at)
  d1.sqlite
    .prepare(`INSERT INTO auth_passkeys (id, user_id, credential_id, public_key, created_at) VALUES (?, ?, ?, 'key', ?)`)
    .run(`passkey_${userId}`, userId, `credential_${userId}`, at)
}

async function refusalOf(adjusting: Promise<unknown>) {
  const outcome = await adjusting.then(
    () => null,
    (error: unknown) => error,
  )
  expect(outcome).toBeInstanceOf(store.CreditDeductLimitError)
  return outcome as InstanceType<typeof store.CreditDeductLimitError>
}

describe('adjustUserCredits: the deduction floor', () => {
  it.each([
    ['FREE', 20000],
    ['PRO', 240000],
  ])('refuses a deduction from a %s user at the plan allowance and writes nothing', async (plan, allowance) => {
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan })
    await seedBalance(USER, { quota: allowance, used: 4670 })

    const refusal = await refusalOf(store.adjustUserCredits(event, USER, -100, 'probe'))

    expect(refusal.errorCode).toBe('CREDITS_DEDUCT_LIMIT')
    expect(refusal.limits).toEqual({ planFloor: allowance, used: 4670, quota: allowance, maxDeduct: 0 })
    expect(balanceOf(USER)).toEqual({ quota: allowance, used: 4670 })
    expect(ledgerOf(USER)).toEqual([])
  })

  it('keeps a deduction within the limit: the next read returns the lowered quota', async () => {
    await seedBalance(USER, { quota: 20500, used: 5100 })

    await expect(store.adjustUserCredits(event, USER, -100, 'probe'))
      .resolves.toMatchObject({ userId: USER, delta: -100, reason: 'probe' })

    // Before the fix this read raised the quota back to the allowance.
    const summary = await store.getCreditSummary(event, USER)
    expect(summary.user).toMatchObject({ quota: 20400, used: 5100 })
    expect(balanceOf(USER)).toEqual({ quota: 20400, used: 5100 })
    expect(ledgerOf(USER)).toEqual([{ delta: -100, reason: 'probe' }])
    await expect(store.getUserCreditAdjustLimits(event, USER))
      .resolves.toEqual({ planFloor: 20000, used: 5100, quota: 20400, maxDeduct: 400 })
  })

  it('refuses a deduction across the floor whole instead of clamping it to the floor', async () => {
    await seedBalance(USER, { quota: 20400, used: 5100 })

    const refusal = await refusalOf(store.adjustUserCredits(event, USER, -1000, 'probe'))

    expect(refusal.limits).toEqual({ planFloor: 20000, used: 5100, quota: 20400, maxDeduct: 400 })
    expect(balanceOf(USER)).toEqual({ quota: 20400, used: 5100 })
    expect(ledgerOf(USER)).toEqual([])

    // The whole limit lands exactly on the floor; from there nothing more can go.
    await store.adjustUserCredits(event, USER, -400, 'to the floor')
    expect(balanceOf(USER)).toEqual({ quota: 20000, used: 5100 })
    const atFloor = await refusalOf(store.adjustUserCredits(event, USER, -1, 'probe'))
    expect(atFloor.limits).toEqual({ planFloor: 20000, used: 5100, quota: 20000, maxDeduct: 0 })
    expect(ledgerOf(USER)).toEqual([{ delta: -400, reason: 'to the floor' }])
  })

  it('takes the limit from this month\'s usage when it is above the plan allowance', async () => {
    await seedBalance(USER, { quota: 30000, used: 25000 })

    const refusal = await refusalOf(store.adjustUserCredits(event, USER, -5001, 'probe'))
    expect(refusal.limits).toEqual({ planFloor: 20000, used: 25000, quota: 30000, maxDeduct: 5000 })
    expect(balanceOf(USER)).toEqual({ quota: 30000, used: 25000 })

    await store.adjustUserCredits(event, USER, -5000, 'probe')
    expect(balanceOf(USER)).toEqual({ quota: 25000, used: 25000 })
    expect(ledgerOf(USER)).toEqual([{ delta: -5000, reason: 'probe' }])
  })

  it('adds credits as before, at the floor included', async () => {
    await seedBalance(USER, { quota: 20000, used: 4670 })

    await expect(store.adjustUserCredits(event, USER, 500, 'promo')).resolves.toMatchObject({ delta: 500 })

    expect(balanceOf(USER)).toEqual({ quota: 20500, used: 4670 })
    expect(ledgerOf(USER)).toEqual([{ delta: 500, reason: 'promo' }])
    expect((await store.getCreditSummary(event, USER)).user).toMatchObject({ quota: 20500 })
  })

  it('holds the boosted FREE allowance as the floor once the profile was completed in an earlier month', async () => {
    completeProfile(USER, '2026-08-20T00:00:00.000Z')

    // The month opens at the boosted allowance, which is then the floor.
    await expect(store.getUserCreditAdjustLimits(event, USER))
      .resolves.toEqual({ planFloor: 40000, used: 0, quota: 40000, maxDeduct: 0 })
    await refusalOf(store.adjustUserCredits(event, USER, -100, 'probe'))

    await store.adjustUserCredits(event, USER, 1000, 'promo')
    const refusal = await refusalOf(store.adjustUserCredits(event, USER, -1500, 'probe'))
    expect(refusal.limits).toEqual({ planFloor: 40000, used: 0, quota: 41000, maxDeduct: 1000 })

    await store.adjustUserCredits(event, USER, -1000, 'probe')
    expect(balanceOf(USER)).toEqual({ quota: 40000, used: 0 })
    expect((await store.getCreditSummary(event, USER)).user).toMatchObject({ quota: 40000 })
  })

  it('lets one of two concurrent deductions through when together they would cross the floor', async () => {
    await seedBalance(USER, { quota: 20500, used: 0 })

    // Each statement yields first (see the D1 shim), so the two calls interleave:
    // a read-then-write would let both through on the same stale quota.
    const outcomes = await Promise.allSettled([
      store.adjustUserCredits(event, USER, -300, 'first'),
      store.adjustUserCredits(event, USER, -300, 'second'),
    ])

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const refused = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    expect(refused?.reason).toBeInstanceOf(store.CreditDeductLimitError)
    expect(refused?.reason.limits).toEqual({ planFloor: 20000, used: 0, quota: 20200, maxDeduct: 200 })
    expect(balanceOf(USER)).toEqual({ quota: 20200, used: 0 })
    expect(ledgerOf(USER)).toHaveLength(1)
  })
})
