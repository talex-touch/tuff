import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  adminBootstrap: {
    secret: 'top-secret',
  },
}))

const authMocks = vi.hoisted(() => ({
  requireSessionAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getAdminBootstrapState: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/authStore', () => authStoreMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../status.get')).default as (event: any) => Promise<any>
})

describe('/api/auth/admin-bootstrap/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeConfig.adminBootstrap.secret = 'top-secret'
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'u1' })
    authStoreMocks.getAdminBootstrapState.mockResolvedValue({
      adminCount: 0,
      adminExists: false,
      firstUserId: 'u1',
      isFirstUser: true,
      requiresBootstrap: true,
    })
  })

  it('在无管理员时返回 required/canPromote', async () => {
    const result = await handler({})

    expect(result).toEqual({
      enabled: true,
      required: true,
      adminExists: false,
      isFirstUser: true,
      canPromote: true,
    })
  })

  it('未配置 secret 时 canPromote 应为 false', async () => {
    runtimeConfig.adminBootstrap.secret = ''
    const result = await handler({})

    expect(result).toEqual({
      enabled: false,
      required: true,
      adminExists: false,
      isFirstUser: true,
      canPromote: false,
    })
  })
})
