import type { H3Event } from 'h3'
import type { DeviceAuthGrantType, DeviceAuthRequest } from '../../../../server/utils/authStore'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pollHandler from '../../../../server/api/app-auth/device/poll.get'

interface TokenPairOptions {
  deviceId?: string | null
  grantType: DeviceAuthGrantType
  deviceMeta?: unknown
}

const h3Mocks = vi.hoisted(() => ({
  createError: vi.fn((error: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(error.statusMessage), error),
  ),
  getQuery: vi.fn(),
}))
const authMocks = vi.hoisted(() => ({
  createAppTokenPair: vi.fn(),
}))
const authStoreMocks = vi.hoisted(() => ({
  deleteDeviceAuthRequest: vi.fn(),
  getDeviceAuthByDeviceCode: vi.fn(),
  isDeviceAuthExpired: vi.fn(),
  logLoginAttempt: vi.fn(),
}))

vi.mock('h3', () => h3Mocks)
vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => authStoreMocks)

const routeGlobals = vi.hoisted(() => {
  const globals = globalThis as typeof globalThis & {
    defineEventHandler?: <THandler>(handler: THandler) => THandler
  }
  const originalDefineEventHandler = globals.defineEventHandler
  globals.defineEventHandler = handler => handler
  return { globals, originalDefineEventHandler }
})

function createApprovedRequest(grantType: DeviceAuthGrantType): DeviceAuthRequest {
  return {
    deviceCode: 'device-code-1',
    userCode: 'USER-CODE',
    deviceId: 'desktop-device-1',
    deviceName: 'Touch Desktop',
    devicePlatform: 'darwin-arm64',
    status: 'approved',
    userId: 'user-1',
    grantType,
    clientType: 'app',
    requestIp: '203.0.113.10',
    createdAt: '2026-08-16T00:00:00.000Z',
    expiresAt: '2026-08-16T00:05:00.000Z',
    approvedAt: '2026-08-16T00:01:00.000Z',
  }
}

function createRouteEvent(): H3Event {
  // Poll gets its only input through the mocked getQuery boundary.
  return {} as unknown as H3Event
}

describe('/api/app-auth/device/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({ device_code: 'device-code-1' })
    authStoreMocks.isDeviceAuthExpired.mockReturnValue(false)
    authStoreMocks.deleteDeviceAuthRequest.mockResolvedValue(undefined)
    authStoreMocks.logLoginAttempt.mockResolvedValue(undefined)
    authMocks.createAppTokenPair.mockImplementation(async (
      _event: unknown,
      userId: string,
      options: TokenPairOptions,
    ) => {
      if (userId !== 'user-1' || options.deviceId !== 'desktop-device-1') {
        throw new Error('Device poll minted credentials for the wrong device')
      }
      const refreshTtlSeconds = options.grantType === 'long'
        ? 60 * 60 * 24 * 180
        : 60 * 60 * 24 * 30
      return {
        appToken: `access-token-${options.grantType}`,
        refreshToken: `refresh-token-${options.grantType}`,
        ttlSeconds: 60 * 60 * 24,
        refreshTtlSeconds,
      }
    })
  })

  afterAll(() => {
    if (routeGlobals.originalDefineEventHandler === undefined) {
      delete routeGlobals.globals.defineEventHandler
    } else {
      routeGlobals.globals.defineEventHandler = routeGlobals.originalDefineEventHandler
    }
  })

  it.each([
    { grantType: 'short' as const, refreshTtlSeconds: 60 * 60 * 24 * 30 },
    { grantType: 'long' as const, refreshTtlSeconds: 60 * 60 * 24 * 180 },
  ])('returns the $grantType access/refresh pair as a refreshable device grant', async ({ grantType, refreshTtlSeconds }) => {
    authStoreMocks.getDeviceAuthByDeviceCode.mockResolvedValue(createApprovedRequest(grantType))

    await expect(pollHandler(createRouteEvent())).resolves.toEqual({
      status: 'approved',
      appToken: `access-token-${grantType}`,
      refreshToken: `refresh-token-${grantType}`,
      ttlSeconds: 60 * 60 * 24,
      refreshTtlSeconds,
      grantType,
      refreshable: true,
    })
  })
})
