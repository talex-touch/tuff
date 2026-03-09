import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authStoreMocks = vi.hoisted(() => ({
  consumePilotOauthCode: vi.fn(),
  getUserById: vi.fn(),
}))

const oauthClientStoreMocks = vi.hoisted(() => ({
  verifyOauthClientSecret: vi.fn(),
}))

const readBodyMock = vi.hoisted(() => vi.fn())

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../../utils/authStore', () => authStoreMocks)
vi.mock('../../../../utils/oauthClientStore', () => oauthClientStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../token.post')).default as (event: any) => Promise<any>
})

function createEvent() {
  return {}
}

describe('/api/pilot/oauth/token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readBodyMock.mockResolvedValue({
      grant_type: 'authorization_code',
      code: 'oauth_code_1',
      client_id: 'nxo_client_1',
      client_secret: 'nxs_secret_1',
      redirect_uri: 'https://app.example.com/oauth/callback',
    })
    authStoreMocks.consumePilotOauthCode.mockResolvedValue({
      code: 'oauth_code_1',
      clientId: 'nxo_client_1',
      userId: 'u1',
      redirectUri: 'https://app.example.com/oauth/callback',
      expiresAt: '2026-03-08T00:00:00.000Z',
      consumedAt: '2026-03-08T00:00:10.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
    })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'active' })
    oauthClientStoreMocks.verifyOauthClientSecret.mockResolvedValue({
      clientId: 'nxo_client_1',
      status: 'active',
    })
  })

  it('校验 client_secret 并兑换 oauth code', async () => {
    const result = await handler(createEvent())

    expect(oauthClientStoreMocks.verifyOauthClientSecret).toHaveBeenCalledWith(
      expect.anything(),
      {
        clientId: 'nxo_client_1',
        clientSecret: 'nxs_secret_1',
      },
    )
    expect(authStoreMocks.consumePilotOauthCode).toHaveBeenCalledWith(
      expect.anything(),
      {
        code: 'oauth_code_1',
        clientId: 'nxo_client_1',
        redirectUri: 'https://app.example.com/oauth/callback',
      },
    )
    expect(result).toEqual({
      token_type: 'Bearer',
      expires_in: 60,
      client_id: 'nxo_client_1',
      userId: 'u1',
    })
  })

  it('缺少 client_secret 时返回 400', async () => {
    readBodyMock.mockResolvedValue({
      grant_type: 'authorization_code',
      code: 'oauth_code_1',
      client_id: 'nxo_client_1',
      redirect_uri: 'https://app.example.com/oauth/callback',
    })

    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'client_secret is required.',
    })
  })

  it('client_secret 不匹配时拒绝', async () => {
    oauthClientStoreMocks.verifyOauthClientSecret.mockResolvedValue(null)
    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized.',
    })
  })

  it('code 失效时拒绝', async () => {
    authStoreMocks.consumePilotOauthCode.mockResolvedValue(null)

    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid or expired oauth code.',
    })
  })

  it('用户非 active 时拒绝', async () => {
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'disabled' })

    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  })
})
