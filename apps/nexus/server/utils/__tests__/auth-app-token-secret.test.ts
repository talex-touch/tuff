import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import type { JWT } from 'next-auth/jwt'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueAppSignInToken } from '../appAuthToken'
import { createAppTokenPair, requireAppAuth, requireAppRefreshAuth } from '../auth'

interface SessionGetTokenOptions {
  event: H3Event
  secret: string
  secureCookie: boolean
}
type SessionGetToken = (options: SessionGetTokenOptions) => Promise<JWT | null>

interface TestUser {
  id: string
  status: 'active' | 'disabled'
}

interface TestDevice {
  userId: string
  deviceId: string
  tokenVersion: number
  revokedAt: string | null
}

type TestEvent = H3Event & {
  context: H3Event['context'] & { cloudflare: { env: Record<string, unknown> } }
  node: H3Event['node'] & {
    req: H3Event['node']['req'] & { headers: Record<string, string> }
  }
}

const runtimeConfig = vi.hoisted(() => ({
  appAuthJwtSecret: undefined as string | undefined,
  auth: {
    secret: undefined as string | undefined,
  },
}))
const browserSession = vi.hoisted(() => {
  const state = {
    value: null as JWT | null,
  }
  return {
    state,
    getToken: vi.fn<SessionGetToken>(async () => state.value),
  }
})

const users = vi.hoisted(() => new Map<string, TestUser>())
const devices = vi.hoisted(() => new Map<string, TestDevice>())

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('#auth', () => ({
  getToken: browserSession.getToken,
}))

vi.mock('../authStore', () => ({
  consumeLoginToken: vi.fn(),
  createUser: vi.fn(),
  ensureDeviceForRequest: vi.fn(async () => ({ id: 'device-1' })),
  getDevice: vi.fn(
    async (_event: unknown, userId: string, deviceId: string) => devices.get(`${userId}:${deviceId}`) ?? null,
  ),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(async (_event: unknown, userId: string) => users.get(userId) ?? null),
  readDeviceId: vi.fn(() => 'device-1'),
  readDeviceMetadata: vi.fn(() => ({ deviceName: 'Unit Test CLI', platform: 'test', clientType: 'cli' })),
  upsertDevice: vi.fn(async (_event: unknown, userId: string, deviceId: string) => {
    const device: TestDevice = { userId, deviceId, tokenVersion: 1, revokedAt: null }
    devices.set(`${userId}:${deviceId}`, device)
    return device
  }),
}))

vi.mock('../apiKeyStore', () => ({
  validateApiKey: vi.fn(),
}))

vi.mock('../creditsStore', () => ({
  ensurePersonalTeam: vi.fn(),
}))

function createEvent(env: Record<string, unknown> = {}): TestEvent {
  // Auth helpers only read the explicit Cloudflare env and request headers in this fixture.
  return {
    context: {
      cloudflare: { env },
    },
    node: {
      req: {
        headers: {},
      },
    },
  } as unknown as TestEvent
}

function readJwtPayload(token: string) {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('JWT payload missing')
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
    deviceId?: string
    dv?: number
    gt?: 'short' | 'long'
    kind?: 'access' | 'refresh'
    iat: number
    exp: number
  }
}

function toBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createLegacyAccessToken(accessToken: string, secret: string): string {
  const [header] = accessToken.split('.')
  if (!header) throw new Error('JWT header missing')

  const payload = readJwtPayload(accessToken)
  delete payload.kind
  const signingInput = `${header}.${toBase64Url(payload)}`
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `${signingInput}.${signature}`
}

describe('app auth token secret resolution', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousNitroPreset = process.env.NITRO_PRESET

  beforeEach(() => {
    runtimeConfig.appAuthJwtSecret = undefined
    runtimeConfig.auth.secret = undefined
    browserSession.state.value = null
    users.set('user-1', { id: 'user-1', status: 'active' })
    devices.clear()
    delete process.env.APP_AUTH_JWT_SECRET
    delete process.env.AUTH_SECRET
    delete process.env.NITRO_PRESET
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
    if (previousNitroPreset === undefined) delete process.env.NITRO_PRESET
    else process.env.NITRO_PRESET = previousNitroPreset
  })

  it('uses Cloudflare APP_AUTH_JWT_SECRET consistently for signing and verification', async () => {
    const { createAppToken, requireAppAuth } = await import('../auth')
    const event = createEvent({ APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456' })
    const token = await createAppToken(event, 'user-1', {
      deviceId: 'device-1',
      grantType: 'short',
      ttlSeconds: 60,
    })

    event.node.req.headers.authorization = `Bearer ${token}`
    await expect(requireAppAuth(event)).resolves.toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      authSource: 'app',
    })
  })

  it('fails fast in production when no stable app auth secret exists', async () => {
    process.env.NODE_ENV = 'production'
    const { createAppToken } = await import('../auth')
    await expect(createAppToken(createEvent(), 'user-1')).rejects.toMatchObject({
      statusCode: 500,
      code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
      variableName: 'APP_AUTH_JWT_SECRET',
    })
  })

  it.each(['change-me-auth-secret', 'your_auth_secret', 'replace-with-local-secret', 'tuff-local-app-auth-jwt-secret'])(
    'rejects unsafe app auth credential in production: %s',
    async credential => {
      process.env.NODE_ENV = 'production'
      const { createAppToken } = await import('../auth')
      const event = createEvent({ APP_AUTH_JWT_SECRET: credential })

      await expect(createAppToken(event, 'user-1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'APP_AUTH_JWT_SECRET',
      })
    },
  )

  it('rejects an explicitly unsafe app credential instead of hiding it behind AUTH_SECRET', async () => {
    process.env.NODE_ENV = 'production'
    const { createAppToken } = await import('../auth')
    const event = createEvent({
      APP_AUTH_JWT_SECRET: 'tuff-local-app-auth-jwt-secret',
      AUTH_SECRET: 'strong-session-fallback-secret-123456',
    })

    await expect(createAppToken(event, 'user-1')).rejects.toMatchObject({
      code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
      variableName: 'APP_AUTH_JWT_SECRET',
    })
  })

  it('uses platform AUTH_SECRET only when APP_AUTH_JWT_SECRET is absent', async () => {
    process.env.NODE_ENV = 'production'
    const { createAppToken } = await import('../auth')

    await expect(
      createAppToken(
        createEvent({
          AUTH_SECRET: 'strong-session-fallback-secret-123456',
        }),
        'user-1',
      ),
    ).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
  })

  it('does not replace a missing Cloudflare Secret with build-time runtime config', async () => {
    process.env.NODE_ENV = 'production'
    runtimeConfig.appAuthJwtSecret = 'strong-build-time-app-secret-123456'
    runtimeConfig.auth.secret = 'strong-build-time-auth-secret-123456'
    const { createAppToken } = await import('../auth')

    await expect(createAppToken(createEvent({}), 'user-1')).rejects.toMatchObject({
      code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
      variableName: 'APP_AUTH_JWT_SECRET',
    })
  })

  it.each([
    { grantType: 'short' as const, refreshTtlSeconds: 60 * 60 * 24 * 30 },
    { grantType: 'long' as const, refreshTtlSeconds: 60 * 60 * 24 * 180 },
  ])('issues a 24-hour access token and a $grantType refresh token with its policy TTL', async ({ grantType, refreshTtlSeconds }) => {
    const event = createEvent({ APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456' })

    const pair = await createAppTokenPair(event, 'user-1', {
      deviceId: 'device-1',
      grantType,
    })
    const accessPayload = readJwtPayload(pair.appToken)
    const refreshPayload = readJwtPayload(pair.refreshToken)

    expect(pair.ttlSeconds).toBe(60 * 60 * 24)
    expect(pair.refreshTtlSeconds).toBe(refreshTtlSeconds)
    expect(accessPayload).toMatchObject({
      kind: 'access',
      gt: grantType,
      deviceId: 'device-1',
      dv: 1,
    })
    expect(refreshPayload).toMatchObject({
      kind: 'refresh',
      gt: grantType,
      deviceId: 'device-1',
      dv: 1,
    })
    expect(accessPayload.exp - accessPayload.iat).toBe(60 * 60 * 24)
    expect(refreshPayload.exp - refreshPayload.iat).toBe(refreshTtlSeconds)
  })

  it.each(['short', 'long'] as const)('keeps $grantType access and refresh credentials in separate authorization paths', async (grantType) => {
    const secret = 'cloudflare-app-secret-123456'
    const event = createEvent({ APP_AUTH_JWT_SECRET: secret })
    const pair = await createAppTokenPair(event, 'user-1', {
      deviceId: 'device-1',
      grantType,
    })

    event.node.req.headers.authorization = `Bearer ${pair.appToken}`
    await expect(requireAppAuth(event)).resolves.toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      tokenGrantType: grantType,
    })
    await expect(requireAppRefreshAuth(event)).rejects.toMatchObject({ statusCode: 401 })

    event.node.req.headers.authorization = `Bearer ${pair.refreshToken}`
    await expect(requireAppAuth(event)).rejects.toMatchObject({ statusCode: 401 })
    await expect(requireAppRefreshAuth(event)).resolves.toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      tokenGrantType: grantType,
    })

    event.node.req.headers.authorization = `Bearer ${createLegacyAccessToken(pair.appToken, secret)}`
    await expect(requireAppAuth(event)).resolves.toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      tokenGrantType: grantType,
    })
  })

  it('issues a long-grant credential pair from a browser session and rejects an app token as a sign-in credential', async () => {
    const event = createEvent({
      APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456',
      AUTH_SECRET: 'cloudflare-session-secret-123456',
    })
    browserSession.state.value = { userId: 'user-1', iat: Math.floor(Date.now() / 1000) }
    event.node.req.headers['x-forwarded-proto'] = 'https'

    const issued = await issueAppSignInToken(event)
    const accessPayload = readJwtPayload(issued.appToken)
    const refreshPayload = readJwtPayload(issued.refreshToken)

    expect(issued).toMatchObject({
      grantType: 'long',
      ttlSeconds: 60 * 60 * 24,
      refreshTtlSeconds: 60 * 60 * 24 * 180,
      refreshable: true,
    })
    expect(accessPayload.kind).toBe('access')
    expect(refreshPayload.kind).toBe('refresh')

    browserSession.state.value = null
    const appOnlyPair = await createAppTokenPair(event, 'user-1', {
      deviceId: 'device-1',
      grantType: 'short',
    })
    event.node.req.headers.authorization = `Bearer ${appOnlyPair.appToken}`

    await expect(issueAppSignInToken(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it.each([
    {
      name: 'the device token version changes',
      statusCode: 401,
      invalidate: () => devices.set('user-1:device-1', { userId: 'user-1', deviceId: 'device-1', tokenVersion: 2, revokedAt: null }),
    },
    {
      name: 'the device is revoked',
      statusCode: 401,
      invalidate: () => devices.set('user-1:device-1', { userId: 'user-1', deviceId: 'device-1', tokenVersion: 1, revokedAt: '2026-08-16T00:00:00.000Z' }),
    },
    {
      name: 'the user is no longer active',
      statusCode: 403,
      invalidate: () => users.set('user-1', { id: 'user-1', status: 'disabled' }),
    },
  ])('rejects a refresh credential when $name', async ({ invalidate, statusCode }) => {
    const event = createEvent({ APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456' })
    const pair = await createAppTokenPair(event, 'user-1', {
      deviceId: 'device-1',
      grantType: 'long',
    })
    event.node.req.headers.authorization = `Bearer ${pair.refreshToken}`
    invalidate()

    await expect(requireAppRefreshAuth(event)).rejects.toMatchObject({ statusCode })
  })
})
