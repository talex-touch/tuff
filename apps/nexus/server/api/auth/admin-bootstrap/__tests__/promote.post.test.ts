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
  promoteFirstUserToAdmin: vi.fn(),
  getUserById: vi.fn(),
}))

const adminAuditMocks = vi.hoisted(() => ({
  logAdminAudit: vi.fn(),
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

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/authStore', () => authStoreMocks)
vi.mock('../../../../utils/adminAuditStore', () => adminAuditMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../promote.post')).default as (event: any) => Promise<any>
})

describe('/api/auth/admin-bootstrap/promote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeConfig.adminBootstrap.secret = 'top-secret'
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'u1' })
    readBodyMock.mockResolvedValue({ secret: 'top-secret' })
    authStoreMocks.getAdminBootstrapState.mockResolvedValue({
      adminCount: 0,
      adminExists: false,
      firstUserId: 'u1',
      isFirstUser: true,
      requiresBootstrap: true,
    })
    authStoreMocks.promoteFirstUserToAdmin.mockResolvedValue(true)
    authStoreMocks.getUserById.mockResolvedValue({
      id: 'u1',
      email: 'first@example.com',
      role: 'admin',
    })
    adminAuditMocks.logAdminAudit.mockResolvedValue(undefined)
  })

  it('首用户 secret 校验通过后提权成功', async () => {
    const result = await handler({})

    expect(result).toMatchObject({
      success: true,
      user: {
        id: 'u1',
        email: 'first@example.com',
        role: 'admin',
      },
    })
    expect(authStoreMocks.promoteFirstUserToAdmin).toHaveBeenCalledWith({}, 'u1')
    expect(adminAuditMocks.logAdminAudit).toHaveBeenCalledTimes(1)
  })

  it('secret 错误时拒绝', async () => {
    readBodyMock.mockResolvedValue({ secret: 'wrong-secret' })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Invalid admin bootstrap secret.',
    })
    expect(authStoreMocks.promoteFirstUserToAdmin).not.toHaveBeenCalled()
  })

  it('非首用户时拒绝提权', async () => {
    authStoreMocks.getAdminBootstrapState.mockResolvedValue({
      adminCount: 0,
      adminExists: false,
      firstUserId: 'u1',
      isFirstUser: false,
      requiresBootstrap: true,
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Only the first active user can bootstrap administrator.',
    })
    expect(authStoreMocks.promoteFirstUserToAdmin).not.toHaveBeenCalled()
  })

  it('已存在管理员时返回冲突', async () => {
    authStoreMocks.getAdminBootstrapState.mockResolvedValue({
      adminCount: 1,
      adminExists: true,
      firstUserId: 'u1',
      isFirstUser: true,
      requiresBootstrap: false,
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Administrator already exists.',
    })
    expect(authStoreMocks.promoteFirstUserToAdmin).not.toHaveBeenCalled()
  })
})
