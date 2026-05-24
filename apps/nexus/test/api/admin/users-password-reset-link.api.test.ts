import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  auth: {
    origin: 'https://tuff.example.com',
  },
}))

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  createPasswordResetToken: vi.fn(),
  getUserById: vi.fn(),
}))

const adminAuditMocks = vi.hoisted(() => ({
  logAdminAudit: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getRequestURL: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRequestURL: h3Mocks.getRequestURL,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/adminAuditStore', () => adminAuditMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../../server/api/admin/users/[id]/password-reset-link.post')).default as (event: any) => Promise<any>
})

function makeEvent(userId = 'user_1') {
  return {
    context: {
      params: {
        id: userId,
      },
    },
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
  }
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'owner@example.com',
    name: 'Owner',
    image: null,
    role: 'user',
    status: 'active',
    emailState: 'verified',
    locale: null,
    disabledAt: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  }
}

describe('/api/admin/users/[id]/password-reset-link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeConfig.auth.origin = 'https://tuff.example.com'
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    authStoreMocks.getUserById.mockResolvedValue(activeUser())
    authStoreMocks.createPasswordResetToken.mockResolvedValue('reset-token-secret')
    adminAuditMocks.logAdminAudit.mockResolvedValue(undefined)
    h3Mocks.getRequestURL.mockReturnValue(new URL('https://fallback.example.com/api/admin/users/user_1/password-reset-link'))
    h3Mocks.readBody.mockResolvedValue({ ttlMinutes: 45 })
  })

  it('generates a bounded reset link for active users and audits without the token', async () => {
    const result = await handler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(authStoreMocks.createPasswordResetToken).toHaveBeenCalledWith(expect.anything(), 'user_1', 45 * 60 * 1000)
    expect(result).toEqual(expect.objectContaining({
      resetUrl: expect.stringContaining('https://tuff.example.com/reset-password'),
      ttlMinutes: 45,
      expiresAt: expect.any(String),
    }))
    expect(result.resetUrl).toContain('email=owner%40example.com')
    expect(result.resetUrl).toContain('token=reset-token-secret')
    expect(adminAuditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'user.password_reset_link.create',
      targetType: 'user',
      targetId: 'user_1',
      targetLabel: 'owner@example.com',
      metadata: expect.objectContaining({
        ttlMinutes: 45,
        expiresAt: expect.any(String),
      }),
    }))
    const auditPayload = JSON.stringify(adminAuditMocks.logAdminAudit.mock.calls)
    expect(auditPayload).not.toContain('reset-token-secret')
  })

  it('clamps excessive ttl values to one day', async () => {
    h3Mocks.readBody.mockResolvedValue({ ttlMinutes: 99999 })

    const result = await handler(makeEvent())

    expect(result.ttlMinutes).toBe(24 * 60)
    expect(authStoreMocks.createPasswordResetToken).toHaveBeenCalledWith(expect.anything(), 'user_1', 24 * 60 * 60 * 1000)
  })

  it('falls back to request origin when auth origin is not configured', async () => {
    runtimeConfig.auth.origin = ''

    const result = await handler(makeEvent())

    expect(result.resetUrl).toContain('https://fallback.example.com/reset-password')
  })

  it('rejects non-active users before creating tokens', async () => {
    authStoreMocks.getUserById.mockResolvedValue(activeUser({ status: 'disabled' }))

    await expect(handler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Only active users can reset password.',
    })
    expect(authStoreMocks.createPasswordResetToken).not.toHaveBeenCalled()
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it('rejects merged users before creating tokens', async () => {
    authStoreMocks.getUserById.mockResolvedValue(activeUser({ status: 'merged' }))

    await expect(handler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Merged users cannot reset password.',
    })
    expect(authStoreMocks.createPasswordResetToken).not.toHaveBeenCalled()
  })
})
