import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  appAuthJwtSecret: undefined as string | undefined,
  auth: {
    secret: undefined as string | undefined,
  },
}))
const serverSession = vi.hoisted(() => ({
  value: null as null | { user?: { id?: string, email?: string, name?: string }, issuedAt?: number },
}))

const users = vi.hoisted(() => new Map<string, any>())
const devices = vi.hoisted(() => new Map<string, any>())

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('#auth', () => ({
  getServerSession: vi.fn(async () => serverSession.value),
}))

vi.mock('../authStore', () => ({
  consumeLoginToken: vi.fn(),
  createUser: vi.fn(),
  ensureDeviceForRequest: vi.fn(),
  getDevice: vi.fn(async (_event: any, userId: string, deviceId: string) => devices.get(`${userId}:${deviceId}`) ?? null),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(async (_event: any, userId: string) => users.get(userId) ?? null),
  readDeviceId: vi.fn(() => 'device-1'),
  readDeviceMetadata: vi.fn(() => ({ deviceName: 'Unit Test CLI', platform: 'test', clientType: 'cli' })),
  upsertDevice: vi.fn(async (_event: any, userId: string, deviceId: string) => {
    const device = { userId, deviceId, tokenVersion: 1, revokedAt: null }
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

function createEvent(env: Record<string, unknown> = {}) {
  return {
    context: {
      cloudflare: { env },
    },
    node: {
      req: {
        headers: {},
      },
    },
  } as any
}

function readJwtPayload(token: string) {
  const payload = token.split('.')[1]
  if (!payload)
    throw new Error('JWT payload missing')
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
    gt?: string
    iat: number
    exp: number
  }
}

describe('app auth token secret resolution', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousNitroPreset = process.env.NITRO_PRESET

  beforeEach(() => {
    runtimeConfig.appAuthJwtSecret = undefined
    runtimeConfig.auth.secret = undefined
    serverSession.value = null
    users.set('user-1', { id: 'user-1', status: 'active' })
    devices.clear()
    delete process.env.APP_AUTH_JWT_SECRET
    delete process.env.AUTH_SECRET
    delete process.env.NITRO_PRESET
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
    if (previousNitroPreset === undefined)
      delete process.env.NITRO_PRESET
    else
      process.env.NITRO_PRESET = previousNitroPreset
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
    })
  })

  it('issues long-term tokens for official app sign-in callbacks', async () => {
    const { issueAppSignInToken } = await import('../appAuthToken')
    const event = createEvent({ APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456' })
    serverSession.value = { user: { id: 'user-1' }, issuedAt: Math.floor(Date.now() / 1000) }
    event.node.req.headers['x-device-id'] = 'device-1'

    const { appToken } = await issueAppSignInToken(event)
    const payload = readJwtPayload(appToken)

    expect(payload.gt).toBe('long')
    expect(payload.exp - payload.iat).toBe(60 * 60 * 24 * 30)
  })

  it('refreshes long-term app tokens as long-term tokens', async () => {
    const { createAppToken } = await import('../auth')
    const { issueAppSignInToken } = await import('../appAuthToken')
    const event = createEvent({ APP_AUTH_JWT_SECRET: 'cloudflare-app-secret-123456' })
    const token = await createAppToken(event, 'user-1', {
      deviceId: 'device-1',
      grantType: 'long',
      ttlSeconds: 60,
    })
    event.node.req.headers.authorization = `Bearer ${token}`

    const { appToken } = await issueAppSignInToken(event)
    const payload = readJwtPayload(appToken)

    expect(payload.gt).toBe('long')
    expect(payload.exp - payload.iat).toBe(60 * 60 * 24 * 30)
  })
})
