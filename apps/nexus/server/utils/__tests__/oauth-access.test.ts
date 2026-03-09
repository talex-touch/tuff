import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

const teamContextMocks = vi.hoisted(() => ({
  resolveActiveTeamContext: vi.fn(),
  isTeamRoleAdminLike: vi.fn(),
}))

vi.mock('../auth', () => authMocks)
vi.mock('../authStore', () => authStoreMocks)
vi.mock('../teamContext', () => teamContextMocks)

let requireOauthManager: (event: any) => Promise<any>
let resolveOauthOwnerScope: (ctx: any, options?: any) => 'team' | 'nexus'

beforeAll(async () => {
  const module = await import('../oauthAccess')
  requireOauthManager = module.requireOauthManager
  resolveOauthOwnerScope = module.resolveOauthOwnerScope
})

describe('oauthAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'active', role: 'user' })
    teamContextMocks.resolveActiveTeamContext.mockResolvedValue({
      team: { id: 'org_1', type: 'organization' },
      role: 'admin',
    })
    teamContextMocks.isTeamRoleAdminLike.mockReturnValue(true)
  })

  it('team admin 可通过权限校验', async () => {
    const context = await requireOauthManager({})
    expect(context).toEqual({
      userId: 'u1',
      isNexusAdmin: false,
      isTeamAdmin: true,
      teamId: 'org_1',
    })
    expect(resolveOauthOwnerScope(context)).toBe('team')
  })

  it('nexus admin 默认走 nexus scope', async () => {
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'active', role: 'admin' })
    teamContextMocks.resolveActiveTeamContext.mockRejectedValue(new Error('no team'))

    const context = await requireOauthManager({})
    expect(context.isNexusAdmin).toBe(true)
    expect(context.isTeamAdmin).toBe(false)
    expect(resolveOauthOwnerScope(context)).toBe('nexus')
  })

  it('普通用户拒绝访问', async () => {
    teamContextMocks.resolveActiveTeamContext.mockResolvedValue({
      team: { id: 'team_u1', type: 'personal' },
      role: 'owner',
    })

    await expect(requireOauthManager({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Only team admin or nexus admin can manage oauth applications.',
    })
  })
})
