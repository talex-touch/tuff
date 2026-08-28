import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  all(sql: string) {
    if (sql.includes('PRAGMA table_info')) {
      return [
        { name: 'idempotency_key' },
        { name: 'idempotency_hash' },
      ]
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
