import type { D1Database } from '@cloudflare/workers-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../../test/helpers/d1-sqlite'

/**
 * The active team context against real SQLite: permissions and upgrade hints from the owner's plan,
 * the seat count kept in sync, and the round trips a steady-state call costs.
 */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let resolveActiveTeamContext: typeof import('../teamContext').resolveActiveTeamContext

function eventFor(db: unknown = sqlite) {
  return { context: { cloudflare: { env: { DB: db } } }, node: { req: { headers: {} } } } as any
}

function exec(sql: string, ...values: Array<string | number>) {
  sqlite.sqlite.prepare(sql).run(...values)
}

function seedTeam(id: string, type: 'personal' | 'organization', ownerUserId: string) {
  exec(`INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES (?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`, id, type === 'personal' ? 'Personal' : 'Org Team', type, ownerUserId)
}

function seedMember(teamId: string, userId: string, role: string, joinedAt = '2026-01-02T00:00:00.000Z') {
  exec(`INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`, teamId, userId, role, joinedAt)
}

function seedPlan(userId: string, plan: string) {
  exec(`INSERT INTO activation_logs (id, code_id, user_id, activated_at, plan, expires_at) VALUES (?, 'code', ?, '2026-01-01T00:00:00.000Z', ?, '2099-01-01T00:00:00.000Z')`, `act-${userId}`, userId, plan)
}

/** Counts round trips (a batch is one) and the statements that write. */
function countingD1(inner: SqliteD1Database) {
  const stats = { roundTrips: 0, writes: 0 }
  const isWrite = (sql: string) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          stats.roundTrips += 1
          if (isWrite(target.sql))
            stats.writes += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      stats.roundTrips += 1
      stats.writes += statements.filter(statement => isWrite(statement.sql) && !statement.sql.includes('nexus_schema_state')).length
      return inner.batch(statements)
    },
  }
  return { db: db as unknown as D1Database, stats }
}

beforeEach(async () => {
  vi.resetModules()
  ;({ resolveActiveTeamContext } = await import('../teamContext'))
  sqlite = createSqliteD1()
  // The first call creates every table it reads through the schema gate.
  await resolveActiveTeamContext(eventFor(), 'bootstrap-user')
})

describe('resolveActiveTeamContext', () => {
  it('FREE 个人团队返回升级提示，且不可创建组织团队', async () => {
    const context = await resolveActiveTeamContext(eventFor(), 'u1')

    expect(context.team).toMatchObject({ id: 'team_u1', type: 'personal', ownerUserId: 'u1' })
    expect(context.role).toBe('owner')
    expect(context.collaborationEnabled).toBe(false)
    expect(context.permissions.canCreateTeam).toBe(false)
    expect(context.permissions.canInvite).toBe(false)
    expect(context.upgrade).toEqual({ required: true, targetPlan: 'TEAM' })
  })

  it('TEAM 个人团队允许创建组织团队', async () => {
    seedPlan('u2', 'TEAM')

    const context = await resolveActiveTeamContext(eventFor(), 'u2')

    expect(context.collaborationEnabled).toBe(true)
    expect(context.permissions.canCreateTeam).toBe(true)
    expect(context.permissions.canInvite).toBe(false)
    expect(context.seatsLimit).toBe(5)
  })

  it('组织团队 admin 可邀请，不可解散', async () => {
    seedTeam('org_123', 'organization', 'owner-1')
    seedMember('org_123', 'owner-1', 'owner')
    seedMember('org_123', 'admin-1', 'admin')
    seedPlan('owner-1', 'TEAM')

    const context = await resolveActiveTeamContext(eventFor(), 'admin-1')

    expect(context.team.id).toBe('org_123')
    expect(context.role).toBe('admin')
    expect(context.ownerPlan).toBe('TEAM')
    expect(context.permissions.canInvite).toBe(true)
    expect(context.permissions.canManageMembers).toBe(true)
    expect(context.permissions.canDisband).toBe(false)
  })

  it('组织团队 owner 即使非协作套餐也可解散团队', async () => {
    seedTeam('org_789', 'organization', 'owner-3')
    seedMember('org_789', 'owner-3', 'owner')

    const context = await resolveActiveTeamContext(eventFor(), 'owner-3')

    expect(context.permissions.canInvite).toBe(false)
    expect(context.permissions.canDisband).toBe(true)
  })

  it('座位数不一致时会同步 seats_used', async () => {
    seedTeam('org_456', 'organization', 'owner-2')
    for (const [userId, role] of [['owner-2', 'owner'], ['m1', 'member'], ['m2', 'member'], ['m3', 'member']] as const)
      seedMember('org_456', userId, role)
    seedPlan('owner-2', 'TEAM')

    const context = await resolveActiveTeamContext(eventFor(), 'owner-2')

    expect(context.seatsUsed).toBe(4)
    expect(sqlite.sqlite.prepare(`SELECT seats_used FROM team_quotas WHERE organization_id = 'org_456'`).get()).toEqual({ seats_used: 4 })
  })

  it('creates the personal team once, then answers in two round trips with no writes', async () => {
    const { db, stats } = countingD1(sqlite)
    await resolveActiveTeamContext(eventFor(db), 'u9')
    expect(sqlite.sqlite.prepare(`SELECT COUNT(*) AS n FROM team_members WHERE user_id = 'u9'`).get()).toEqual({ n: 1 })

    const before = { ...stats }
    const context = await resolveActiveTeamContext(eventFor(db), 'u9')
    expect(context.team.id).toBe('team_u9')
    expect(stats.roundTrips - before.roundTrips).toBe(2)
    expect(stats.writes - before.writes).toBe(0)
  })
})
