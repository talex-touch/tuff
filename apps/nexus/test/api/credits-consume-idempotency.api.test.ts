import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireVerifiedEmail: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../server/utils/auth', () => authMocks)
vi.mock('../../server/utils/creditsStore', () => creditsMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../server/api/credits/consume.post')).default as (event: any) => Promise<any>
})

describe('/api/credits/consume idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireVerifiedEmail.mockResolvedValue({ userId: 'user-1' })
    h3Mocks.getHeader.mockReturnValue('docs:trace-1')
    h3Mocks.readBody.mockResolvedValue({
      amount: 42,
      reason: 'docs-assistant',
      metadata: { traceId: 'trace-1' },
    })
    creditsMocks.consumeCredits.mockResolvedValue({
      ledgerId: 'ledger-1',
      idempotencyKey: 'docs:trace-1',
    })
  })

  it('passes the request idempotency key into credit consumption', async () => {
    const result = await handler({})

    expect(creditsMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      42,
      'docs-assistant',
      { traceId: 'trace-1' },
      { idempotencyKey: 'docs:trace-1' },
    )
    expect(result).toEqual({
      success: true,
      ledgerId: 'ledger-1',
      idempotencyKey: 'docs:trace-1',
    })
  })

  it('keeps invalid amounts out of the credit store', async () => {
    h3Mocks.readBody.mockResolvedValue({ amount: 0 })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid amount.',
    })
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
  })
})
