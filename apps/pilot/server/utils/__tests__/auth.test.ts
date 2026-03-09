import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  readPilotSessionUserId: vi.fn(),
}))

const deviceMocks = vi.hoisted(() => ({
  ensurePilotDeviceId: vi.fn(),
}))

vi.mock('../pilot-session', () => sessionMocks)
vi.mock('../pilot-device', () => deviceMocks)

function createEvent(headers: Record<string, string> = {}): H3Event {
  const normalizedHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value
  }

  return {
    node: {
      req: {
        headers: normalizedHeaders,
      },
    },
    context: {
      runtimeConfig: {
        pilot: {},
      },
    },
  } as unknown as H3Event
}

describe('requirePilotAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMocks.readPilotSessionUserId.mockReturnValue(null)
    deviceMocks.ensurePilotDeviceId.mockReturnValue('device_abc123')
  })

  it('优先使用新 session cookie', async () => {
    sessionMocks.readPilotSessionUserId.mockReturnValue('session_user')
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent({ host: 'pilot.local' }))

    expect(result).toEqual({
      userId: 'session_user',
      source: 'session-cookie',
      isAuthenticated: true,
    })
  })

  it('session 缺失时使用设备访客 ID', async () => {
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent({ host: 'pilot.example.com' }))

    expect(result).toEqual({
      userId: 'pilot_guest_device_abc123',
      source: 'device-cookie',
      isAuthenticated: false,
      deviceId: 'device_abc123',
    })
  })

  it('legacy header/cookie/bearer 输入会回落到设备访客身份', async () => {
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent(
      {
        'host': 'localhost:3200',
        'x-pilot-user-id': 'legacy_header_user',
        'x-user-id': 'legacy_user',
        'cookie': 'pilot_user_id=legacy_cookie_user',
        'authorization': 'Bearer legacy-token-abc',
      },
    ))

    expect(result).toEqual({
      userId: 'pilot_guest_device_abc123',
      source: 'device-cookie',
      isAuthenticated: false,
      deviceId: 'device_abc123',
    })
  })
})
