import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

/** `/api/user/me`'s account overview against real SQLite, held to the queries it replaced. */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function event() {
  return { context: { cloudflare: { env: { DB: sqlite } } }, node: { req: { headers: {} } } } as any
}

function run(sql: string, ...values: Array<string | number | null>) {
  sqlite.sqlite.prepare(sql).run(...values)
}

/** The activity query `/api/user/me` ran before, kept here as the reference. */
function legacyUpdatedAt(userId: string): string | null {
  const row = sqlite.sqlite.prepare(`
    SELECT MAX(value) AS updated_at FROM (
      SELECT created_at AS value FROM auth_users WHERE id = ?
      UNION ALL SELECT created_at AS value FROM auth_accounts WHERE user_id = ?
      UNION ALL SELECT created_at AS value FROM auth_passkeys WHERE user_id = ?
      UNION ALL SELECT last_used_at AS value FROM auth_passkeys WHERE user_id = ? AND last_used_at IS NOT NULL
    ) WHERE value IS NOT NULL
  `).get(userId, userId, userId, userId) as { updated_at: string | null }
  return row.updated_at
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(event(), 'warm')
})

describe('getUserAccountOverview', () => {
  it('counts passkeys, lists linked accounts newest first and derives the activity time the UNION used to', async () => {
    run(`INSERT INTO auth_users (id, email, role, status, created_at) VALUES ('u1', 'u1@x.test', 'user', 'active', '2026-01-01T00:00:00.000Z')`)
    run(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at) VALUES ('a1', 'u1', 'github', 'gh-1', '2026-02-01T00:00:00.000Z')`)
    run(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at) VALUES ('a2', 'u1', 'linuxdo', 'ld-1', '2026-03-01T00:00:00.000Z')`)
    run(`INSERT INTO auth_passkeys (id, user_id, credential_id, public_key, created_at, last_used_at) VALUES ('p1', 'u1', 'c1', 'k', '2026-02-15T00:00:00.000Z', '2026-04-01T00:00:00.000Z')`)
    run(`INSERT INTO auth_passkeys (id, user_id, credential_id, public_key, created_at, last_used_at) VALUES ('p2', 'u1', 'c2', 'k', '2026-02-20T00:00:00.000Z', NULL)`)

    const user = (await store.getUserById(event(), 'u1'))!
    const overview = await store.getUserAccountOverview(event(), user)

    expect(overview.passkeyCount).toBe(2)
    expect(overview.linkedAccounts).toEqual([
      { provider: 'linuxdo', providerAccountId: 'ld-1' },
      { provider: 'github', providerAccountId: 'gh-1' },
    ])
    expect(overview.updatedAt).toBe('2026-04-01T00:00:00.000Z')
    expect(overview.updatedAt).toBe(legacyUpdatedAt('u1'))
  })

  it('falls back to the user\'s creation time when nothing else exists', async () => {
    run(`INSERT INTO auth_users (id, email, role, status, created_at) VALUES ('u1', 'u1@x.test', 'user', 'active', '2026-01-01T00:00:00.000Z')`)
    const user = (await store.getUserById(event(), 'u1'))!
    const overview = await store.getUserAccountOverview(event(), user)
    expect(overview).toMatchObject({ passkeyCount: 0, linkedAccounts: [], updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(overview.updatedAt).toBe(legacyUpdatedAt('u1'))
  })

  it('reports the bootstrap state from the indexes', async () => {
    run(`INSERT INTO auth_users (id, email, role, status, created_at) VALUES ('first', 'f@x.test', 'user', 'active', '2026-01-01T00:00:00.000Z')`)
    run(`INSERT INTO auth_users (id, email, role, status, created_at) VALUES ('second', 's@x.test', 'user', 'active', '2026-01-02T00:00:00.000Z')`)
    const first = (await store.getUserById(event(), 'first'))!
    expect((await store.getUserAccountOverview(event(), first)).bootstrap).toMatchObject({
      adminExists: false,
      requiresBootstrap: true,
      isFirstUser: true,
      firstUserId: 'first',
    })

    run(`UPDATE auth_users SET role = 'admin' WHERE id = 'second'`)
    expect((await store.getUserAccountOverview(event(), first)).bootstrap).toMatchObject({ adminCount: 1, adminExists: true, requiresBootstrap: false })
  })
})

describe('auth schema role backfill', () => {
  it('lower-cases roles written before roles were normalised, so an exact match finds the admin', async () => {
    // A database whose auth tables predate this definition: drop the record and seed a mixed-case role.
    sqlite.sqlite.exec(`DELETE FROM nexus_schema_state WHERE key = 'auth'`)
    run(`INSERT INTO auth_users (id, email, role, status, created_at) VALUES ('old-admin', 'o@x.test', 'Admin', 'active', '2026-01-01T00:00:00.000Z')`)

    vi.resetModules()
    store = await import('../authStore')
    const fresh = createSqliteD1Proxy(sqlite)
    expect(await store.getAdminBootstrapState(fresh)).toMatchObject({ adminExists: true, adminCount: 1 })
    expect(sqlite.sqlite.prepare(`SELECT role FROM auth_users WHERE id = 'old-admin'`).get()).toEqual({ role: 'admin' })
  })
})

/** A new binding object over the same database: a new isolate, which re-reads the schema record. */
function createSqliteD1Proxy(inner: SqliteD1Database) {
  const binding = { prepare: (sql: string) => inner.prepare(sql), batch: (statements: any[]) => inner.batch(statements) }
  return { context: { cloudflare: { env: { DB: binding } } }, node: { req: { headers: {} } } } as any
}
