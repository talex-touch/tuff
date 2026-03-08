import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireSessionAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  createPilotBridgeTicket: vi.fn(),
  getUserById: vi.fn(),
}))

const readBodyMock = vi.hoisted(() => vi.fn())

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/authStore', () => authStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../bridge-ticket.post')).default as (event: any) => Promise<any>
})

describe('/api/pilot/auth/bridge-ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'u1' })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'active' })
    authStoreMocks.createPilotBridgeTicket.mockResolvedValue({
      ticketId: 'ticket_1',
      userId: 'u1',
      expiresAt: '2026-03-08T00:00:00.000Z',
      consumedAt: null,
      createdAt: '2026-03-08T00:00:00.000Z',
    })
    readBodyMock.mockResolvedValue({})
  })

  it('签发默认 TTL 票据', async () => {
    const result = await handler({})

    expect(authStoreMocks.createPilotBridgeTicket).toHaveBeenCalledWith({}, 'u1', 60_000)
    expect(result).toEqual({
      ticketId: 'ticket_1',
      userId: 'u1',
      expiresAt: '2026-03-08T00:00:00.000Z',
    })
  })

  it('支持请求自定义 ttlSeconds 并做边界收敛', async () => {
    readBodyMock.mockResolvedValue({ ttlSeconds: 120 })

    await handler({})

    expect(authStoreMocks.createPilotBridgeTicket).toHaveBeenCalledWith({}, 'u1', 120_000)
  })

  it('非 active 用户拒绝签发', async () => {
    authStoreMocks.getUserById.mockResolvedValue({ id: 'u1', status: 'disabled' })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
    expect(authStoreMocks.createPilotBridgeTicket).not.toHaveBeenCalled()
  })
})
