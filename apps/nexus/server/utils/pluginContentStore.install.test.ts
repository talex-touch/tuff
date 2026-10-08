import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Installing a shared content package against real SQLite: one statement, counted only when readable. */

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
}))

let store: typeof import('./pluginContentStore')
let d1: SqliteD1Database
let db: ReturnType<typeof countingDb>
let roundTrips = 0

function countingDb() {
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
  return {
    prepare: (sql: string) => wrap(d1.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return d1.batch(statements)
    },
  }
}

// One binding for the whole test, as an isolate has: the schema record is read once per binding.
function eventFor() {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

async function publish(visibility: 'public' | 'unlisted' | 'team' | 'private', status: 'published' | 'draft') {
  return await store.createPluginContentPackage(eventFor(), {
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    title: `${visibility} ${status}`,
    schemaVersion: 1,
    visibility,
    status,
    manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
    contentInline: { snippets: [] },
  }, 'user-1')
}

function installCount(id: string): number {
  return Number((d1.sqlite.prepare('SELECT install_count FROM store_plugin_content_packages WHERE id = ?').get(id) as { install_count: number }).install_count)
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./pluginContentStore')
  d1 = createSqliteD1()
  db = countingDb()
  roundTrips = 0
})

afterEach(() => {
  d1.close()
})

describe('installPluginContentPackage', () => {
  it('counts a readable package and returns it in one round trip', async () => {
    const item = await publish('unlisted', 'published')
    roundTrips = 0

    const installed = await store.installPluginContentPackage(eventFor(), item.id)

    expect(installed).toMatchObject({ id: item.id, installCount: 1, title: 'unlisted published' })
    expect(roundTrips).toBe(1)
    expect(installCount(item.id)).toBe(1)
  })

  it.each([
    ['a draft', 'public', 'draft'],
    ['a team package', 'team', 'published'],
    ['a private package', 'private', 'published'],
  ] as const)('neither counts nor returns %s', async (_name, visibility, status) => {
    const item = await publish(visibility, status)

    await expect(store.installPluginContentPackage(eventFor(), item.id)).resolves.toBeNull()
    expect(installCount(item.id)).toBe(0)
  })

  it('returns null for a package that does not exist', async () => {
    await expect(store.installPluginContentPackage(eventFor(), 'missing')).resolves.toBeNull()
  })
})
