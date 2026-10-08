import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * The credit summary and the allowance policy it reports, against real SQLite: the batch it reads in
 * is the store's own SQL, so a balance read from the wrong team or a boost derived from the wrong
 * facts shows up here.
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
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE auth_passkeys (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, created_at TEXT NOT NULL
  );
`

const USER = 'user_1'

let store: typeof import('./creditsStore')
let d1: SqliteD1Database

/** Counts round trips: one per statement run on its own, one per batch. */
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

function eventFor(db: unknown = d1): H3Event {
  return { context: { cloudflare: { env: { DB: db } } } } as unknown as H3Event
}

function completeProfile(userId: string, at: string) {
  d1.sqlite.prepare(`UPDATE auth_users SET email_state = 'verified', email_verified = ? WHERE id = ?`).run(at, userId)
  d1.sqlite.prepare(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at) VALUES (?, ?, 'github', ?, ?)`)
    .run(`account_${userId}`, userId, `gh_${userId}`, at)
  d1.sqlite.prepare(`INSERT INTO auth_passkeys (id, user_id, credential_id, public_key, created_at) VALUES (?, ?, ?, 'key', ?)`)
    .run(`passkey_${userId}`, userId, `credential_${userId}`, at)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  vi.resetModules()
  store = await import('./creditsStore')
  d1 = createSqliteD1()
  d1.sqlite.exec(AUTH_DDL)
  d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, ?)`).run(USER, 'owner@example.com', '2026-01-01T00:00:00.000Z')
  subscriptionMocks.getUserSubscription.mockReset().mockResolvedValue({ plan: 'FREE' })
  teamMocks.getTeamQuota.mockReset().mockResolvedValue({ seatsLimit: 5 })
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

describe('credit allowance policy', () => {
  it('grants a free account the shipped monthly allowance', async () => {
    const summary = await store.getCreditSummary(eventFor(), USER)

    expect(summary.user?.quota).toBe(20000)
    expect(summary.teamContext).toMatchObject({ id: `team_${USER}`, type: 'personal', hasTeamPool: false })
    expect(summary.boost).toMatchObject({ eligible: false, claimedThisMonth: false, canClaimNow: false })
  })

  it('doubles the free allowance for a completed profile without reaching the cheapest paid tier', async () => {
    completeProfile(USER, '2026-08-01T00:00:00.000Z')
    const boostedSummary = await store.getCreditSummary(eventFor(), USER)

    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PLUS' })
    d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES ('plus_user', 'plus@example.com', '2026-01-01T00:00:00.000Z')`).run()
    const plusSummary = await store.getCreditSummary(eventFor(), 'plus_user')

    // Verifying an email and binding a passkey must not add up to a paid plan.
    expect(boostedSummary.user?.quota).toBe(40000)
    expect(boostedSummary.boost).toMatchObject({ eligible: true, requirements: { emailVerified: true, oauthLinked: true, passkeyBound: true } })
    expect(Number(boostedSummary.user?.quota)).toBeLessThan(Number(plusSummary.user?.quota))
    expect(plusSummary.boost).toBeNull()
  })

  it('keeps the base allowance in the month the profile was completed', async () => {
    completeProfile(USER, '2026-10-02T00:00:00.000Z')
    const summary = await store.getCreditSummary(eventFor(), USER)
    expect(summary.user?.quota).toBe(20000)
    expect(summary.boost).toMatchObject({ eligible: true, canClaimNow: true })
  })

  it('adds the shipped daily check-in reward to the month balance', async () => {
    const claim = await store.claimDailyCheckin(eventFor(), USER)
    const summary = await store.getCreditSummary(eventFor(), USER)

    expect(claim).toMatchObject({ claimed: true, reward: 500 })
    expect(summary.user?.quota).toBe(20000 + 500)
  })

  it('keeps a whole month of check-ins inside the allowance they top up', async () => {
    const checkin = await store.getCheckinStatus(eventFor(), USER)
    const summary = await store.getCreditSummary(eventFor(), USER)

    expect(checkin.reward * 30).toBeLessThan(Number(summary.user!.quota))
  })

  it('reads the organization pool when the user belongs to one', async () => {
    await store.getCreditSummary(eventFor(), USER)
    d1.sqlite.exec(`
      INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES ('org_1', 'Org', 'organization', 'owner_9', '2026-01-01T00:00:00.000Z');
      INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('org_1', '${USER}', 'member', '2026-02-01T00:00:00.000Z');
      INSERT INTO credit_balances (scope, scope_id, month, quota, used) VALUES ('team', 'org_1', '2026-10', 5000000, 123);
    `)

    const summary = await store.getCreditSummary(eventFor(), USER)

    expect(summary.teamContext).toMatchObject({ id: 'org_1', type: 'organization', hasTeamPool: true })
    expect(summary.team).toMatchObject({ scope_id: 'org_1', quota: 5000000, used: 123 })
  })

  it('answers a steady-state summary in one round trip', async () => {
    await store.getCreditSummary(eventFor(), USER)
    const counting = countingD1(d1)

    await store.getCreditSummary(eventFor(counting.db), USER)
    // The schema record is read once per binding; after that, the batch is the only round trip
    // (the plan comes from the mocked subscription store here, read in parallel in production).
    const afterWarmup = counting.roundTrips()
    await store.getCreditSummary(eventFor(counting.db), USER)
    expect(counting.roundTrips() - afterWarmup).toBe(1)
  })
})

describe('claims', () => {
  function userQuota(userId = USER): number | undefined {
    const row = d1.sqlite.prepare(`SELECT quota FROM credit_balances WHERE scope = 'user' AND scope_id = ? AND month = '2026-10'`).get(userId) as { quota: number } | undefined
    return row === undefined ? undefined : Number(row.quota)
  }

  function ledger(reason: string) {
    return d1.sqlite.prepare(`SELECT delta FROM credit_ledger WHERE reason = ?`).all(reason).map(row => Number((row as { delta: number }).delta))
  }

  /** Makes every insert into `table` fail, as a write the database refuses mid-batch would. */
  function failInserts(table: string) {
    d1.sqlite.exec(`CREATE TRIGGER fail_${table} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is down'); END;`)
    return () => d1.sqlite.exec(`DROP TRIGGER fail_${table}`)
  }

  it('pays a racing day\'s check-in once', async () => {
    const claims = await Promise.all([
      store.claimDailyCheckin(eventFor(), USER),
      store.claimDailyCheckin(eventFor(), USER),
    ])

    expect(claims.map(claim => claim.claimed).sort()).toEqual([false, true])
    expect(userQuota()).toBe(20000 + 500)
    expect(ledger('daily-checkin')).toEqual([500])
    expect(await store.claimDailyCheckin(eventFor(), USER)).toEqual({ claimed: false, day: '2026-10-15', reward: 500 })
  })

  it('leaves the day unclaimed when the reward cannot be written', async () => {
    await store.getCreditSummary(eventFor(), USER)
    const restore = failInserts('credit_ledger')

    await expect(store.claimDailyCheckin(eventFor(), USER)).rejects.toThrow(/credit_ledger is down/)
    expect(userQuota()).toBe(20000)
    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM credit_checkins`).get()).toEqual({ n: 0 })

    restore()
    expect(await store.claimDailyCheckin(eventFor(), USER)).toMatchObject({ claimed: true })
    expect(userQuota()).toBe(20000 + 500)
  })

  it('checks in with one read and one batch', async () => {
    await store.getCreditSummary(eventFor(), USER)
    const counting = countingD1(d1)

    await store.claimDailyCheckin(eventFor(counting.db), USER)
    // The schema record is read once per binding.
    const afterWarmup = counting.roundTrips()
    vi.setSystemTime(new Date('2026-10-16T08:00:00.000Z'))
    expect(await store.claimDailyCheckin(eventFor(counting.db), USER)).toMatchObject({ claimed: true, day: '2026-10-16' })
    // The boost facts (the plan is mocked here; in production it is read beside them), then the batch.
    expect(counting.roundTrips() - afterWarmup).toBe(2)
  })

  it('raises a completed profile to the boosted allowance once, however many claims race', async () => {
    completeProfile(USER, '2026-10-02T00:00:00.000Z')

    const claims = await Promise.all([
      store.claimCreditBoost(eventFor(), USER),
      store.claimCreditBoost(eventFor(), USER),
    ])

    expect(claims.filter(claim => claim.claimed)).toEqual([
      expect.objectContaining({ eligible: true, claimed: true, delta: 20000, boost: expect.objectContaining({ claimedThisMonth: true }) }),
    ])
    expect(claims.filter(claim => !claim.claimed)).toEqual([expect.objectContaining({ eligible: true, reason: 'already-claimed' })])
    expect(userQuota()).toBe(40000)
    expect(ledger('verification-boost')).toEqual([20000])
  })

  it('does not boost again a month whose quota was lowered after the claim', async () => {
    completeProfile(USER, '2026-10-02T00:00:00.000Z')
    await store.claimCreditBoost(eventFor(), USER)
    d1.sqlite.prepare(`UPDATE credit_balances SET quota = 25000 WHERE scope = 'user' AND scope_id = ?`).run(USER)

    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ eligible: true, claimed: false, reason: 'already-claimed' })
    expect(userQuota()).toBe(25000)
    expect(ledger('verification-boost')).toEqual([20000])
  })

  it('does not boost a month lowered between two racing claims', async () => {
    completeProfile(USER, '2026-10-02T00:00:00.000Z')
    await store.getCreditSummary(eventFor(), USER)
    let batches = 0
    let queue: Promise<unknown> = Promise.resolve()
    const db = {
      prepare: (sql: string) => d1.prepare(sql),
      // One batch at a time, as D1 runs them. Both claims read an unclaimed month; between their
      // batches an administrator lowers it.
      batch: (statements: SqliteD1Statement[]) => {
        const run = queue.then(() => {
          batches += 1
          if (batches === 2)
            d1.sqlite.prepare(`UPDATE credit_balances SET quota = 25000 WHERE scope = 'user' AND scope_id = ?`).run(USER)
          return d1.batch(statements)
        })
        queue = run.catch(() => {})
        return run
      },
    }

    const claims = await Promise.all([
      store.claimCreditBoost(eventFor(db), USER),
      store.claimCreditBoost(eventFor(db), USER),
    ])

    expect(batches).toBe(2)
    expect(claims.filter(claim => claim.claimed)).toHaveLength(1)
    expect(userQuota()).toBe(25000)
    expect(ledger('verification-boost')).toEqual([20000])
  })

  it('records the claim without a ledger entry when the month already has the boosted allowance', async () => {
    // Completed in an earlier month: the floor itself is the boosted allowance.
    completeProfile(USER, '2026-08-01T00:00:00.000Z')

    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ eligible: true, claimed: true, delta: 0 })
    expect(userQuota()).toBe(40000)
    expect(ledger('verification-boost')).toEqual([])
    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ claimed: false, reason: 'already-claimed' })
  })

  it('leaves the month unclaimed and the quota as it was when the boost cannot be ledgered', async () => {
    completeProfile(USER, '2026-10-02T00:00:00.000Z')
    await store.getCreditSummary(eventFor(), USER)
    const restore = failInserts('credit_ledger')

    await expect(store.claimCreditBoost(eventFor(), USER)).rejects.toThrow(/credit_ledger is down/)
    expect(userQuota()).toBe(20000)
    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM credit_boost_claims`).get()).toEqual({ n: 0 })

    restore()
    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ claimed: true, delta: 20000 })
  })

  it('refuses paid plans and incomplete profiles without writing', async () => {
    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ eligible: false, reason: 'not-eligible' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    expect(await store.claimCreditBoost(eventFor(), USER)).toMatchObject({ eligible: false, reason: 'not-free', boost: null })
    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM credit_boost_claims`).get()).toEqual({ n: 0 })
  })
})

describe('listCreditUsageByUsers', () => {
  it('opens every member\'s month, lists them by usage and filters by search', async () => {
    d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES ('user_2', 'second@example.com', '2026-01-01T00:00:00.000Z')`).run()
    await store.getCreditSummary(eventFor(), USER)
    d1.sqlite.prepare(`UPDATE credit_balances SET used = 300 WHERE scope = 'user' AND scope_id = ?`).run(USER)

    const result = await store.listCreditUsageByUsers(eventFor(), [USER, 'user_2', USER])

    expect(result.total).toBe(2)
    expect(result.users.map(user => [user.userId, user.used, user.quota])).toEqual([
      [USER, 300, 20000],
      ['user_2', 0, 20000],
    ])
    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM team_members WHERE user_id = 'user_2' AND team_id = 'team_user_2'`).get()).toEqual({ n: 1 })

    const searched = await store.listCreditUsageByUsers(eventFor(), [USER, 'user_2'], { search: 'second' })
    expect(searched.users.map(user => user.userId)).toEqual(['user_2'])
  })

  it('takes more members than one statement may bind parameters', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `bulk_${index}`)
    const insert = d1.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')`)
    for (const id of ids)
      insert.run(id, `${id}@example.com`)

    const result = await store.listCreditUsageByUsers(eventFor(), ids, { limit: 200 })

    expect(result.total).toBe(150)
    expect(result.users).toHaveLength(150)
  })
})

describe('team ledger listings', () => {
  function insertLedger(id: string, scope: 'team' | 'user', scopeId: string, delta: number, reason: string, createdAt: string, metadata: Record<string, unknown>) {
    d1.sqlite.prepare(`INSERT INTO credit_ledger (id, scope, scope_id, delta, reason, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, scope, scopeId, delta, reason, createdAt, JSON.stringify(metadata))
  }

  const members = Array.from({ length: 40 }, (_, index) => `member_${index}`)

  beforeEach(async () => {
    await store.getCreditSummary(eventFor(), USER) // creates the credit tables
    members.forEach((member, index) => {
      d1.sqlite.prepare(`INSERT INTO auth_users (id, email, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')`).run(member, `${member}@example.com`, `Member ${index}`)
      d1.sqlite.prepare(`INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES (?, 'Personal', 'personal', ?, '2026-01-01T00:00:00.000Z')`).run(`team_${member}`, member)
      insertLedger(`l-${index}`, 'team', `team_${member}`, -(index + 1), 'intelligence-invoke', `2026-10-${String(1 + (index % 14)).padStart(2, '0')}T00:00:00.000Z`, { userId: member, traceId: `trace_${index}` })
    })
  })

  it('lists the ledger of more members than three bound copies of their ids allowed, in one round trip', async () => {
    const counting = countingD1(d1)
    await store.listCreditLedgerByUsers(eventFor(counting.db), members.slice(0, 1)) // reads the schema record
    const before = counting.roundTrips()

    const page = await store.listCreditLedgerByUsers(eventFor(counting.db), members, { limit: 200 })

    expect(counting.roundTrips() - before).toBe(1)
    expect(page.total).toBe(40)
    expect(page.entries).toHaveLength(40)
    expect(page.entries[0]).toMatchObject({ userEmail: expect.stringMatching(/@example\.com$/), teamId: expect.stringMatching(/^team_member_/) })
  })

  it('filters the members\' ledger by a search term', async () => {
    const page = await store.listCreditLedgerByUsers(eventFor(), members, { search: 'member_7@' })

    expect(page.entries.map(entry => entry.userId)).toEqual(['member_7'])
    expect(page.total).toBe(1)
  })

  it('sums the trend and nets the traces of more than a hundred ids', async () => {
    const trend = await store.listCreditTrendByUsers(eventFor(), members, { days: 30 })
    const traces = await store.listCreditLedgerByTraceIds(eventFor(), Array.from({ length: 150 }, (_, index) => `trace_${index}`))

    expect(trend.totalUsed).toBe(members.reduce((sum, _member, index) => sum + index + 1, 0))
    expect(traces).toHaveLength(40)
  })
})
