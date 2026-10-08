import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../helpers/d1-sqlite'

/** GET /api/dashboard/team against real SQLite: members with profiles, team invites, received invites. */

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as SqliteD1Database | null,
}))

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../server/utils/cloudflare')>()),
  readCloudflareBindings: () => (state.db ? { DB: state.db } : undefined),
}))

let handler: (event: any) => Promise<any>
let authStore: typeof import('../../../server/utils/authStore')

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../../server/api/dashboard/team.get')).default as (event: any) => Promise<any>
  authStore = await import('../../../server/utils/authStore')
})

function event(path = '/api/dashboard/team') {
  return { path, context: {}, node: { req: { url: path, headers: {} } } }
}

function exec(sql: string) {
  state.db!.sqlite.exec(sql)
}

beforeEach(async () => {
  state.db = createSqliteD1()
  // Create every table the handler reads.
  await authStore.getUserById(event() as any, 'warm')
  authMocks.requireAuth.mockReset()
  exec(`
    INSERT INTO auth_users (id, email, name, status, created_at) VALUES
      ('owner', 'owner@x.test', 'Owner', 'active', '2026-01-01T00:00:00.000Z'),
      ('member', 'member@x.test', NULL, 'active', '2026-01-01T00:00:00.000Z'),
      ('solo', 'solo@x.test', 'Solo', 'active', '2026-01-01T00:00:00.000Z');
  `)
})

describe('/api/dashboard/team', () => {
  it("lists an organization's members with their profiles and its invites", async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'owner', authSource: 'session' })
    await handler(event())
    exec(`
      INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES ('org_1', 'Org One', 'organization', 'owner', '2026-01-01T00:00:00.000Z');
      INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES
        ('org_1', 'owner', 'owner', '2026-01-02T00:00:00.000Z'),
        ('org_1', 'member', 'member', '2026-01-03T00:00:00.000Z');
      INSERT INTO activation_logs (id, code_id, user_id, activated_at, plan, expires_at) VALUES ('a1', 'c', 'owner', '2026-01-01T00:00:00.000Z', 'TEAM', '2099-01-01T00:00:00.000Z');
      INSERT INTO team_invites (id, code, organization_id, created_by, email, role, created_at, status) VALUES
        ('inv_1', 'CODE1', 'org_1', 'owner', 'solo@x.test', 'member', '2026-01-04T00:00:00.000Z', 'pending');
    `)

    const result = await handler(event())

    expect(result.team).toMatchObject({ id: 'org_1', type: 'organization', role: 'owner', pendingInvites: 1 })
    expect(result.team.members).toEqual([
      expect.objectContaining({ userId: 'owner', name: 'Owner', email: 'owner@x.test', role: 'owner' }),
      expect.objectContaining({ userId: 'member', name: 'member@x.test', email: 'member@x.test', role: 'member' }),
    ])
    expect(result.team.invites).toEqual([expect.objectContaining({ id: 'inv_1', email: 'solo@x.test' })])
    expect(result.team.receivedInvites).toEqual([])
  })

  it('shows a personal-team user the invites addressed to their email, with the team name', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'owner', authSource: 'session' })
    await handler(event())
    exec(`
      INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES ('org_1', 'Org One', 'organization', 'owner', '2026-01-01T00:00:00.000Z');
      INSERT INTO team_invites (id, code, organization_id, created_by, email, role, created_at, status) VALUES
        ('inv_1', 'CODE1', 'org_1', 'owner', 'solo@x.test', 'member', '2026-01-04T00:00:00.000Z', 'pending'),
        ('inv_2', 'CODE2', 'org_1', 'owner', 'solo@x.test', 'member', '2026-01-05T00:00:00.000Z', 'accepted');
    `)

    authMocks.requireAuth.mockResolvedValue({ userId: 'solo', authSource: 'session' })
    const result = await handler(event())

    expect(result.team).toMatchObject({ id: 'team_solo', type: 'personal' })
    expect(result.team.members).toEqual([expect.objectContaining({ userId: 'solo', name: 'Solo' })])
    expect(result.team.receivedInvites).toEqual([
      expect.objectContaining({ id: 'inv_1', teamId: 'org_1', teamName: 'Org One' }),
    ])
  })

  it('answers the nav with the team kind and role only, without reading members or invites', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'owner', authSource: 'session' })
    await handler(event())
    exec(`
      INSERT INTO teams (id, name, type, owner_user_id, created_at) VALUES ('org_1', 'Org One', 'organization', 'owner', '2026-01-01T00:00:00.000Z');
      INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('org_1', 'owner', 'owner', '2026-01-02T00:00:00.000Z');
      INSERT INTO activation_logs (id, code_id, user_id, activated_at, plan, expires_at) VALUES ('a1', 'c', 'owner', '2026-01-01T00:00:00.000Z', 'TEAM', '2099-01-01T00:00:00.000Z');
      INSERT INTO team_invites (id, code, organization_id, created_by, email, role, created_at, status) VALUES
        ('inv_1', 'CODE1', 'org_1', 'owner', 'solo@x.test', 'member', '2026-01-04T00:00:00.000Z', 'pending');
    `)
    const executed: string[] = []
    const prepare = state.db!.prepare.bind(state.db!)
    state.db!.prepare = ((sql: string) => {
      executed.push(sql)
      return prepare(sql)
    }) as typeof prepare

    const readsMembers = () => executed.some(sql => /FROM\s+team_members\s+tm\s+LEFT\s+JOIN\s+auth_users/i.test(sql))
    const readsInvites = () => executed.some(sql => sql.includes('team_invites'))

    // The full answer does read both, so the checks below can see them.
    await handler(event())
    expect(readsMembers()).toBe(true)
    expect(readsInvites()).toBe(true)
    executed.length = 0

    const result = await handler(event('/api/dashboard/team?view=summary'))

    expect(result).toEqual({ team: { id: 'org_1', name: 'Org One', type: 'organization', role: 'owner' } })
    expect(readsMembers()).toBe(false)
    expect(readsInvites()).toBe(false)
  })
})
