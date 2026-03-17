import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireSessionAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  createPilotOauthCode: vi.fn(),
}))

const oauthClientStoreMocks = vi.hoisted(() => ({
  getActiveOauthClientByClientId: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  getRequestURL: vi.fn(),
  sendRedirect: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
    getRequestURL: h3Mocks.getRequestURL,
    sendRedirect: h3Mocks.sendRedirect,
  }
})

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/authStore', () => authStoreMocks)
vi.mock('../../../utils/oauthClientStore', () => oauthClientStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../authorize.get')).default as (event: any) => Promise<any>
})

describe('/api/oauth/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({
      response_type: 'code',
      client_id: 'nxo_client_123',
      redirect_uri: 'https://app.example.com/oauth/callback',
      state: 'state_abc',
    })
    h3Mocks.getRequestURL.mockReturnValue(new URL('https://tuff.tagzxia.com/api/oauth/authorize'))
    h3Mocks.sendRedirect.mockImplementation((_event, url, code) => ({ url, code }))
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'u1' })
    authStoreMocks.createPilotOauthCode.mockResolvedValue({
      code: 'oauth_code_1',
      clientId: 'nxo_client_123',
      userId: 'u1',
      redirectUri: 'https://app.example.com/oauth/callback',
      expiresAt: '2026-03-08T00:00:00.000Z',
      consumedAt: null,
      createdAt: '2026-03-08T00:00:00.000Z',
    })
    oauthClientStoreMocks.getActiveOauthClientByClientId.mockResolvedValue({
      clientId: 'nxo_client_123',
      redirectUris: ['https://app.example.com/oauth/callback'],
    })
  })

  it('已登录时签发 code 并回跳 redirect_uri', async () => {
    const result = await handler({ context: {} })

    expect(authStoreMocks.createPilotOauthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientId: 'nxo_client_123',
        userId: 'u1',
        redirectUri: 'https://app.example.com/oauth/callback',
      }),
    )
    expect(result).toEqual({
      url: 'https://app.example.com/oauth/callback?code=oauth_code_1&state=state_abc',
      code: 302,
    })
  })

  it('未登录时跳转 Nexus signin 并带 callbackUrl', async () => {
    authMocks.requireSessionAuth.mockRejectedValue({ statusCode: 401 })

    const result = await handler({ context: {} })

    expect(result).toEqual({
      url: 'https://tuff.tagzxia.com/api/auth/signin?callbackUrl=https%3A%2F%2Ftuff.tagzxia.com%2Fapi%2Foauth%2Fauthorize',
      code: 302,
    })
    expect(authStoreMocks.createPilotOauthCode).not.toHaveBeenCalled()
  })

  it('redirect_uri 未注册时拒绝', async () => {
    h3Mocks.getQuery.mockReturnValue({
      response_type: 'code',
      client_id: 'nxo_client_123',
      redirect_uri: 'https://evil.example.com/callback',
      state: 'state_abc',
    })

    await expect(handler({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'redirect_uri is not allowed.',
    })
  })

  it('client_id 无效时拒绝', async () => {
    h3Mocks.getQuery.mockReturnValue({
      response_type: 'code',
      client_id: 'nxo_missing',
      redirect_uri: 'https://app.example.com/oauth/callback',
      state: 'state_xyz',
    })
    oauthClientStoreMocks.getActiveOauthClientByClientId.mockResolvedValue(null)

    await expect(handler({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'client_id is invalid.',
    })
  })
})
