import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

/** Device-auth state transitions against real SQLite: each is one guarded statement. */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function createEvent() {
  return { context: { cloudflare: { env: { DB: sqlite } } }, node: { req: { headers: {} } } } as any
}

function statusOf(deviceCode: string) {
  return (sqlite.sqlite.prepare('SELECT status FROM auth_device_auth_requests WHERE device_code = ?').get(deviceCode) as { status: string }).status
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(createEvent(), 'warm')
})

describe('device auth transitions', () => {
  it('approves a pending request and returns the updated row', async () => {
    const request = await store.createDeviceAuthRequest(createEvent(), { deviceId: 'd1', clientType: 'cli', ttlMs: 60_000 })
    const approved = await store.approveDeviceAuthRequest(createEvent(), request.userCode, 'user-1', 'short')
    expect(approved).toMatchObject({ status: 'approved', userId: 'user-1', grantType: 'short', deviceCode: request.deviceCode })
    expect(statusOf(request.deviceCode)).toBe('approved')
  })

  it('does not approve a request that was cancelled first', async () => {
    const request = await store.createDeviceAuthRequest(createEvent(), { deviceId: 'd1', clientType: 'cli', ttlMs: 60_000 })
    expect(await store.cancelDeviceAuthRequestByDeviceCode(createEvent(), request.deviceCode)).toMatchObject({ status: 'cancelled' })

    expect(await store.approveDeviceAuthRequest(createEvent(), request.userCode, 'user-1', 'short')).toBeNull()
    expect(statusOf(request.deviceCode)).toBe('cancelled')
  })

  it('lets only one of two concurrent transitions win', async () => {
    const request = await store.createDeviceAuthRequest(createEvent(), { deviceId: 'd1', clientType: 'cli', ttlMs: 60_000 })
    const [approved, rejected] = await Promise.all([
      store.approveDeviceAuthRequest(createEvent(), request.userCode, 'user-1', 'long'),
      store.rejectDeviceAuthRequest(createEvent(), request.userCode, { reason: 'ip_mismatch' }),
    ])
    expect([approved, rejected].filter(Boolean)).toHaveLength(1)
  })

  it('does not move an expired request', async () => {
    const request = await store.createDeviceAuthRequest(createEvent(), { deviceId: 'd1', clientType: 'cli', ttlMs: 60_000 })
    sqlite.sqlite.prepare('UPDATE auth_device_auth_requests SET expires_at = ? WHERE device_code = ?')
      .run(new Date(Date.now() - 1000).toISOString(), request.deviceCode)
    expect(await store.cancelDeviceAuthRequest(createEvent(), request.userCode)).toBeNull()
    expect(statusOf(request.deviceCode)).toBe('pending')
  })
})
