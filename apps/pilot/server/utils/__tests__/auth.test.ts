import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  readPilotSessionUserId: vi.fn(),
}))

vi.mock('../pilot-session', () => sessionMocks)

function createEvent(headers: Record<string, string> = {}, pilotConfig: Record<string, unknown> = {}): H3Event {
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
        pilot: pilotConfig,
      },
    },
  } as unknown as H3Event
}

describe('requirePilotAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMocks.readPilotSessionUserId.mockReturnValue(null)
  })

  it('优先使用新 session cookie', async () => {
    sessionMocks.readPilotSessionUserId.mockReturnValue('session_user')
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent({ host: 'pilot.local' }))

    expect(result).toEqual({
      userId: 'session_user',
      source: 'session-cookie',
    })
  })

  it('legacy header 在开关开启时生效', async () => {
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent(
      {
        'host': 'pilot.local',
        'x-pilot-user-id': 'legacy_header_user',
      },
      {
        allowLegacyHeaderAuth: true,
        allowAnonymousDevAuth: false,
      },
    ))

    expect(result).toEqual({
      userId: 'legacy_header_user',
      source: 'header',
    })
  })

  it('legacy bearer 关闭时即使带 token 也不会放行', async () => {
    const { requirePilotAuth } = await import('../auth')

    expect(() => requirePilotAuth(createEvent(
      {
        host: 'pilot.example.com',
        authorization: 'Bearer abcdefghijklmnop',
      },
      {
        allowLegacyBearerAuth: false,
        allowAnonymousDevAuth: false,
      },
    ))).toThrowError(/Unauthorized/i)
  })

  it('legacy cookie 仍可兼容读取', async () => {
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent(
      {
        host: 'pilot.example.com',
        cookie: 'pilot_user_id=legacy_cookie_user',
      },
      {
        allowLegacyCookieAuth: true,
        allowAnonymousDevAuth: false,
      },
    ))

    expect(result).toEqual({
      userId: 'legacy_cookie_user',
      source: 'legacy-cookie',
    })
  })

  it('localhost 默认允许 dev bypass', async () => {
    const { requirePilotAuth } = await import('../auth')

    const result = requirePilotAuth(createEvent({ host: 'localhost:3300' }))

    expect(result).toEqual({
      userId: 'pilot_dev_user',
      source: 'dev-bypass',
    })
  })
})
