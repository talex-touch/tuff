import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

/**
 * Every reader of the client IP, driven with the request Cloudflare forwards when the client wrote
 * its own X-Forwarded-For: Cloudflare keeps that value and appends the real address after it, and
 * sets CF-Connecting-IP itself. The forged first entry must not reach the login history, the key of
 * the device-auth IP limit, the admin audit log or the docs assistant's audit meta.
 */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

const CLIENT_IP = '203.0.113.10'

let sqlite: SqliteD1Database

function createEvent(headers: Record<string, string>) {
  return {
    context: { cloudflare: { env: { DB: sqlite } } },
    node: { req: { headers: { 'user-agent': 'vitest', ...headers } } },
  } as any
}

/** What Cloudflare forwards for a client that sent `X-Forwarded-For: <forged>`. */
function forgedEvent(forged = '198.51.100.66') {
  return createEvent({ 'cf-connecting-ip': CLIENT_IP, 'x-forwarded-for': `${forged}, ${CLIENT_IP}` })
}

function recordedIps(table: string) {
  return sqlite.sqlite.prepare(`SELECT ip FROM ${table}`).all().map(row => row.ip)
}

beforeEach(() => {
  vi.resetModules()
  sqlite = createSqliteD1()
})

describe('client IP behind Cloudflare', () => {
  it('records a login attempt under CF-Connecting-IP', async () => {
    const store = await import('../authStore')
    await store.logLoginAttempt(forgedEvent(), { userId: 'user-1', success: true })

    expect(recordedIps('auth_login_history')).toEqual([CLIENT_IP])
    expect(store.readRequestIp(forgedEvent())).toBe(CLIENT_IP)
  })

  it('keys the device-auth IP limit on CF-Connecting-IP, whatever X-Forwarded-For claims', async () => {
    const store = await import('../authStore')
    // One client, twelve requests, a fresh forged address on each: still one IP.
    for (let i = 0; i < 12; i++) {
      await store.recordDeviceAuthAudit(forgedEvent(`198.51.100.${i}`), {
        action: 'request',
        status: 'success',
        deviceId: `device-${i}`,
        clientType: 'cli',
      })
    }

    const decision = await store.evaluateDeviceAuthRateLimit(forgedEvent('198.51.100.99'), { deviceId: 'device-new' })
    expect(decision).toMatchObject({ allowed: false, reason: 'rate_limited', scope: 'ip', count: 12 })
  })

  it('records an admin audit entry under CF-Connecting-IP', async () => {
    const { logAdminAudit } = await import('../adminAuditStore')
    await logAdminAudit(forgedEvent(), { adminUserId: 'admin-1', action: 'user.status.update' })

    expect(recordedIps('admin_audits')).toEqual([CLIENT_IP])
  })

  it('gives the docs assistant audit meta CF-Connecting-IP', async () => {
    const { resolveAuditMeta } = await import('../requestAuditMeta')

    expect(resolveAuditMeta(forgedEvent()).ip).toBe(CLIENT_IP)
  })

  it('falls back to the first X-Forwarded-For entry when CF-Connecting-IP is absent', async () => {
    // Local dev and tests: nothing in front of the server sets CF-Connecting-IP.
    const event = () => createEvent({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })
    const store = await import('../authStore')
    const { logAdminAudit } = await import('../adminAuditStore')
    const { resolveAuditMeta } = await import('../requestAuditMeta')

    await store.logLoginAttempt(event(), { userId: 'user-1', success: true })
    await logAdminAudit(event(), { adminUserId: 'admin-1', action: 'user.status.update' })

    expect(recordedIps('auth_login_history')).toEqual(['198.51.100.7'])
    expect(recordedIps('admin_audits')).toEqual(['198.51.100.7'])
    expect(resolveAuditMeta(event()).ip).toBe('198.51.100.7')
  })
})
