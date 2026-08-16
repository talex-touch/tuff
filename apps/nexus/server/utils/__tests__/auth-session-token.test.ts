import type { H3Event } from 'h3'
import type { JWT } from 'next-auth/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface SessionGetTokenOptions {
  event: H3Event
  secret: string
  secureCookie: boolean
}
type SessionGetToken = (options: SessionGetTokenOptions) => Promise<JWT | null>
interface TestUser {
  id: string
  email: string
  name: string | null
  status: 'active' | 'disabled'
}
interface CreateUserInput {
  email: string
  name: string | null
  emailVerified: string
  emailState: string
}

const runtimeConfig = vi.hoisted(() => ({
  auth: {
    secret: 'runtime-session-secret-987654321',
  },
}))
const auth = vi.hoisted(() => ({
  getToken: vi.fn<SessionGetToken>(),
}))
const users = vi.hoisted(() => new Map<string, TestUser>())
const usersByEmail = vi.hoisted(() => new Map<string, TestUser>())
const deviceRegistrations = vi.hoisted(() => [] as Array<{ userId: string; deviceId: string }>)
const createdUsers = vi.hoisted(() => [] as CreateUserInput[])
const personalTeams = vi.hoisted(() => [] as string[])

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('#auth', () => ({
  getToken: auth.getToken,
}))

vi.mock('../authStore', () => ({
  consumeLoginToken: vi.fn(),
  createUser: vi.fn(async (_event: unknown, input: CreateUserInput) => {
    const user: TestUser = {
      id: `auto-user-${createdUsers.length + 1}`,
      email: input.email,
      name: input.name,
      status: 'active',
    }
    createdUsers.push(input)
    users.set(user.id, user)
    usersByEmail.set(user.email, user)
    return user
  }),
  ensureDeviceForRequest: vi.fn(async (_event: unknown, userId: string) => {
    deviceRegistrations.push({ userId, deviceId: 'device-1' })
    return null
  }),
  getDevice: vi.fn(async () => null),
  getUserByEmail: vi.fn(async (_event: unknown, email: string) => usersByEmail.get(email) ?? null),
  getUserById: vi.fn(async (_event: unknown, userId: string) => users.get(userId) ?? null),
  readDeviceId: vi.fn(() => 'device-1'),
  readDeviceMetadata: vi.fn(() => ({ deviceName: 'Unit Test Browser', platform: 'test', clientType: 'web' })),
  upsertDevice: vi.fn(),
}))

vi.mock('../apiKeyStore', () => ({
  validateApiKey: vi.fn(),
}))

vi.mock('../creditsStore', () => ({
  ensurePersonalTeam: vi.fn(async (_event: unknown, userId: string) => {
    personalTeams.push(userId)
  }),
}))

function createEvent(
  env: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return {
    context: {
      cloudflare: {
        env: {
          AUTH_SECRET: 'binding-session-secret-123456789',
          ...env,
        },
      },
    },
    node: {
      req: {
        url: '/api/dashboard',
        headers: {
          host: 'nexus.example.test',
          ...headers,
        },
      },
    },
  } as unknown as H3Event
}

function activeUser(id: string, email = `${id}@example.test`): TestUser {
  return {
    id,
    email,
    name: null,
    status: 'active',
  }
}

function setToken(token: JWT | null) {
  auth.getToken.mockResolvedValue(token)
}

describe('browser session token authentication', () => {
  beforeEach(() => {
    auth.getToken.mockReset()
    users.clear()
    usersByEmail.clear()
    deviceRegistrations.length = 0
    createdUsers.length = 0
    personalTeams.length = 0
  })

  it.each([
    { name: 'forwarded HTTPS', forwardedProto: 'https, http', secureCookie: true },
    { name: 'forwarded HTTP', forwardedProto: 'http', secureCookie: false },
  ])('passes binding-first secret and $name cookie mode to getToken', async ({ forwardedProto, secureCookie }) => {
    users.set('direct-user', activeUser('direct-user'))
    users.set('subject-user', activeUser('subject-user'))
    usersByEmail.set('email-user@example.test', activeUser('email-user', 'email-user@example.test'))
    setToken({
      userId: '  direct-user  ',
      sub: 'subject-user',
      email: 'email-user@example.test',
      iat: 1700000123,
    })
    const event = createEvent(
      { AUTH_SECRET: 'binding-session-secret-123456789' },
      { 'x-forwarded-proto': forwardedProto },
    )

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(event)).resolves.toEqual({
      userId: 'direct-user',
      authSource: 'session',
      tokenGrantType: null,
      sessionIssuedAt: 1700000123,
    })

    expect(auth.getToken.mock.calls).toEqual([[
      {
        event,
        secret: 'binding-session-secret-123456789',
        secureCookie,
      },
    ]])
    expect(deviceRegistrations).toEqual([{ userId: 'direct-user', deviceId: 'device-1' }])
  })

  it('uses a trimmed sub claim when userId is absent or blank', async () => {
    users.set('subject-user', activeUser('subject-user'))
    usersByEmail.set('email-user@example.test', activeUser('email-user', 'email-user@example.test'))
    setToken({
      userId: '   ',
      sub: '  subject-user  ',
      email: 'email-user@example.test',
    })

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(createEvent({}, { 'x-forwarded-proto': 'https' }))).resolves.toMatchObject({
      userId: 'subject-user',
      authSource: 'session',
      sessionIssuedAt: null,
    })
    expect(deviceRegistrations).toEqual([{ userId: 'subject-user', deviceId: 'device-1' }])
  })

  it('falls back to normalized email and auto-provisions an active user', async () => {
    setToken({
      email: '  New.User@Example.TEST  ',
      name: '  Ada Lovelace  ',
    })

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(createEvent({}, { 'x-forwarded-proto': 'https' }))).resolves.toMatchObject({
      userId: 'auto-user-1',
      authSource: 'session',
    })
    expect(createdUsers).toEqual([{
      email: 'new.user@example.test',
      name: 'Ada Lovelace',
      emailVerified: expect.any(String),
      emailState: 'verified',
    }])
    expect(personalTeams).toEqual(['auto-user-1'])
    expect(deviceRegistrations).toEqual([{ userId: 'auto-user-1', deviceId: 'device-1' }])
  })

  it.each([
    { name: 'missing token', token: null, error: null },
    { name: 'invalid token', token: null, error: new Error('invalid browser JWT') },
  ])('maps a $name to 401 without registering a device', async ({ token, error }) => {
    if (error)
      auth.getToken.mockRejectedValue(error)
    else
      setToken(token)

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(createEvent({}, { 'x-forwarded-proto': 'https' }))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
    expect(deviceRegistrations).toEqual([])
  })

  it('maps an inactive resolved user to 403 without registering a device', async () => {
    users.set('disabled-user', {
      ...activeUser('disabled-user'),
      status: 'disabled',
    })
    setToken({ userId: 'disabled-user' })

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(createEvent({}, { 'x-forwarded-proto': 'https' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
    expect(deviceRegistrations).toEqual([])
  })

  it.each([
    {
      name: "typ 'app'",
      token: { sub: 'app-user', typ: 'app' } as JWT,
    },
    {
      name: 'app issuer and audience',
      token: { sub: 'app-user', iss: 'tuff-nexus', aud: 'tuff-app' } as JWT,
    },
  ])('rejects an $name JWT from the browser session path when AUTH_SECRET is the fallback', async ({ token }) => {
    users.set('app-user', activeUser('app-user'))
    setToken(token)
    const event = createEvent(
      { AUTH_SECRET: 'fallback-session-secret-123456789' },
      {
        authorization: 'Bearer app-token',
        'x-forwarded-proto': 'https',
      },
    )

    const { requireSessionAuth } = await import('../auth')
    await expect(requireSessionAuth(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
    expect(auth.getToken.mock.calls[0]?.[0]).toMatchObject({
      event,
      secret: 'fallback-session-secret-123456789',
      secureCookie: true,
    })
    expect(deviceRegistrations).toEqual([])
  })
})
