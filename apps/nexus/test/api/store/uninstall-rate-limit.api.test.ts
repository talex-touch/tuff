import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/store/uninstall.post'

/**
 * /api/store/uninstall has no auth guard and no proof the caller ever installed the plugin, so
 * an anonymous loop of POST {"slug":"competitor-plugin"} could drive any plugin's public install
 * count to 0 within seconds (#922).
 *
 * Auth is deliberately not the fix: the shipped core-app client posts only `{ slug }` with no
 * credentials and ignores the response, so requiring a session would silently stop every genuine
 * uninstall from counting. These tests pin the rate limit AND the fact that an ordinary
 * unauthenticated call still works.
 */

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const rateLimitMocks = vi.hoisted(() => ({
  enforceAdminRateLimit: vi.fn(),
}))

const ipMocks = vi.hoisted(() => ({
  resolveRequestIp: vi.fn(),
  hashIpValue: vi.fn((_event: unknown, ip: string) => `hashed:${ip}`),
}))

const pluginsStoreMocks = vi.hoisted(() => ({
  getPluginBySlug: vi.fn(),
  decrementPluginInstalls: vi.fn(),
}))

vi.hoisted(() => {
  // Nuxt auto-import; the handler module calls it at load time.
  Object.defineProperty(globalThis, 'defineEventHandler', {
    configurable: true,
    value: <T>(fn: T) => fn,
  })
})

vi.mock('h3', () => h3Mocks)
vi.mock('../../../server/utils/adminRateLimitStore', () => rateLimitMocks)
vi.mock('../../../server/utils/adminEmergencyStore', () => ({ hashIpValue: ipMocks.hashIpValue }))
vi.mock('../../../server/utils/ipSecurityStore', () => ({ resolveRequestIp: ipMocks.resolveRequestIp }))
vi.mock('../../../server/utils/pluginsStore', () => pluginsStoreMocks)

const event = {} as H3Event

function invoke() {
  return (handler as unknown as (event: H3Event) => Promise<unknown>)(event)
}

describe('store uninstall rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.readBody.mockResolvedValue({ slug: 'victim-plugin' })
    ipMocks.resolveRequestIp.mockReturnValue('203.0.113.9')
    ipMocks.hashIpValue.mockImplementation((_e: unknown, ip: string) => `hashed:${ip}`)
    rateLimitMocks.enforceAdminRateLimit.mockResolvedValue(undefined)
    pluginsStoreMocks.getPluginBySlug.mockResolvedValue({ id: 'plugin-1' })
    pluginsStoreMocks.decrementPluginInstalls.mockResolvedValue(0)
  })

  it('rate limits per address and per address+plugin before touching the counter', async () => {
    await invoke()

    const keys = rateLimitMocks.enforceAdminRateLimit.mock.calls.map(call => call[1].key)
    expect(keys).toEqual([
      'store-uninstall:ip:hashed:203.0.113.9',
      'store-uninstall:ip-plugin:hashed:203.0.113.9:victim-plugin',
    ])
  })

  it('does not decrement when the rate limit rejects', async () => {
    rateLimitMocks.enforceAdminRateLimit.mockRejectedValueOnce(
      Object.assign(new Error('Rate limited'), { statusCode: 429 }),
    )

    await expect(invoke()).rejects.toThrow('Rate limited')

    // The whole point: a throttled attacker must not still get their decrement through.
    expect(pluginsStoreMocks.decrementPluginInstalls).not.toHaveBeenCalled()
  })

  it('still decrements for an ordinary unauthenticated call', async () => {
    // The shipped client sends no credentials, so this path must keep working.
    const result = await invoke()

    expect(pluginsStoreMocks.decrementPluginInstalls).toHaveBeenCalledWith(event, 'plugin-1')
    expect(result).toEqual({ success: true, slug: 'victim-plugin' })
  })

  it('rejects a missing slug before doing any work', async () => {
    h3Mocks.readBody.mockResolvedValue({})

    const result = await invoke()

    expect(result).toEqual({ success: false, message: 'Plugin slug is required.' })
    expect(rateLimitMocks.enforceAdminRateLimit).not.toHaveBeenCalled()
    expect(pluginsStoreMocks.decrementPluginInstalls).not.toHaveBeenCalled()
  })

  it('still works when the address cannot be resolved', async () => {
    // Rate limiting keys on the address; an unknown address must not break the endpoint.
    ipMocks.resolveRequestIp.mockReturnValue(undefined)

    await invoke()

    expect(rateLimitMocks.enforceAdminRateLimit).not.toHaveBeenCalled()
    expect(pluginsStoreMocks.decrementPluginInstalls).toHaveBeenCalled()
  })
})
