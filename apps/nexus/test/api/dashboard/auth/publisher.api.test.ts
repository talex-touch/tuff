import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuthOrApiKey: vi.fn(),
}))

const userMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => userMocks)

let publisherHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  publisherHandler = (await import('../../../../server/api/dashboard/auth/publisher.get')).default as (event: any) => Promise<any>
})

describe('/api/dashboard/auth/publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuthOrApiKey.mockResolvedValue({
      userId: 'publisher-1',
      authType: 'apiKey',
      scopes: ['plugin:read', 'plugin:publish'],
    })
    userMocks.getUserById.mockResolvedValue({
      id: 'publisher-1',
      role: 'admin',
    })
  })

  it('returns auth type, role, and api key scopes for publish preflight', async () => {
    const event = { path: '/api/dashboard/auth/publisher' }

    const result = await publisherHandler(event)

    expect(authMocks.requireAuthOrApiKey).toHaveBeenCalledWith(event, ['plugin:publish'])
    expect(userMocks.getUserById).toHaveBeenCalledWith(event, 'publisher-1')
    expect(result).toEqual({
      ok: true,
      userId: 'publisher-1',
      authType: 'apiKey',
      role: 'admin',
      scopes: ['plugin:read', 'plugin:publish'],
    })
  })
})
