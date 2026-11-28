import { Buffer } from 'node:buffer'
import { createCipheriv, randomBytes } from 'node:crypto'
import hkdf from '@panva/hkdf'
import { describe, expect, it } from 'vitest'
import csrfHandler from '../server/api/auth/csrf.get'
import providersHandler from '../server/api/auth/providers.get'
import sessionHandler from '../server/api/auth/session.get'
import credentialsHandler from '../server/api/auth/signin/credentials.post'
import signoutHandler from '../server/api/auth/signout.post'
import { createAppToken } from '../server/utils/auth'
import { createLoginToken } from '../server/utils/authStore'
import {
  decodeBrowserSessionToken,
  isSecureSessionCookieRequest,
  signBrowserSessionToken,
} from '../server/utils/sessionJwt'
import {
  buildSessionCookieHeader,
  createSqliteD1Database,
  createTestEvent,
  seedTestUser,
  TEST_AUTH_SECRET,
} from './helpers/test-runtime'

function base64Url(input: Buffer | Uint8Array | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function createLegacyNextAuthJwe(secret: string, payload: Record<string, unknown>): Promise<string> {
  const key = Buffer.from(await hkdf('sha256', secret, '', 'NextAuth.js Generated Encryption Key', 32))
  const protectedHeader = base64Url(JSON.stringify({ alg: 'dir', enc: 'A256GCM' }))
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(protectedHeader, 'ascii'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${protectedHeader}..${base64Url(iv)}.${base64Url(ciphertext)}.${base64Url(authTag)}`
}

describe('clean H3 session & JWT auth', () => {
  it('signs and verifies HS256 browser session JWTs and decrypts legacy NextAuth v4 JWE cookies', async () => {
    const token = await signBrowserSessionToken(TEST_AUTH_SECRET, {
      userId: 'user-1',
      email: 'alice@example.com',
      role: 'user',
    })
    const decoded = await decodeBrowserSessionToken(TEST_AUTH_SECRET, token)
    expect(decoded?.userId).toBe('user-1')
    expect(decoded?.email).toBe('alice@example.com')

    const legacyJwe = await createLegacyNextAuthJwe(TEST_AUTH_SECRET, {
      sub: 'legacy-user-42',
      userId: 'legacy-user-42',
      email: 'legacy@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const decodedLegacy = await decodeBrowserSessionToken(TEST_AUTH_SECRET, legacyJwe)
    expect(decodedLegacy?.userId).toBe('legacy-user-42')
    expect(decodedLegacy?.email).toBe('legacy@example.com')
  })

  it('rejects App JWT tokens at the browser session boundary', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, { email: 'app-user@example.com' })
    const event = createTestEvent({ db })
    const appToken = await createAppToken(event, user.id, { grantType: 'short' })

    const decodedAsSession = await decodeBrowserSessionToken(TEST_AUTH_SECRET, appToken)
    expect(decodedAsSession).toBeNull()

    const sessionEvent = createTestEvent({
      db,
      url: '/api/auth/session',
      headers: {
        cookie: `__Secure-next-auth.session-token=${appToken}`,
      },
    })
    const session = await sessionHandler(sessionEvent)
    expect(session).toEqual({})
  })

  it('honors x-forwarded-proto for secure cookie detection', () => {
    const httpsEvent = createTestEvent({ headers: { 'x-forwarded-proto': 'https' } })
    const httpEvent = createTestEvent({ headers: { 'x-forwarded-proto': 'http' } })
    expect(isSecureSessionCookieRequest(httpsEvent)).toBe(true)
    expect(isSecureSessionCookieRequest(httpEvent)).toBe(false)
  })

  it('supports csrf, providers, login-token credentials sign-in, session lookup, and sign-out', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, {
      email: 'bob@example.com',
      name: 'Bob',
    })

    const csrfRes = await csrfHandler(createTestEvent({ db, url: '/api/auth/csrf' }))
    expect(typeof csrfRes.csrfToken).toBe('string')
    expect(csrfRes.csrfToken.length).toBeGreaterThan(10)

    const providersRes = await providersHandler(createTestEvent({ db, url: '/api/auth/providers' }))
    expect(providersRes.credentials).toBeDefined()

    const loginToken = await createLoginToken(createTestEvent({ db }), user.id, 'passkey', 5 * 60 * 1000)
    const signInEvent = createTestEvent({
      db,
      method: 'POST',
      url: '/api/auth/signin/credentials',
      body: { loginToken },
    })
    const signInRes = await credentialsHandler(signInEvent)
    expect(signInRes.ok).toBe(true)
    expect(signInRes.user.id).toBe(user.id)
    const setCookies = signInEvent.node.res.getHeader('set-cookie')
    expect(String(setCookies)).toContain('__Secure-next-auth.session-token=')
    expect(String(setCookies)).toContain('nexus_session_hint=1')

    const cookieHeader = await buildSessionCookieHeader({ userId: user.id, email: user.email })
    const sessionRes = await sessionHandler(createTestEvent({
      db,
      url: '/api/auth/session',
      headers: { cookie: cookieHeader },
    }))
    expect((sessionRes as any).user?.id).toBe(user.id)
    expect((sessionRes as any).user?.email).toBe('bob@example.com')

    const signOutEvent = createTestEvent({
      db,
      method: 'POST',
      url: '/api/auth/signout',
      headers: { cookie: cookieHeader },
    })
    const signOutRes = await signoutHandler(signOutEvent)
    expect(signOutRes.ok).toBe(true)
    expect(String(signOutEvent.node.res.getHeader('set-cookie'))).toContain('Max-Age=0')
  })
})
