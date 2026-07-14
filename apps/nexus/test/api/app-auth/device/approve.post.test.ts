import type { DeviceAuthGrantType, DeviceAuthRequest } from '../../../../server/utils/authStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import approveHandler from '../../../../server/api/app-auth/device/approve.post'

vi.hoisted(() => {
  ;(globalThis as typeof globalThis & {
    defineEventHandler: <THandler>(handler: THandler) => THandler
  }).defineEventHandler = handler => handler
})

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(async (event: { body?: unknown }) => event.body),
  createError: vi.fn((error: { statusCode: number, statusMessage: string, data?: unknown }) => Object.assign(new Error(error.statusMessage), error)),
}))

const authMocks = vi.hoisted(() => ({
  requireSessionAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  approveDeviceAuthRequest: vi.fn(),
  evaluateDeviceAuthLongTermPolicy: vi.fn(),
  evaluateDeviceAuthRateLimit: vi.fn(),
  getDeviceAuthByUserCode: vi.fn(),
  getUserById: vi.fn(),
  isDeviceAuthExpired: vi.fn(),
  readRequestIp: vi.fn(),
  recordDeviceAuthAudit: vi.fn(),
  rejectDeviceAuthRequest: vi.fn(),
}))

vi.mock('h3', () => h3Mocks)
vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => authStoreMocks)

function createDeviceAuthRequest(grantType: DeviceAuthGrantType): DeviceAuthRequest {
  return {
    deviceCode: 'device-code-1',
    userCode: 'USER-CODE',
    deviceId: 'official-app-device',
    deviceName: 'Touch Desktop',
    devicePlatform: 'darwin-arm64',
    status: 'pending',
    grantType,
    clientType: 'app',
    requestIp: '203.0.113.10',
    createdAt: '2026-07-07T00:00:00.000Z',
    expiresAt: '2026-07-07T00:05:00.000Z',
  }
}

async function runApproveRoute(payload: { storedGrantType: DeviceAuthGrantType, bodyGrantType?: DeviceAuthGrantType }) {
  const request = createDeviceAuthRequest(payload.storedGrantType)
  authStoreMocks.getDeviceAuthByUserCode.mockResolvedValue(request)
  authStoreMocks.approveDeviceAuthRequest.mockImplementation(async (
    _event: unknown,
    _userCode: string,
    userId: string,
    grantType: DeviceAuthGrantType,
  ) => ({
    ...request,
    status: 'approved',
    userId,
    grantType,
    approvedAt: '2026-07-07T00:01:00.000Z',
  }))

  return approveHandler({
    body: payload.bodyGrantType === undefined
      ? { code: request.userCode }
      : { code: request.userCode, grantType: payload.bodyGrantType },
    context: {},
    node: { req: { headers: {} } },
  })
}

describe('/api/app-auth/device/approve grant type selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'user-1', sessionIssuedAt: 1_788_700_000 })
    authStoreMocks.evaluateDeviceAuthRateLimit.mockResolvedValue({ allowed: true })
    authStoreMocks.evaluateDeviceAuthLongTermPolicy.mockResolvedValue({
      allowLongTerm: true,
      deviceTrusted: true,
      locationTrusted: true,
      sessionFresh: true,
      sessionWindowSeconds: 600,
      reason: null,
    })
    authStoreMocks.getUserById.mockResolvedValue(null)
    authStoreMocks.isDeviceAuthExpired.mockReturnValue(false)
    authStoreMocks.readRequestIp.mockReturnValue('203.0.113.10')
    authStoreMocks.recordDeviceAuthAudit.mockResolvedValue({})
    authStoreMocks.rejectDeviceAuthRequest.mockResolvedValue(null)
  })

  it('uses the stored long-term grant when the request body omits grantType', async () => {
    await expect(runApproveRoute({ storedGrantType: 'long' })).resolves.toEqual({ ok: true })

    expect(authStoreMocks.evaluateDeviceAuthLongTermPolicy).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'official-app-device',
      { sessionIssuedAt: 1_788_700_000 },
    )
    expect(authStoreMocks.approveDeviceAuthRequest).toHaveBeenCalledWith(
      expect.anything(),
      'USER-CODE',
      'user-1',
      'long',
    )
    expect(authStoreMocks.recordDeviceAuthAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'approve',
      reason: 'long',
      metadata: expect.objectContaining({ grantType: 'long' }),
    }))
  })

  it.each([
    {
      name: 'explicit short grant overrides a stored long request',
      storedGrantType: 'long' as const,
      bodyGrantType: 'short' as const,
      expectedPolicyCheck: false,
    },
    {
      name: 'explicit long grant overrides a stored short request',
      storedGrantType: 'short' as const,
      bodyGrantType: 'long' as const,
      expectedPolicyCheck: true,
    },
  ])('$name', async ({ storedGrantType, bodyGrantType, expectedPolicyCheck }) => {
    await expect(runApproveRoute({ storedGrantType, bodyGrantType })).resolves.toEqual({ ok: true })

    if (expectedPolicyCheck)
      expect(authStoreMocks.evaluateDeviceAuthLongTermPolicy).toHaveBeenCalledTimes(1)
    else
      expect(authStoreMocks.evaluateDeviceAuthLongTermPolicy).not.toHaveBeenCalled()
    expect(authStoreMocks.approveDeviceAuthRequest).toHaveBeenCalledWith(
      expect.anything(),
      'USER-CODE',
      'user-1',
      bodyGrantType,
    )
    expect(authStoreMocks.recordDeviceAuthAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'approve',
      reason: bodyGrantType,
      metadata: expect.objectContaining({ grantType: bodyGrantType }),
    }))
  })
})
