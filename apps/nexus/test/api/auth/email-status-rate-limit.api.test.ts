import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/auth/email-status.get'

/**
 * /api/auth/email-status returns whether an arbitrary address is registered and its status, with
 * no auth, no Turnstile and no throttle -- an account-existence oracle scriptable over a breach
 * list (#921).
 *
 * Auth is not available as a fix: the sign-in flow calls this before the user is authenticated
 * to decide whether to show sign-in or sign-up. These tests pin the throttle AND the fact that
 * an ordinary anonymous lookup still answers.
 */

const h3Mocks = vi.hoisted(() => ({
  createError: vi.fn((input: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input)),
  getQuery: vi.fn(),
}))

const rateLimitMocks = vi.hoisted(() => ({ enforceAdminRateLimit: vi.fn() }))
const ipMocks = vi.hoisted(() => ({
  resolveRequestIp: vi.fn(),
  hashIpValue: vi.fn((_event: unknown, ip: string) => `hashed:${ip}`),
}))
const authStoreMocks = vi.hoisted(() => ({ getUserByEmail: vi.fn() }))

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'defineEventHandler', {
    configurable: true,
    value: <T>(fn: T) => fn,
  })
})

vi.mock('h3', () => h3Mocks)
vi.mock('../../../server/utils/adminRateLimitStore', () => rateLimitMocks)
vi.mock('../../../server/utils/adminEmergencyStore', () => ({ hashIpValue: ipMocks.hashIpValue }))
vi.mock('../../../server/utils/ipSecurityStore', () => ({ resolveRequestIp: ipMocks.resolveRequestIp }))
vi.mock('../../../server/utils/authStore', () => authStoreMocks)

const event = {} as H3Event

function invoke() {
  return (handler as unknown as (event: H3Event) => Promise<unknown>)(event)
}

describe('email-status enumeration throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({ email: 'Victim@Example.COM' })
    h3Mocks.createError.mockImplementation((input: { statusCode: number, statusMessage: string }) =>
      Object.assign(new Error(input.statusMessage), input))
    ipMocks.resolveRequestIp.mockReturnValue('203.0.113.9')
    ipMocks.hashIpValue.mockImplementation((_e: unknown, ip: string) => `hashed:${ip}`)
    rateLimitMocks.enforceAdminRateLimit.mockResolvedValue(undefined)
    authStoreMocks.getUserByEmail.mockResolvedValue({ id: 'u1', status: 'active' })
  })

  it('throttles per address', async () => {
    await invoke()

    expect(rateLimitMocks.enforceAdminRateLimit).toHaveBeenCalledWith(event, expect.objectContaining({
      key: 'auth-email-status:ip:hashed:203.0.113.9',
    }))
  })

  it('does not reveal whether the account exists once throttled', async () => {
    rateLimitMocks.enforceAdminRateLimit.mockRejectedValueOnce(
      Object.assign(new Error('Rate limited'), { statusCode: 429 }),
    )

    await expect(invoke()).rejects.toThrow('Rate limited')

    // The whole point: a throttled caller must not still get the oracle's answer.
    expect(authStoreMocks.getUserByEmail).not.toHaveBeenCalled()
  })

  it('still answers an ordinary anonymous lookup', async () => {
    // The sign-in flow depends on this working without credentials.
    const result = await invoke()

    expect(authStoreMocks.getUserByEmail).toHaveBeenCalledWith(event, 'victim@example.com')
    expect(result).toEqual({ exists: true, status: 'active' })
  })

  it('rejects a malformed address before consuming quota', async () => {
    h3Mocks.getQuery.mockReturnValue({ email: 'not-an-email' })

    await expect(invoke()).rejects.toThrow('Invalid email.')
    expect(rateLimitMocks.enforceAdminRateLimit).not.toHaveBeenCalled()
  })

  it('still answers when the address cannot be resolved', async () => {
    ipMocks.resolveRequestIp.mockReturnValue(undefined)

    const result = await invoke()

    expect(rateLimitMocks.enforceAdminRateLimit).not.toHaveBeenCalled()
    expect(result).toEqual({ exists: true, status: 'active' })
  })
})
