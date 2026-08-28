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
  readBody: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: h3Mocks.readBody }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/adminAuditStore', () => adminAuditMocks)
vi.mock('../../../server/utils/creditsStore', () => creditsMocks)

let patchHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  patchHandler = (await import('../../../server/api/admin/users/[id]/credits.patch')).default as (event: any) => Promise<any>
})

const event = { context: { params: { id: 'user_1' } } }

describe('/api/admin/users/[id]/credits amount bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin_1', user: { role: 'admin' } })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'user_1', email: 'owner@example.com', status: 'active' })
    creditsMocks.getCreditSummary.mockResolvedValue({ month: '2026-08' })
    creditsMocks.listCreditLedgerByUsers.mockResolvedValue({ entries: [], page: 1, pageSize: 10, total: 0 })
    creditsMocks.adjustUserCredits.mockResolvedValue({
      ledgerId: 'ledger_1',
      userId: 'user_1',
      delta: 10,
      reason: 'manual',
      createdAt: '2026-08-27T00:00:00.000Z',
    })
    adminAuditMocks.logAdminAudit.mockResolvedValue(undefined)
  })

  it.each([
    ['1e15 as a number', 1e15],
    ['9e99 as a string', '9e99'],
    ['one past the cap', 1_000_000_001],
  ])('rejects an adjustment of %s', async (_label, amount) => {
    h3Mocks.readBody.mockResolvedValue({ amount, direction: 'add', reason: 'probe' })

    await expect(patchHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Credit amount exceeds the maximum single adjustment.',
    })
    expect(creditsMocks.adjustUserCredits).not.toHaveBeenCalled()
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it('accepts an adjustment at the cap', async () => {
    h3Mocks.readBody.mockResolvedValue({ amount: 1_000_000_000, direction: 'add', reason: 'probe' })

    await patchHandler(event)

    expect(creditsMocks.adjustUserCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      1_000_000_000,
      'probe',
      expect.anything(),
    )
  })

  it('still rejects a zero amount as invalid rather than out of range', async () => {
    h3Mocks.readBody.mockResolvedValue({ amount: 0, direction: 'add', reason: 'probe' })

    await expect(patchHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid credit amount.',
    })
  })
})
