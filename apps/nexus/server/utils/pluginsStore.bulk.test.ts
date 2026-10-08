import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Plugins looked up by slug against real SQLite: many at once, as each alone, in one round trip. */

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
}))

let store: typeof import('./pluginsStore')
let d1: SqliteD1Database

function eventFor(db: unknown = d1) {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

/** Counts round trips: one per statement run on its own, one per batch. */
function countingD1(inner: SqliteD1Database) {
  let roundTrips = 0
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return inner.batch(statements)
    },
  }
  return { db, roundTrips: () => roundTrips }
}

function insertPlugin(slug: string, status: string, versions: Array<{ id: string, version: string, createdAt: string }>) {
  const at = '2026-10-01T00:00:00.000Z'
  d1.sqlite.prepare(`
    INSERT INTO dashboard_plugins (id, user_id, name, summary, category, badges, slug, status, created_at, updated_at)
    VALUES (?, 'owner-1', ?, 'summary', 'utilities', '[]', ?, ?, ?, ?)
  `).run(`plugin-${slug}`, slug, slug, status, at, at)
  for (const version of versions) {
    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugin_versions (
        id, plugin_id, created_by, channel, version, signature, package_key, package_url, package_size, icon_key, icon_url, status, created_at, updated_at
      ) VALUES (?, ?, 'owner-1', 'RELEASE', ?, 'sig', 'pkg', '/pkg', 10, 'icon', '/icon', 'approved', ?, ?)
    `).run(version.id, `plugin-${slug}`, version.version, version.createdAt, version.createdAt)
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./pluginsStore')
  d1 = createSqliteD1()
  // Creates the plugin tables.
  await store.getPluginBySlug(eventFor(), 'warm-up')
  insertPlugin('alpha', 'approved', [
    { id: 'alpha-1', version: '1.0.0', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'alpha-2', version: '1.1.0', createdAt: '2026-10-02T00:00:00.000Z' },
  ])
  insertPlugin('beta', 'draft', [{ id: 'beta-1', version: '0.1.0', createdAt: '2026-10-01T00:00:00.000Z' }])
  insertPlugin('gamma', 'approved', [])
})

afterEach(() => {
  d1.close()
})

describe('getPluginsBySlugs', () => {
  it.each([
    ['an admin view with versions', { includeVersions: true, viewerIsAdmin: true }],
    ['the store', { forStore: true }],
    ['a bare lookup', {}],
  ])('answers for %s exactly as one lookup per slug does', async (_label, options) => {
    const slugs = ['alpha', 'beta', 'gamma', 'missing', 'alpha']

    const many = await store.getPluginsBySlugs(eventFor(), slugs, options)

    for (const slug of slugs)
      expect(many.get(slug)).toEqual(await store.getPluginBySlug(eventFor(), slug, options))
    expect([...many.keys()]).toEqual(['alpha', 'beta', 'gamma', 'missing'])
  })

  it('reads any number of plugins with their versions in one round trip', async () => {
    const counting = countingD1(d1)
    await store.getPluginBySlug(eventFor(counting.db), 'warm-up') // reads the schema record
    const before = counting.roundTrips()

    const many = await store.getPluginsBySlugs(eventFor(counting.db), ['alpha', 'beta', 'gamma'], { includeVersions: true, viewerIsAdmin: true })

    expect(counting.roundTrips() - before).toBe(1)
    expect(many.get('alpha')?.versions?.map(version => version.id)).toEqual(['alpha-2', 'alpha-1'])
  })

  it('takes more slugs than one statement may bind parameters', async () => {
    for (let index = 0; index < 150; index += 1)
      insertPlugin(`bulk-${index}`, 'approved', [])
    const slugs = Array.from({ length: 150 }, (_, index) => `bulk-${index}`)

    const many = await store.getPluginsBySlugs(eventFor(), slugs, { includeVersions: true, viewerIsAdmin: true })

    expect([...many.values()].filter(Boolean)).toHaveLength(150)
  })
})

describe('getPluginBySlug', () => {
  it('reads a plugin and its versions in one round trip', async () => {
    const counting = countingD1(d1)
    await store.getPluginBySlug(eventFor(counting.db), 'warm-up')
    const before = counting.roundTrips()

    const plugin = await store.getPluginBySlug(eventFor(counting.db), 'alpha', { includeVersions: true, viewerIsAdmin: true })

    expect(counting.roundTrips() - before).toBe(1)
    expect(plugin?.versions).toHaveLength(2)
  })
})

describe('listPlugins', () => {
  it('reads the plugins and their versions in one round trip', async () => {
    const counting = countingD1(d1)
    await store.getPluginBySlug(eventFor(counting.db), 'warm-up')
    const before = counting.roundTrips()

    const plugins = await store.listPlugins(eventFor(counting.db), { includeVersions: true, viewerIsAdmin: true })

    expect(counting.roundTrips() - before).toBe(1)
    expect(plugins.map(plugin => [plugin.slug, plugin.versions?.length])).toEqual(expect.arrayContaining([['alpha', 2], ['beta', 1], ['gamma', 0]]))
  })

  it('lists more plugins than one statement may bind parameters', async () => {
    for (let index = 0; index < 150; index += 1)
      insertPlugin(`bulk-${index}`, 'approved', [{ id: `bulk-${index}-v`, version: '1.0.0', createdAt: '2026-10-01T00:00:00.000Z' }])

    const plugins = await store.listPlugins(eventFor(), { includeVersions: true, viewerIsAdmin: true })

    expect(plugins.filter(plugin => plugin.slug.startsWith('bulk-') && plugin.versions?.length === 1)).toHaveLength(150)
  })

  it('keeps an owner filter and a status filter in the database', async () => {
    d1.sqlite.prepare(`UPDATE dashboard_plugins SET user_id = 'owner-2' WHERE slug = 'gamma'`).run()

    expect((await store.listPlugins(eventFor(), { ownerId: 'owner-2', viewerId: 'owner-2' })).map(plugin => plugin.slug)).toEqual(['gamma'])
    expect((await store.listPlugins(eventFor(), { statuses: ['draft'], viewerIsAdmin: true })).map(plugin => plugin.slug)).toEqual(['beta'])
  })
})
