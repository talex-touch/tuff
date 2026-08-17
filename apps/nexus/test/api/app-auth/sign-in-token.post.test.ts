import type { H3Event } from 'h3'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import signInTokenHandler from '../../../server/api/app-auth/sign-in-token.post'

const authMocks = vi.hoisted(() => ({
  createAppTokenPair: vi.fn(),
  requireSessionAuth: vi.fn(),
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
  // This thin route delegates all H3 reads to its session/token helpers.
  return { headers: {} } as unknown as H3Event
}

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

describe('/api/app-auth/sign-in-token', () => {
  it('returns the long-grant access and refresh credential pair issued for the browser session', async () => {
    authMocks.requireSessionAuth.mockResolvedValue({
      userId: 'user-1',
      deviceId: 'device-1',
      authSource: 'session',
    })
    authMocks.createAppTokenPair.mockResolvedValue({
      appToken: 'access-token-long',
      refreshToken: 'refresh-token-long',
      ttlSeconds: 60 * 60 * 24,
      refreshTtlSeconds: 60 * 60 * 24 * 180,
    })

    const result = await signInTokenHandler(createRouteEvent())

    expect(result).toEqual({
      appToken: 'access-token-long',
      refreshToken: 'refresh-token-long',
      ttlSeconds: 60 * 60 * 24,
      refreshTtlSeconds: 60 * 60 * 24 * 180,
      grantType: 'long',
      refreshable: true,
    })
  })

  it('rejects an app-auth credential before issuing a desktop sign-in pair', async () => {
    authMocks.requireSessionAuth.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    )

    await expect(signInTokenHandler(createRouteEvent())).rejects.toMatchObject({ statusCode: 401 })

    expect(authMocks.createAppTokenPair).not.toHaveBeenCalled()
  })
})
