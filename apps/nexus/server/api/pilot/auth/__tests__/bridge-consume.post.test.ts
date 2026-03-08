import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  pilot: {
    bridgeSecret: 'secret_123',
  },
}))

const authStoreMocks = vi.hoisted(() => ({
  consumePilotBridgeTicket: vi.fn(),
  getUserById: vi.fn(),
}))

const readBodyMock = vi.hoisted(() => vi.fn())

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../../utils/authStore', () => authStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../bridge-consume.post')).default as (event: any) => Promise<any>
})

function createEvent(secret?: string) {
  return {
    node: {
      req: {
        headers: secret ? { 'x-pilot-bridge-secret': secret } : {},
      },
    },
  }
}

describe('/api/pilot/auth/bridge-consume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeConfig.pilot.bridgeSecret = 'secret_123'
    readBodyMock.mockResolvedValue({ ticketId: 'ticket_1' })
    authStoreMocks.consumePilotBridgeTicket.mockResolvedValue({
      ticketId: 'ticket_1',
      userId: 'u1',
      expiresAt: '2026-03-08T00:00:00.000Z',
      consumedAt: '2026-03-08T00:00:10.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
    })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'active' })
  })

  it('校验 secret 并消费票据', async () => {
    const result = await handler(createEvent('secret_123'))

    expect(authStoreMocks.consumePilotBridgeTicket).toHaveBeenCalledWith(expect.anything(), 'ticket_1')
    expect(result).toEqual({
      ticketId: 'ticket_1',
      userId: 'u1',
      expiresAt: '2026-03-08T00:00:00.000Z',
      consumedAt: '2026-03-08T00:00:10.000Z',
    })
  })

  it('未配置 bridge secret 时返回 503', async () => {
    runtimeConfig.pilot.bridgeSecret = ''

    await expect(handler(createEvent('secret_123'))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Pilot bridge is not configured.',
    })
  })

  it('secret 不匹配时拒绝', async () => {
    await expect(handler(createEvent('wrong_secret'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized.',
    })
  })

  it('票据失效时拒绝', async () => {
    authStoreMocks.consumePilotBridgeTicket.mockResolvedValue(null)

    await expect(handler(createEvent('secret_123'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid or expired ticket.',
    })
  })

  it('用户非 active 时拒绝', async () => {
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'disabled' })

    await expect(handler(createEvent('secret_123'))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  })
})
