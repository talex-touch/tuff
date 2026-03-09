import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const oauthAccessMocks = vi.hoisted(() => ({
  requireOauthManager: vi.fn(),
  resolveOauthOwnerScope: vi.fn(),
}))

const oauthClientStoreMocks = vi.hoisted(() => ({
  rotateOauthClientSecret: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getRouterParam: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
    getRouterParam: h3Mocks.getRouterParam,
  }
})

vi.mock('../../../../utils/oauthAccess', () => oauthAccessMocks)
vi.mock('../../../../utils/oauthClientStore', () => oauthClientStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../clients/[id]/rotate-secret.post')).default as (event: any) => Promise<any>
})

describe('/api/dashboard/oauth/clients/:id/rotate-secret POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    oauthAccessMocks.requireOauthManager.mockResolvedValue({
      userId: 'u_team_admin',
      isNexusAdmin: false,
      isTeamAdmin: true,
      teamId: 'org_1',
    })
    oauthAccessMocks.resolveOauthOwnerScope.mockReturnValue('team')
    h3Mocks.getRouterParam.mockReturnValue('oauth_client_1')
    h3Mocks.readBody.mockResolvedValue({
      scope: 'team',
    })
    oauthClientStoreMocks.rotateOauthClientSecret.mockResolvedValue({
      id: 'oauth_client_1',
      clientId: 'nxo_abc',
      clientSecretHint: 'nxs_new...',
      clientSecret: 'nxs_new_secret',
      name: 'Pilot Integration',
      description: null,
      redirectUris: ['http://127.0.0.1:3201/auth/callback'],
      ownerScope: 'team',
      ownerUserId: 'u_team_admin',
      ownerTeamId: 'org_1',
      createdByRole: 'team_admin',
      status: 'active',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:01:00.000Z',
    })
  })

  it('团队管理员可以轮换密钥', async () => {
    const result = await handler({})

    expect(oauthClientStoreMocks.rotateOauthClientSecret).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'oauth_client_1',
        ownerScope: 'team',
      }),
    )
    expect(result).toMatchObject({
      application: {
        clientId: 'nxo_abc',
        clientSecret: 'nxs_new_secret',
      },
    })
  })

  it('找不到应用时返回 404', async () => {
    oauthClientStoreMocks.rotateOauthClientSecret.mockResolvedValue(null)
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Oauth client not found.',
    })
  })
})
