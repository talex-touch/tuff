import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimDailyCheckin, getCheckinStatus, getCreditSummary } from './creditsStore'

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))

const teamMocks = vi.hoisted(() => ({
  getTeamQuota: vi.fn(),
}))

vi.mock('./subscriptionStore', () => subscriptionMocks)
vi.mock('./teamStore', () => teamMocks)

interface BalanceRow {
  quota: number
  used: number
}

interface LedgerRow {
  id: string
  scopeId: string
  delta: number
  reason: string
  createdAt: string
  metadata: string | null
  idempotencyKey: string | null
  idempotencyHash: string | null
}

class MockStatement {
  args: unknown[] = []

  constructor(
    private readonly db: MockD1Database,
    readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.execute(this.sql, this.args)
  }

  async first<T>() {
    return this.db.first(this.sql, this.args) as T | null
  }

  async all<T>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

class MockD1Database {
  batchCalls = 0
  teams = new Map<string, { ownerUserId: string; type: string }>()
  members = new Map<string, { teamId: string; userId: string; role: string; joinedAt: string }>()
  balances = new Map<string, BalanceRow>()
  ledger = new Map<string, LedgerRow>()
  checkins = new Map<string, string>()
  /** The `auth_users` row a FREE boost check reads; absent means "no profile". */
  userRecord: { id: string, email_state: string, email_verified: string } | null = null
  /**
   * Rows the invoke-audit join returns. The netting it feeds reads every row of a trace,
   * so a test needs to control how many rows exist per trace.
   */
  invokeLedgerRows: Array<{
    id: string
    scope_id: string
    delta: number
    reason: string
    created_at: string
    metadata: string
    team_id: string
    owner_user_id: string
    team_type: string
    email: string
    name: string
  }> = []
  accountCount = 0
  passkeyCount = 0
  linkedAt = '2020-01-01T00:00:00.000Z'

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  async batch(statements: MockStatement[]) {
    this.batchCalls += 1
    const snapshot = this.snapshot()
    try {
      return statements.map(statement => this.execute(statement.sql, statement.args))
    }
    catch (error) {
      this.restore(snapshot)
      throw error
    }
  }

  execute(sql: string, args: unknown[]) {
    if (/(CREATE|ALTER)\s+(TABLE|INDEX)|PRAGMA/i.test(sql))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT OR IGNORE INTO teams')) {
      const [id, , ownerUserId] = args
      const key = String(id)
      if (!this.teams.has(key))
        this.teams.set(key, { ownerUserId: String(ownerUserId), type: 'personal' })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO team_members')) {
      const [teamId, userId, joinedAt] = args
      const key = `${teamId}:${userId}`
      if (!this.members.has(key)) {
        this.members.set(key, {
          teamId: String(teamId),
          userId: String(userId),
          role: 'owner',
          joinedAt: String(joinedAt),
        })
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO credit_balances')) {
      const [scope, scopeId, month, quota] = args
      const key = this.balanceKey(scope, scopeId, month)
      if (!this.balances.has(key))
        this.balances.set(key, { quota: Number(quota), used: 0 })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_balances') && sql.includes('SET quota = ?')) {
      const [quota, scope, scopeId, month] = args
      const balance = this.balances.get(this.balanceKey(scope, scopeId, month))
      if (balance && balance.quota < Number(quota))
        balance.quota = Number(quota)
      return { meta: { changes: balance ? 1 : 0 } }
    }

    if (sql.includes('INSERT INTO credit_ledger') && sql.includes('SELECT')) {
      const [
        id,
        teamId,
        delta,
        reason,
        createdAt,
        metadata,
        idempotencyKey,
        idempotencyHash,
        checkedTeamId,
        teamMonth,
        teamAmount,
        checkedUserId,
        userMonth,
        userAmount,
      ] = args
      const team = this.balances.get(this.balanceKey('team', checkedTeamId, teamMonth))
      const user = this.balances.get(this.balanceKey('user', checkedUserId, userMonth))
      if (!team || !user || team.used + Number(teamAmount) > team.quota || user.used + Number(userAmount) > user.quota)
        return { meta: { changes: 0 } }
      this.ledger.set(String(id), {
        id: String(id),
        scopeId: String(teamId),
        delta: Number(delta),
        reason: String(reason),
        createdAt: String(createdAt),
        metadata: metadata == null ? null : String(metadata),
        idempotencyKey: idempotencyKey == null ? null : String(idempotencyKey),
        idempotencyHash: idempotencyHash == null ? null : String(idempotencyHash),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_balances') && sql.includes('SET used = used + ?')) {
      const [amount, scopeId, month, ledgerId] = args
      if (!this.ledger.has(String(ledgerId)))
        return { meta: { changes: 0 } }
      const scope = sql.includes("scope = 'team'") ? 'team' : 'user'
      const balance = this.balances.get(this.balanceKey(scope, scopeId, month))
      if (!balance)
        return { meta: { changes: 0 } }
      balance.used += Number(amount)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO credit_checkins')) {
      const [userId, day, claimedAt] = args
      const key = `${userId}:${day}`
      if (this.checkins.has(key))
        return { meta: { changes: 0 } }
      this.checkins.set(key, String(claimedAt))
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_balances') && sql.includes('SET quota = quota + ?')) {
      const [delta, scopeId, month] = args
      const balance = this.balances.get(this.balanceKey('user', scopeId, month))
      if (!balance)
        return { meta: { changes: 0 } }
      balance.quota += Number(delta)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO credit_ledger') && !sql.includes('SELECT')) {
      const [id, scopeId, delta, reason, createdAt, metadata] = args
      this.ledger.set(String(id), {
        id: String(id),
        scopeId: String(scopeId),
        delta: Number(delta),
        reason: String(reason),
        createdAt: String(createdAt),
        metadata: metadata == null ? null : String(metadata),
        idempotencyKey: null,
        idempotencyHash: null,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO credit_plans') || sql.includes('UPDATE credit_plans'))
      return { meta: { changes: 1 } }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: unknown[]) {
    if (sql.includes('SELECT owner_user_id FROM teams')) {
      const team = this.teams.get(String(args[0]))
      return team ? { owner_user_id: team.ownerUserId } : null
    }

    if (sql.includes('SELECT quota, used FROM credit_balances')) {
      const scope = sql.includes("scope = 'team'") ? 'team' : 'user'
      return this.balances.get(this.balanceKey(scope, args[0], args[1])) ?? null
    }

    if (sql.includes('SELECT * FROM credit_balances')) {
      const scope = sql.includes("scope = 'team'") ? 'team' : 'user'
      return this.balances.get(this.balanceKey(scope, args[0], args[1])) ?? null
    }

    if (sql.includes('FROM auth_users'))
      return this.userRecord

    if (sql.includes('FROM auth_accounts') && sql.includes('COUNT(1)'))
      return { total: this.accountCount }

    if (sql.includes('FROM auth_passkeys') && sql.includes('COUNT(1)'))
      return { total: this.passkeyCount }

    if (sql.includes('FROM auth_accounts') && sql.includes('MAX(created_at)'))
      return { created_at: this.linkedAt }

    if (sql.includes('FROM auth_passkeys') && sql.includes('MAX(created_at)'))
      return { created_at: this.linkedAt }

    if (sql.includes('FROM credit_boost_claims'))
      return null

    if (sql.includes('SELECT id, delta, created_at, metadata, idempotency_hash')) {
      const [teamId, reason, idempotencyKey] = args
      for (const row of this.ledger.values()) {
        if (row.scopeId === teamId && row.reason === reason && row.idempotencyKey === idempotencyKey) {
          return {
            id: row.id,
            delta: row.delta,
            created_at: row.createdAt,
            metadata: row.metadata,
            idempotency_hash: row.idempotencyHash,
          }
        }
      }
    }

    return null
  }

  all(sql: string, _args?: unknown[]) {
    if (sql.includes('PRAGMA table_info')) {
      return [
        { name: 'idempotency_key' },
        { name: 'idempotency_hash' },
      ]
    }

    // The invoke-audit join. The fake applies the statement's own LIMIT to its rows, so a
    // row cap that is too small drops rows exactly as D1 would.
    if (sql.includes('FROM credit_ledger l') && sql.includes('json_extract')) {
      const limit = Number(/LIMIT\s+(\d+)/i.exec(sql)?.[1] ?? this.invokeLedgerRows.length)
      return [...this.invokeLedgerRows]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit)
    }

    if (sql.includes('FROM team_members')) {
      return [...this.members.values()].map(member => ({
        id: member.teamId,
        name: 'Personal',
        type: 'personal',
        owner_user_id: member.userId,
        role: member.role,
        joined_at: member.joinedAt,
        created_at: member.joinedAt,
      }))
    }

    return []
  }

  private balanceKey(scope: unknown, scopeId: unknown, month: unknown) {
    return `${scope}:${scopeId}:${month}`
  }

  private snapshot() {
    return {
      balances: new Map([...this.balances.entries()].map(([key, value]) => [key, { ...value }])),
      ledger: new Map([...this.ledger.entries()].map(([key, value]) => [key, { ...value }])),
    }
  }

  private restore(snapshot: ReturnType<MockD1Database['snapshot']>) {
    this.balances = snapshot.balances
    this.ledger = snapshot.ledger
  }
}

function createEvent(db: MockD1Database) {
  return {
    context: {
      cloudflare: {
        env: { DB: db },
      },
    },
  } as any
}

describe('consumeCredits idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    teamMocks.getTeamQuota.mockResolvedValue({ seatsLimit: 5 })
  })

  it('deduplicates the same business key without a second debit', async () => {
    const { consumeCredits } = await import('./creditsStore')
    const db = new MockD1Database()
    const event = createEvent(db)

    const first = await consumeCredits(event, 'user_1', 7, 'intelligence-invoke', {
      traceId: 'trace_1',
    }, {
      idempotencyKey: 'intelligence-invoke:trace_1',
    })
    const second = await consumeCredits(event, 'user_1', 7, 'intelligence-invoke', {
      traceId: 'trace_1',
    }, {
      idempotencyKey: 'intelligence-invoke:trace_1',
    })

    expect(second.ledgerId).toBe(first.ledgerId)
    expect(db.batchCalls).toBe(1)
    expect([...db.ledger.values()]).toHaveLength(1)
    expect(db.balances.get(`team:team_user_1:${first.createdAt.slice(0, 7)}`)?.used).toBe(7)
    expect(db.balances.get(`user:user_1:${first.createdAt.slice(0, 7)}`)?.used).toBe(7)
  })

  it('fails closed when the same business key points at another payload', async () => {
    const { consumeCredits } = await import('./creditsStore')
    const db = new MockD1Database()
    const event = createEvent(db)

    await consumeCredits(event, 'user_1', 7, 'intelligence-invoke', {
      traceId: 'trace_1',
    }, {
      idempotencyKey: 'intelligence-invoke:trace_1',
    })

    await expect(consumeCredits(event, 'user_1', 8, 'intelligence-invoke', {
      traceId: 'trace_1',
    }, {
      idempotencyKey: 'intelligence-invoke:trace_1',
    })).rejects.toThrow('Credit idempotency conflict.')
    expect([...db.ledger.values()]).toHaveLength(1)
  })
})

/**
 * The allowance a plan actually hands out, read through the summary the dashboard and
 * the desktop app consume. These are the numbers a FREE account plans its calls around.
 */
describe('credit allowance policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamMocks.getTeamQuota.mockResolvedValue({ seatsLimit: 5 })
  })

  it('grants a free account the shipped monthly allowance', async () => {
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })

    const summary = await getCreditSummary(createEvent(new MockD1Database()), 'user_1')

    expect(summary.user?.quota).toBe(20000)
  })

  it('doubles the free allowance for a completed profile without reaching the cheapest paid tier', async () => {
    const boosted = new MockD1Database()
    boosted.userRecord = { id: 'user_1', email_state: 'verified', email_verified: '2020-01-01T00:00:00.000Z' }
    boosted.accountCount = 1
    boosted.passkeyCount = 1

    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })
    const boostedSummary = await getCreditSummary(createEvent(boosted), 'user_1')

    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PLUS' })
    const plusSummary = await getCreditSummary(createEvent(new MockD1Database()), 'user_1')

    // Verifying an email and binding a passkey must not add up to a paid plan.
    expect(boostedSummary.user?.quota).toBe(40000)
    expect(Number(boostedSummary.user?.quota)).toBeLessThan(Number(plusSummary.user?.quota))
  })

  it('adds the shipped daily check-in reward to the month balance', async () => {
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })
    const db = new MockD1Database()

    const claim = await claimDailyCheckin(createEvent(db), 'user_1')
    const month = claim.day.slice(0, 7)

    expect(claim).toMatchObject({ claimed: true, reward: 500 })
    expect(db.balances.get(`user:user_1:${month}`)?.quota).toBe(20000 + 500)
    expect([...db.ledger.values()].filter(row => row.reason === 'daily-checkin'))
      .toEqual([expect.objectContaining({ delta: 500 })])
  })

  it('keeps a whole month of check-ins inside the allowance they top up', async () => {
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })
    const db = new MockD1Database()

    const checkin = await getCheckinStatus(createEvent(db), 'user_1')
    const summary = await getCreditSummary(createEvent(db), 'user_1')

    expect(checkin.reward * 30).toBeLessThan(Number(summary.user!.quota))
  })
})

describe('invoke audit ledger netting', () => {
  it('nets every row of a full page of traces instead of truncating its oldest rows', async () => {
    const { listCreditLedgerByTraceIds } = await import('./creditsStore')
    const db = new MockD1Database()
    const traceIds = Array.from({ length: 200 }, (_, index) => `trace_${index}`)

    // Four rows per invoke — hold, two partial releases, final release — is 800 rows for
    // a full page, more than a fixed 600-row cap could hold. The rows such a cap drops are
    // the oldest ones, which here are the holds: the netting would then report a refund in
    // place of the 7 credits each invoke actually cost.
    traceIds.forEach((traceId, traceIndex) => {
      const at = (offset: number) =>
        new Date(Date.UTC(2026, 8, 9, 0, traceIndex, offset)).toISOString()
      const row = (delta: number, reason: string, offset: number) => ({
        id: `ledger_${traceId}_${offset}`,
        scope_id: 'team_1',
        delta,
        reason,
        created_at: at(offset),
        metadata: JSON.stringify({ traceId, userId: 'user_1' }),
        team_id: 'team_1',
        owner_user_id: 'user_1',
        team_type: 'personal',
        email: 'owner@example.com',
        name: 'Owner',
      })
      db.invokeLedgerRows.push(
        row(512, 'intelligence-invoke-reserve', 0),
        row(-300, 'intelligence-invoke-release', 1),
        row(-100, 'intelligence-invoke-release', 2),
        row(-105, 'intelligence-invoke-release', 3),
      )
    })

    const entries = await listCreditLedgerByTraceIds(createEvent(db), traceIds)

    expect(entries).toHaveLength(200)
    expect(entries.map(entry => entry.metadata?.traceId).sort()).toEqual([...traceIds].sort())
    expect(entries.every(entry => entry.delta === 7)).toBe(true)
  })
})
