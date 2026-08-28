import { beforeEach, describe, expect, it, vi } from 'vitest'

// requireAdminOrApiKey falls back to API-key auth when the session is not an
// admin. requireApiKey performs no scope check and no admin check when the scope
// list is empty, so an empty list must not be treated as "any key will do".

const apiKeyStoreMocks = vi.hoisted(() => ({ validateApiKey: vi.fn() }))
const authStoreMocks = vi.hoisted(() => ({
  consumeLoginToken: vi.fn(),
  createUser: vi.fn(),
  ensureDeviceForRequest: vi.fn(),
  getDevice: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  readDeviceId: vi.fn(),
  readDeviceMetadata: vi.fn(),
  upsertDevice: vi.fn(),
}))

vi.mock('#auth', () => ({ getToken: vi.fn(async () => null) }))
vi.mock('../../../server/utils/apiKeyStore', () => apiKeyStoreMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/creditsStore', () => ({ ensurePersonalTeam: vi.fn() }))
vi.mock('../../../server/utils/cloudflare', () => ({ readCloudflareBindings: () => undefined }))
vi.mock('../../../server/utils/sessionAuthSecret', () => ({ resolveSessionAuthSecret: () => 'test-secret-value-32-chars-long!!' }))

function makeEvent(authorization?: string) {
  return {
    path: '/api/admin/probe',
    node: { req: { url: '/api/admin/probe', headers: authorization ? { authorization } : {} } },
    context: {},
    headers: new Headers(authorization ? { authorization } : {}),
  } as any
}

describe('requireAdminOrApiKey scope handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // A non-admin, fully active account holding a valid API key.
    apiKeyStoreMocks.validateApiKey.mockResolvedValue({ userId: 'user_1', scopes: ['plugin:read'] })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'user_1', role: 'user', status: 'active' })
  })

  it('does not fall back to an arbitrary API key when no scope is required', async () => {
    const { requireAdminOrApiKey } = await import('../../../server/utils/auth')

    // Without the guard this resolves as { authType: 'apiKey' } for a plain user.
    await expect(requireAdminOrApiKey(makeEvent('Bearer tuff_probe_key'))).rejects.toThrow()
    expect(apiKeyStoreMocks.validateApiKey).not.toHaveBeenCalled()
  })

  it('rejects a non-admin API key on an admin-only scope', async () => {
    const { requireAdminOrApiKey } = await import('../../../server/utils/auth')

    await expect(requireAdminOrApiKey(makeEvent('Bearer tuff_probe_key'), ['maintenance:write'])).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('still accepts an admin API key carrying the required scope', async () => {
    apiKeyStoreMocks.validateApiKey.mockResolvedValue({ userId: 'admin_1', scopes: ['maintenance:write'] })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'admin_1', role: 'admin', status: 'active' })

    const { requireAdminOrApiKey } = await import('../../../server/utils/auth')
    const result = await requireAdminOrApiKey(makeEvent('Bearer tuff_probe_key'), ['maintenance:write'])

    expect(result.authType).toBe('apiKey')
    expect(result.userId).toBe('admin_1')
  })
})
