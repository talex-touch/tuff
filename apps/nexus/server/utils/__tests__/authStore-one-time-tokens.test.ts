import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

/** One-time credentials against real SQLite: each is consumed by a single statement, exactly once. */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function createEvent() {
  return { context: { cloudflare: { env: { DB: sqlite } } }, node: { req: { headers: {} } } } as any
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(createEvent(), 'warm')
  sqlite.sqlite.prepare(`INSERT INTO auth_users (id, email, status, created_at) VALUES ('u1', 'u1@x.test', 'active', ?)`).run(new Date().toISOString())
})

describe('consumeLoginToken', () => {
  it('returns the token\'s user once, and only once under concurrency', async () => {
    const token = await store.createLoginToken(createEvent(), 'u1', 'passkey', 60_000)
    const results = await Promise.all([
      store.consumeLoginToken(createEvent(), token, 'passkey'),
      store.consumeLoginToken(createEvent(), token, 'passkey'),
    ])
    expect(results.filter(Boolean).map(user => user!.id)).toEqual(['u1'])
    expect(await store.consumeLoginToken(createEvent(), token, 'passkey')).toBeNull()
  })

  it('leaves the token in place for the wrong reason or once expired', async () => {
    const token = await store.createLoginToken(createEvent(), 'u1', 'passkey', 60_000)
    expect(await store.consumeLoginToken(createEvent(), token, 'email')).toBeNull()
    expect((await store.consumeLoginToken(createEvent(), token))?.id).toBe('u1')

    const expired = await store.createLoginToken(createEvent(), 'u1', null, 60_000)
    sqlite.sqlite.prepare('UPDATE auth_login_tokens SET expires_at = ? WHERE token = ?').run(new Date(Date.now() - 1).toISOString(), expired)
    expect(await store.consumeLoginToken(createEvent(), expired)).toBeNull()
    expect(sqlite.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_login_tokens WHERE token = ?').get(expired)).toEqual({ n: 1 })
  })
})

describe('consumeWebAuthnChallenge', () => {
  it('accepts a challenge once, for its own type', async () => {
    const challenge = await store.createWebAuthnChallenge(createEvent(), { userId: 'u1', type: 'login', ttlMs: 60_000 })
    expect(await store.consumeWebAuthnChallenge(createEvent(), challenge, 'register')).toBeNull()
    const results = await Promise.all([
      store.consumeWebAuthnChallenge(createEvent(), challenge, 'login'),
      store.consumeWebAuthnChallenge(createEvent(), challenge, 'login'),
    ])
    expect(results.filter(Boolean)).toEqual([{ userId: 'u1' }])
  })
})

describe('consumeOAuthCode', () => {
  it('consumes only for its own client and redirect, and only once', async () => {
    const { code } = await store.createOAuthCode(createEvent(), { clientId: 'client-a', userId: 'u1', redirectUri: 'https://a.test/cb', ttlMs: 60_000 })
    const request = { code, clientId: 'client-a', redirectUri: 'https://a.test/cb' }

    expect(await store.consumeOAuthCode(createEvent(), { ...request, clientId: 'client-b' })).toBeNull()
    expect(await store.consumeOAuthCode(createEvent(), { ...request, redirectUri: 'https://evil.test/cb' })).toBeNull()

    const results = await Promise.all([store.consumeOAuthCode(createEvent(), request), store.consumeOAuthCode(createEvent(), request)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.find(Boolean)).toMatchObject({ userId: 'u1', clientId: 'client-a' })
  })
})
