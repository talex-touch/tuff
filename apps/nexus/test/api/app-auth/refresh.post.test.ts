import type { H3Event } from 'h3'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import refreshHandler from '../../../server/api/app-auth/refresh.post'

interface RefreshTokenOptions {
  deviceId?: string | null
  grantType?: 'short' | 'long'
  tokenKind?: 'access' | 'refresh'
  ttlSeconds?: number
}

const authMocks = vi.hoisted(() => ({
  createAppToken: vi.fn(),
  requireAppRefreshAuth: vi.fn(),
  APP_ACCESS_TOKEN_TTL_SECONDS: 60 * 60 * 24,
}))

vi.mock('../../../server/utils/auth', () => authMocks)

const routeGlobals = vi.hoisted(() => {
  const globals = globalThis as typeof globalThis & {
    defineEventHandler?: <THandler>(handler: THandler) => THandler
  }
  const originalDefineEventHandler = globals.defineEventHandler
  globals.defineEventHandler = handler => handler
  return { globals, originalDefineEventHandler }
})

function createRouteEvent(): H3Event {
  // The route delegates all request parsing to the refresh-token guard.
  return { headers: {} } as unknown as H3Event
}

describe('/api/app-auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined) {
      delete routeGlobals.globals.defineEventHandler
    } else {
      routeGlobals.globals.defineEventHandler = routeGlobals.originalDefineEventHandler
    }
  })

  it('exchanges a validated refresh credential for one new 24-hour access token without replacing the refresh credential', async () => {
    authMocks.requireAppRefreshAuth.mockResolvedValue({
      userId: 'user-1',
      deviceId: 'desktop-device-1',
      tokenGrantType: 'long',
    })
    authMocks.createAppToken.mockImplementation(async (
      _event: unknown,
      userId: string,
      options: RefreshTokenOptions,
    ) => {
      if (
        userId !== 'user-1'
        || options.deviceId !== 'desktop-device-1'
        || options.grantType !== 'long'
        || options.tokenKind !== 'access'
        || options.ttlSeconds !== 60 * 60 * 24
      ) {
        throw new Error('Refresh route attempted to issue the wrong credential')
      }
      return 'renewed-access-token'
    })

    const result = await refreshHandler(createRouteEvent())

    expect(result).toEqual({
      appToken: 'renewed-access-token',
      grantType: 'long',
      ttlSeconds: 60 * 60 * 24,
      refreshable: true,
    })
    expect(result).not.toHaveProperty('refreshToken')
  })

  it('propagates refresh-guard rejection without minting an access token', async () => {
    authMocks.requireAppRefreshAuth.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    )

    await expect(refreshHandler(createRouteEvent())).rejects.toMatchObject({ statusCode: 401 })
    expect(authMocks.createAppToken).not.toHaveBeenCalled()
  })
})
