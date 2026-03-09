import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const oauthAccessMocks = vi.hoisted(() => ({
  requireOauthManager: vi.fn(),
  resolveOauthOwnerScope: vi.fn(),
}))

const oauthClientStoreMocks = vi.hoisted(() => ({
  createOauthClient: vi.fn(),
}))

const readBodyMock = vi.hoisted(() => vi.fn())

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../../utils/oauthAccess', () => oauthAccessMocks)
vi.mock('../../../../utils/oauthClientStore', () => oauthClientStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../clients.post')).default as (event: any) => Promise<any>
})

describe('/api/dashboard/oauth/clients POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    oauthAccessMocks.requireOauthManager.mockResolvedValue({
      userId: 'u_team_admin',
      isNexusAdmin: false,
      isTeamAdmin: true,
      teamId: 'org_1',
    })
    oauthAccessMocks.resolveOauthOwnerScope.mockReturnValue('team')
    readBodyMock.mockResolvedValue({
      scope: 'team',
      name: 'Pilot Integration',
      description: 'oauth for pilot',
      redirectUris: ['http://127.0.0.1:3201/auth/callback'],
    })
    oauthClientStoreMocks.createOauthClient.mockResolvedValue({
      id: 'oauth_client_1',
      clientId: 'nxo_abc',
      clientSecret: 'nxs_secret',
      clientSecretHint: 'nxs_secret...',
      name: 'Pilot Integration',
      description: 'oauth for pilot',
      redirectUris: ['http://127.0.0.1:3201/auth/callback'],
      ownerScope: 'team',
      ownerUserId: 'u_team_admin',
      ownerTeamId: 'org_1',
      createdByRole: 'team_admin',
      status: 'active',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
    })
  })

  it('团队管理员可以申请 team scope oauth client', async () => {
    const result = await handler({})

    expect(oauthAccessMocks.requireOauthManager).toHaveBeenCalledTimes(1)
    expect(oauthAccessMocks.resolveOauthOwnerScope).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'org_1' }),
      { scope: 'team' },
    )
    expect(oauthClientStoreMocks.createOauthClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerScope: 'team',
        ownerUserId: 'u_team_admin',
        ownerTeamId: 'org_1',
        createdByRole: 'team_admin',
        name: 'Pilot Integration',
      }),
    )
    expect(result).toMatchObject({
      application: {
        clientId: 'nxo_abc',
        clientSecret: 'nxs_secret',
      },
    })
  })
})
