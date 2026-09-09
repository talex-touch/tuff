import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { H3Event, type H3Event as H3EventType } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { releaseConsumedCredits } from './creditsStore'

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))
const teamMocks = vi.hoisted(() => ({
  getTeamQuota: vi.fn(),
}))

vi.mock('./subscriptionStore', () => subscriptionMocks)
vi.mock('./teamStore', () => teamMocks)

interface Balance {
  quota: number
  used: number
}

interface LedgerEntry {
  id: string
  scopeId: string
  delta: number
  reason: string
  createdAt: string
  metadata: string
  idempotencyKey: string | null
  idempotencyHash: string | null
}

class ReleaseStatement {
  readonly args: unknown[] = []

  constructor(
    private readonly database: ReleaseDatabase,
    readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args.splice(0, this.args.length, ...args)
    return this
  }

  async run() {
    return this.database.execute(this.sql, this.args)
  }

  async first<T>() {
    return this.database.first<T>(this.sql, this.args)
  }

  async all<T>() {
    return { results: this.database.all<T>(this.sql, this.args) }
  }
}

class ReleaseDatabase {
  private readonly initialUsed: number
  private readonly teams = new Map<string, { ownerUserId: string }>()
  private readonly members = new Map<string, { teamId: string, userId: string, joinedAt: string }>()
  readonly balances = new Map<string, Balance>()
  readonly ledger = new Map<string, LedgerEntry>()

  constructor(initialUsed: number) {
    this.initialUsed = initialUsed
  }

  prepare(sql: string) {
    return new ReleaseStatement(this, sql)
  }

  async batch(statements: ReleaseStatement[]) {
    return statements.map(statement => this.execute(statement.sql, statement.args))
  }

  execute(sql: string, args: unknown[]) {
    if (/(CREATE|ALTER)\s+(TABLE|INDEX)|PRAGMA/i.test(sql))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT OR IGNORE INTO teams')) {
      const [id, , ownerUserId] = args
      this.teams.set(String(id), { ownerUserId: String(ownerUserId) })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO team_members')) {
      const [teamId, userId, joinedAt] = args
      this.members.set(`${teamId}:${userId}`, {
        teamId: String(teamId),
        userId: String(userId),
        joinedAt: String(joinedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT OR IGNORE INTO credit_balances')) {
      const [scope, scopeId, month, quota] = args
      const key = this.balanceKey(scope, scopeId, month)
      if (!this.balances.has(key))
        this.balances.set(key, { quota: Number(quota), used: this.initialUsed })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_balances') && sql.includes('SET quota = ?'))
      return { meta: { changes: 1 } }

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
        amount,
        checkedUserId,
        userMonth,
        userAmount,
      ] = args
      const team = this.balances.get(this.balanceKey('team', checkedTeamId, teamMonth))
      const user = this.balances.get(this.balanceKey('user', checkedUserId, userMonth))
      if (!team || !user || team.used < Number(amount) || user.used < Number(userAmount))
        return { meta: { changes: 0 } }
      this.ledger.set(String(id), {
        id: String(id),
        scopeId: String(teamId),
        delta: Number(delta),
        reason: String(reason),
        createdAt: String(createdAt),
        metadata: String(metadata),
        idempotencyKey: idempotencyKey == null ? null : String(idempotencyKey),
        idempotencyHash: idempotencyHash == null ? null : String(idempotencyHash),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_balances') && sql.includes('SET used = used - ?')) {
      const [amount, scopeId, month, minimumUsed, ledgerId] = args
      if (!this.ledger.has(String(ledgerId)))
        return { meta: { changes: 0 } }
      const scope = sql.includes("scope = 'team'") ? 'team' : 'user'
      const balance = this.balances.get(this.balanceKey(scope, scopeId, month))
      if (!balance || balance.used < Number(minimumUsed))
        return { meta: { changes: 0 } }
      balance.used -= Number(amount)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 1 } }
  }

  first<T>(sql: string, args: unknown[]): T | null
  first(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT owner_user_id FROM teams')) {
      const team = this.teams.get(String(args[0]))
      return team ? { owner_user_id: team.ownerUserId } : null
    }

    if (sql.includes('SELECT id, delta, created_at, metadata, idempotency_hash')) {
      const [teamId, reason, idempotencyKey] = args
      for (const entry of this.ledger.values()) {
        if (entry.scopeId === teamId && entry.reason === reason && entry.idempotencyKey === idempotencyKey) {
          return {
            id: entry.id,
            delta: entry.delta,
            created_at: entry.createdAt,
            metadata: entry.metadata,
            idempotency_hash: entry.idempotencyHash,
          }
        }
      }
    }

    return null
  }

  all<T>(sql: string, args: unknown[]): T[]
  all(sql: string, _args: unknown[]): unknown[] {
    if (sql.includes('PRAGMA table_info'))
      return [{ name: 'idempotency_key' }, { name: 'idempotency_hash' }]

    if (sql.includes('FROM team_members')) {
      return [...this.members.values()].map(member => ({
        id: member.teamId,
        name: 'Personal',
        type: 'personal',
        owner_user_id: member.userId,
        role: 'owner',
        joined_at: member.joinedAt,
        created_at: member.joinedAt,
      }))
    }

    return []
  }

  balance(scope: 'team' | 'user', scopeId: string, month: string): Balance | undefined {
    return this.balances.get(this.balanceKey(scope, scopeId, month))
  }

  private balanceKey(scope: unknown, scopeId: unknown, month: unknown) {
    return `${scope}:${scopeId}:${month}`
  }
}

function createEvent(database: ReleaseDatabase): H3EventType {
  const request = new IncomingMessage(new Socket())
  const response = new ServerResponse(request)
  const event = new H3Event(request, response)
  event.context.cloudflare = { env: { DB: database } }
  return event
}

describe('releaseConsumedCredits reservation idempotency', () => {
  beforeEach(() => {
    subscriptionMocks.getUserSubscription.mockReset()
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    teamMocks.getTeamQuota.mockReset()
  })

  it('releases a reservation once from both held balances when retried with its business key', async () => {
    const database = new ReleaseDatabase(13)
    const event = createEvent(database)
    const idempotencyKey = 'asr-release:request-1:0'

    const first = await releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', {
      requestId: 'request-1',
    }, { idempotencyKey })
    const second = await releaseConsumedCredits(event, 'user_1', 7, 'asr-reservation-release', {
      requestId: 'request-1',
    }, { idempotencyKey })

    const month = first.createdAt.slice(0, 7)
    expect(second.ledgerId).toBe(first.ledgerId)
    expect(second.amount).toBe(7)
    expect([...database.ledger.values()]).toHaveLength(1)
    expect(database.balance('team', 'team_user_1', month)?.used).toBe(6)
    expect(database.balance('user', 'user_1', month)?.used).toBe(6)
  })
})
