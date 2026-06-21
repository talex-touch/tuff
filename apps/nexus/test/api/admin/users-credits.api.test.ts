import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

const adminAuditMocks = vi.hoisted(() => ({
  logAdminAudit: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  adjustUserCredits: vi.fn(),
  getCreditSummary: vi.fn(),
  listCreditLedgerByUsers: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/adminAuditStore', () => adminAuditMocks)
vi.mock('../../../server/utils/creditsStore', () => creditsMocks)

let getHandler: (event: any) => Promise<any>
let patchHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  getHandler = (await import('../../../server/api/admin/users/[id]/credits.get')).default as (event: any) => Promise<any>
  patchHandler = (await import('../../../server/api/admin/users/[id]/credits.patch')).default as (event: any) => Promise<any>
})

function makeEvent(userId = 'user_1') {
  return {
    context: {
      params: {
        id: userId,
      },
    },
  }
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'owner@example.com',
    name: 'Owner',
    role: 'user',
    status: 'active',
    ...overrides,
  }
}

const summary = {
  month: '2026-06',
  user: { quota: 100, used: 40 },
  team: { quota: 500, used: 140 },
}

function ledger(overrides: Record<string, unknown> = {}) {
  return {
    entries: [
      {
        id: 'ledger_1',
        userId: 'user_1',
        userEmail: 'owner@example.com',
        userName: 'Owner',
        delta: -20,
        reason: 'invoke',
        createdAt: '2026-06-21T00:00:00.000Z',
        metadata: { tokens: 42 },
      },
    ],
    page: 2,
    pageSize: 2,
    total: 5,
    ...overrides,
  }
}

describe('/api/admin/users/[id]/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    authStoreMocks.getUserById.mockResolvedValue(activeUser())
    creditsMocks.getCreditSummary.mockResolvedValue(summary)
    creditsMocks.listCreditLedgerByUsers.mockResolvedValue(ledger())
    creditsMocks.adjustUserCredits.mockResolvedValue({
      ledgerId: 'ledger_adjust',
      userId: 'user_1',
      delta: -10,
      reason: 'manual correction',
      createdAt: '2026-06-21T01:00:00.000Z',
    })
    adminAuditMocks.logAdminAudit.mockResolvedValue(undefined)
    h3Mocks.getQuery.mockReturnValue({ page: '2', limit: '2' })
    h3Mocks.readBody.mockResolvedValue({
      amount: 10,
      direction: 'subtract',
      reason: 'manual correction',
    })
  })

  it('returns selected user credits with paginated ledger', async () => {
    const result = await getHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(creditsMocks.getCreditSummary).toHaveBeenCalledWith(expect.anything(), 'user_1')
    expect(creditsMocks.listCreditLedgerByUsers).toHaveBeenCalledWith(expect.anything(), ['user_1'], {
      page: 2,
      limit: 2,
    })
    expect(result).toEqual(expect.objectContaining({
      user: expect.objectContaining({
        id: 'user_1',
        status: 'active',
      }),
      summary,
      ledger: {
        entries: ledger().entries,
        pagination: {
          page: 2,
          limit: 2,
          total: 5,
          totalPages: 3,
        },
      },
    }))
  })

  it('rejects merged users before credit adjustment', async () => {
    authStoreMocks.getUserById.mockResolvedValue(activeUser({ status: 'merged' }))

    await expect(patchHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Merged users cannot be updated.',
    })
    expect(creditsMocks.adjustUserCredits).not.toHaveBeenCalled()
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it('keeps quota from dropping below used credits', async () => {
    creditsMocks.adjustUserCredits.mockRejectedValue(new Error('User credits quota cannot be less than used credits.'))

    await expect(patchHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'User credits quota cannot be less than used credits.',
    })
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it('adjusts credits with audit reason and records admin audit metadata', async () => {
    creditsMocks.listCreditLedgerByUsers.mockResolvedValue(ledger({ page: 1, pageSize: 10, total: 1 }))

    const result = await patchHandler(makeEvent())

    expect(creditsMocks.adjustUserCredits).toHaveBeenCalledWith(expect.anything(), 'user_1', -10, 'manual correction', {
      adminUserId: 'admin_1',
      source: 'admin-user-management',
    })
    expect(adminAuditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'user.credits.adjust',
      targetType: 'user',
      targetId: 'user_1',
      targetLabel: 'owner@example.com',
      metadata: {
        delta: -10,
        reason: 'manual correction',
        ledgerId: 'ledger_adjust',
      },
    }))
    expect(result.adjustment).toEqual(expect.objectContaining({
      delta: -10,
      reason: 'manual correction',
    }))
    expect(result.ledger.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    })
  })
})
