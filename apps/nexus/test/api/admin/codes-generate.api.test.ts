import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  createActivationCode: vi.fn(),
}))

const bodyMock = vi.hoisted(() => ({ readBody: vi.fn() }))

// The handler writes an audit entry after generating, and `logAdminAudit` throws
// "Database not available" without a D1 binding. Stubbing it keeps these cases
// about input validation, and lets the success paths assert the batch entry the
// audit-coverage work added.
const auditMocks = vi.hoisted(() => ({ logAdminAudit: vi.fn() }))

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/subscriptionStore', () => subscriptionMocks)
vi.mock('../../../server/utils/adminAuditStore', () => auditMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  ;(globalThis as any).createError = (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input)
  ;(globalThis as any).readBody = bodyMock.readBody
  handler = (await import('../../../server/api/admin/codes/generate.post')).default as (event: any) => Promise<any>
})

function body(overrides: Record<string, unknown> = {}) {
  return { plan: 'PRO', durationDays: 30, count: 1, ...overrides }
}

describe('/api/admin/codes/generate input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditMocks.logAdminAudit.mockResolvedValue(undefined)
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin_1', user: { role: 'admin' } })
    subscriptionMocks.createActivationCode.mockImplementation(async (_event: any, input: any) => ({
      id: 'code_1',
      code: 'TUFF-PRO-TEST',
      ...input,
      uses: 0,
      status: 'active',
    }))
  })

  it('rejects a negative maxUses instead of persisting it', async () => {
    bodyMock.readBody.mockResolvedValue(body({ maxUses: -5 }))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Max uses must be between 1 and 1000',
    })
    expect(subscriptionMocks.createActivationCode).not.toHaveBeenCalled()
  })

  it('rejects a maxUses above the bound the admin form advertises', async () => {
    bodyMock.readBody.mockResolvedValue(body({ maxUses: 999999999 }))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Max uses must be between 1 and 1000',
    })
    expect(subscriptionMocks.createActivationCode).not.toHaveBeenCalled()
  })

  it('rejects a negative expiresInDays that would mint an already-expired code', async () => {
    bodyMock.readBody.mockResolvedValue(body({ expiresInDays: -30 }))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Expiry must be between 1 and 365 days',
    })
    expect(subscriptionMocks.createActivationCode).not.toHaveBeenCalled()
  })

  it('rejects an expiresInDays large enough to overflow the expiry Date', async () => {
    bodyMock.readBody.mockResolvedValue(body({ expiresInDays: 1e15 }))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Expiry must be between 1 and 365 days',
    })
    expect(subscriptionMocks.createActivationCode).not.toHaveBeenCalled()
  })

  it('still accepts the values the admin form submits', async () => {
    bodyMock.readBody.mockResolvedValue(body({ maxUses: 1, expiresInDays: 90, count: 2 }))

    const result = await handler({})

    expect(result.success).toBe(true)
    expect(subscriptionMocks.createActivationCode).toHaveBeenCalledTimes(2)
    expect(subscriptionMocks.createActivationCode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      plan: 'PRO',
      durationDays: 30,
      maxUses: 1,
      expiresInDays: 90,
      createdBy: 'admin_1',
    }))
    // One entry for the batch, not one per code.
    expect(auditMocks.logAdminAudit).toHaveBeenCalledTimes(1)
    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'activation_code.generate',
    }))
  })

  it('leaves maxUses and expiresInDays optional', async () => {
    bodyMock.readBody.mockResolvedValue(body())

    const result = await handler({})

    expect(result.success).toBe(true)
    expect(subscriptionMocks.createActivationCode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      maxUses: 1,
      expiresInDays: undefined,
    }))
  })
})
