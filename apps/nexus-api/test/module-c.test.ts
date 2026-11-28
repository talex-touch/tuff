import { describe, expect, it } from 'vitest'
import deleteMeHandler from '../server/api/user/me.delete'
import exportMeHandler from '../server/api/user/me/export.get'
import { createApiKey, listApiKeys } from '../server/utils/apiKeyStore'
import { createLoginToken, getUserById, upsertDevice } from '../server/utils/authStore'
import { redactPrivateExportFields } from '../server/utils/privacyDataStore'
import {
  buildSessionCookieHeader,
  createSqliteD1Database,
  createTestEvent,
  seedTestUser,
} from './helpers/test-runtime'

describe('Module C: Privacy Export & Single-Step Account Deletion', () => {
  it('streams synchronous JSON account export with redacted sensitive keys', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, { email: 'export@example.com', name: 'Exporter' })
    const cookie = await buildSessionCookieHeader({ userId: user.id, email: user.email })

    await createApiKey(createTestEvent({ db }), user.id, 'CLI Key', ['plugin:publish'])

    const exportEvent = createTestEvent({
      db,
      url: '/api/user/me/export',
      headers: { cookie },
    })
    const rawJson = await exportMeHandler(exportEvent)
    expect(typeof rawJson).toBe('string')
    expect(String(exportEvent.node.res.getHeader('content-type'))).toContain('application/json')
    expect(String(exportEvent.node.res.getHeader('content-disposition'))).toContain('attachment; filename="tuff-account-data-')
    expect(String(exportEvent.node.res.getHeader('cache-control'))).toBe('private, no-store')

    const parsed = JSON.parse(rawJson)
    expect(parsed.account.email).toBe('export@example.com')
    expect(parsed.apiKeys).toHaveLength(1)
    expect(parsed.apiKeys[0].keyHash).toBeUndefined()

    const redacted = redactPrivateExportFields({
      safeField: 'ok',
      passwordHash: 'secret1',
      nested: { accessToken: 'tok', credential: 'cred', keep: 42 },
    })
    expect(redacted).toEqual({ safeField: 'ok', nested: { keep: 42 } })
  })

  it('enforces confirm phrase and recent-auth / passkey check on single-step DELETE /api/user/me', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, { email: 'delete-me@example.com' })

    await upsertDevice(createTestEvent({ db }), user.id, 'dev-1', { deviceName: 'MacBook' })
    await createApiKey(createTestEvent({ db }), user.id, 'PAT', ['plugin:publish'])

    const freshCookie = await buildSessionCookieHeader({ userId: user.id, email: user.email })

    // 1. Wrong confirm phrase -> 400
    await expect(deleteMeHandler(createTestEvent({
      db,
      method: 'DELETE',
      url: '/api/user/me',
      headers: { cookie: freshCookie },
      body: { confirm: 'WRONG' },
    }))).rejects.toMatchObject({ statusCode: 400 })

    // 2. Stale session (>15 min) without x-login-token -> 403 RECENT_AUTH_REQUIRED
    const staleCookie = await buildSessionCookieHeader({
      userId: user.id,
      email: user.email,
      authTime: Math.floor(Date.now() / 1000) - 3600,
    })
    await expect(deleteMeHandler(createTestEvent({
      db,
      method: 'DELETE',
      url: '/api/user/me',
      headers: { cookie: staleCookie },
      body: { confirm: 'DELETE_MY_DATA' },
    }))).rejects.toMatchObject({ statusCode: 403 })

    // 3. Stale session WITH valid passkey x-login-token succeeds atomically
    const stepUpToken = await createLoginToken(createTestEvent({ db }), user.id, 'passkey', 5 * 60 * 1000)
    const deleteEvent = createTestEvent({
      db,
      method: 'DELETE',
      url: '/api/user/me',
      headers: {
        cookie: staleCookie,
        'x-login-token': stepUpToken,
      },
      body: { confirm: 'DELETE_MY_DATA' },
    })
    const result = await deleteMeHandler(deleteEvent)
    expect(result.ok).toBe(true)
    expect(result.status).toBe('deletion_pending')
    expect(result.deletionRequestedAt).toBeTruthy()
    expect(result.deletionScheduledAt).toBeTruthy()
    expect(String(deleteEvent.node.res.getHeader('set-cookie'))).toContain('Max-Age=0')

    // Verify user status transitioned, API keys deleted, and devices revoked atomically
    const updatedUser = await getUserById(createTestEvent({ db }), user.id)
    expect(updatedUser?.status).toBe('deletion_pending')
    const remainingKeys = await listApiKeys(createTestEvent({ db }), user.id)
    expect(remainingKeys).toHaveLength(0)
    const activeDeviceRow = db.sqlite.prepare(`SELECT revoked_at FROM auth_devices WHERE user_id = ? AND id = 'dev-1'`).get(user.id) as { revoked_at: string | null }
    expect(activeDeviceRow.revoked_at).toBeTruthy()
  })
})
