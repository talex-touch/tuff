import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_ROUTES, consoleApi } from '@/api/endpoints'
import { assertSameOriginApiPath } from '@/api/http'
import { en } from '@/i18n/en'
import { zh } from '@/i18n/zh'

const SRC_ROOT = resolve(__dirname, '../..')

function collectSourceFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === '__tests__')
        continue
      results.push(...collectSourceFiles(full))
    }
    else if (/\.(ts|vue|js)$/.test(entry)) {
      results.push(full)
    }
  }
  return results
}

function collectEndpointStrings(node: unknown): string[] {
  if (typeof node === 'string')
    return [node]
  if (typeof node === 'function')
    return [String((node as (...args: string[]) => string)('id-1', 'ver-1'))]
  if (node && typeof node === 'object')
    return Object.values(node).flatMap(collectEndpointStrings)
  return []
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v))
      keys.push(...flattenKeys(v as Record<string, unknown>, full))
    else
      keys.push(full)
  }
  return keys.sort()
}

describe('API client contract & deleted-route guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restricts every route to same-origin /api/* paths', () => {
    const endpoints = collectEndpointStrings(API_ROUTES)
    expect(endpoints.length).toBeGreaterThan(40)
    for (const endpoint of endpoints)
      expect(endpoint.startsWith('/api/')).toBe(true)

    expect(() => assertSameOriginApiPath('https://other.example/api/auth/me')).toThrow()
    expect(() => assertSameOriginApiPath('/other/path')).toThrow()
  })

  it('calls exact redesigned nexus-api endpoints for Modules A/B/C/D and Device Flow', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await consoleApi.getAdminUsage(30)
    await consoleApi.listAiProviders()
    await consoleApi.checkAiProvider('prov-1')
    await consoleApi.upsertAiScene({
      id: 'nexus.intelligence.text.chat',
      status: 'enabled',
      requiredCapabilities: ['text.chat'],
      bindings: [],
    })
    await consoleApi.getAiUsage({ days: 30 })
    await consoleApi.listNotifications({ page: 1, limit: 20 })
    await consoleApi.markNotificationsRead({ all: true })
    await consoleApi.subscribePush({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
    await consoleApi.unsubscribePush('sub-1')
    await consoleApi.getStorageStatus()
    await consoleApi.listStorageSessions({ page: 1, limit: 10 })
    await consoleApi.exportMyData()
    await consoleApi.deleteMyAccount({ confirm: 'DELETE_MY_DATA' })
    await consoleApi.refreshExchangeRates()
    await consoleApi.getDeviceAuthInfo('CODE-123')
    await consoleApi.approveDeviceAuth({ code: 'CODE-123', grantType: 'short' })
    await consoleApi.listSigningKeys()
    await consoleApi.listAdminStorePlugins({ page: 1, limit: 10 })

    const calls = fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`)
    expect(calls).toEqual([
      'GET /api/admin/usage?days=30',
      'GET /api/admin/ai/providers',
      'POST /api/admin/ai/providers/prov-1/check',
      'PUT /api/admin/ai/scenes',
      'GET /api/admin/ai/usage?days=30',
      'GET /api/notifications?page=1&limit=20',
      'POST /api/notifications/read',
      'POST /api/notifications/push',
      'DELETE /api/notifications/push/sub-1',
      'GET /api/dashboard/storage',
      'GET /api/dashboard/storage/sessions?page=1&limit=10',
      'GET /api/user/me/export',
      'DELETE /api/user/me',
      'POST /api/admin/exchange/refresh',
      'GET /api/app-auth/device/info?code=CODE-123',
      'POST /api/app-auth/device/approve',
      'GET /api/dashboard/plugin-signing-keys',
      'GET /api/admin/store/plugins?page=1&limit=10',
    ])
  })

  it('contains zero references to deleted governance, checkin, oauth-idp, docs-runtime, or /_i18n/ endpoints', () => {
    const forbiddenSubstrings = [
      'admin/emergency',
      'admin/governance',
      'admin/risk',
      'admin/audits',
      'admin/analytics/docs',
      'admin/release-evidence',
      'admin/oob',
      'admin/doc-comments',
      'admin/telemetry/ip-blocks',
      'dashboard/oauth',
      'oauth/authorize',
      'oauth/token',
      'dashboard/storage/policies',
      'dashboard/storage/channels',
      'dashboard/notifications/channels',
      'dashboard/privacy-export-jobs',
      'account-deletion/terms-session',
      'credits/checkin',
      'dashboard/intelligence/ip-bans',
      'fx-rate',
      '/_i18n/',
    ]

    const files = collectSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(20)

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const forbidden of forbiddenSubstrings)
        expect(content, `${file} must not reference ${forbidden}`).not.toContain(forbidden)

      // Enforce @talex-touch/utils/env helpers instead of typeof window/document/navigator
      expect(content, `${file} must not use typeof window`).not.toMatch(/\btypeof\s+window\b/)
      expect(content, `${file} must not use typeof document`).not.toMatch(/\btypeof\s+document\b/)
      expect(content, `${file} must not use typeof navigator`).not.toMatch(/\btypeof\s+navigator\b/)
    }
  })

  it('maintains 100% static key parity between en and zh i18n bundles', () => {
    expect(flattenKeys(en as unknown as Record<string, unknown>)).toEqual(
      flattenKeys(zh as unknown as Record<string, unknown>),
    )
  })
})
