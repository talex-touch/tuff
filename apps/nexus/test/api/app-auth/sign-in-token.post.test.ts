import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  createAppToken: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('../../../server/utils/auth', () => authMocks)

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
})

describe('/api/app-auth/sign-in-token', () => {
  it('issues app token from current app-auth route', async () => {
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user-1',
      deviceId: 'device-1',
      authSource: 'session',
    })
    authMocks.createAppToken.mockResolvedValue('app-token')

    const handler = (await import('../../../server/api/app-auth/sign-in-token.post')).default as (event: any) => Promise<any>
    const result = await handler({ headers: {} })

    expect(result).toEqual({ appToken: 'app-token' })
    // The grant type and TTL are asserted, not just the device: issueAppSignInToken
    // mints a long-term token via LONG_TERM_APP_TOKEN_OPTIONS, and a change to
    // either is a change to how long a desktop token stays valid.
    expect(authMocks.createAppToken).toHaveBeenCalledWith(expect.anything(), 'user-1', {
      deviceId: 'device-1',
      grantType: 'long',
      ttlSeconds: 60 * 60 * 24 * 30,
    })
  })

  it('blocks refreshing short-term app token', async () => {
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user-1',
      deviceId: 'device-1',
      authSource: 'app',
      tokenGrantType: 'short',
    })

    const handler = (await import('../../../server/api/app-auth/sign-in-token.post')).default as (event: any) => Promise<any>

    await expect(handler({ headers: {} })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: expect.stringContaining('Short-term app token'),
    })
    expect(authMocks.createAppToken).not.toHaveBeenCalled()
  })
})
