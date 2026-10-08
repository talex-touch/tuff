import type { D1Database } from '@cloudflare/workers-types'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** The provider list against real SQLite: every provider with its capabilities, in one round trip. */

let store: typeof import('./providerRegistryStore')
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
  return { db: db as unknown as D1Database, roundTrips: () => roundTrips }
}

function insertProvider(id: string, ownerScope: 'system' | 'user', capabilities: string[]) {
  const at = '2026-10-01T00:00:00.000Z'
  d1.sqlite.prepare(`
    INSERT INTO provider_registry (id, name, display_name, vendor, status, auth_type, owner_scope, owner_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'custom', 'enabled', 'none', ?, ?, 'admin', ?, ?)
  `).run(id, id, id, ownerScope, ownerScope === 'user' ? `owner_${id}` : null, at, at)
  for (const capability of capabilities) {
    d1.sqlite.prepare(`
      INSERT INTO provider_capabilities (id, provider_id, capability, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`${id}:${capability}`, id, capability, at, at)
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./providerRegistryStore')
  d1 = createSqliteD1()
  // Creates the registry tables.
  await store.listProviderRegistryEntries(eventFor())
})

afterEach(() => {
  d1.close()
})

describe('listProviderRegistryEntries', () => {
  it('lists every provider with its own capabilities in one round trip', async () => {
    insertProvider('prv_chat', 'system', ['text.chat', 'text.translate'])
    insertProvider('prv_ocr', 'system', ['vision.ocr'])
    insertProvider('prv_user', 'user', ['text.chat'])
    const counting = countingD1(d1)
    await store.listProviderRegistryEntries(eventFor(counting.db)) // reads the schema record
    const before = counting.roundTrips()

    const providers = await store.listProviderRegistryEntries(eventFor(counting.db))

    expect(counting.roundTrips() - before).toBe(1)
    expect(Object.fromEntries(providers.map(provider => [provider.id, provider.capabilities.map(capability => capability.capability)]))).toEqual({
      prv_chat: ['text.chat', 'text.translate'],
      prv_ocr: ['vision.ocr'],
      prv_user: ['text.chat'],
    })
  })

  it('applies its filter to the capabilities too', async () => {
    insertProvider('prv_system', 'system', ['text.chat'])
    insertProvider('prv_user', 'user', ['vision.ocr'])

    const providers = await store.listProviderRegistryEntries(eventFor(), { ownerScope: 'system' })

    expect(providers.map(provider => [provider.id, provider.capabilities.map(capability => capability.capability)])).toEqual([
      ['prv_system', ['text.chat']],
    ])
  })

  it('lists more providers than one statement may bind parameters', async () => {
    for (let index = 0; index < 150; index += 1)
      insertProvider(`prv_${String(index).padStart(3, '0')}`, 'user', ['text.chat'])

    const providers = await store.listProviderRegistryEntries(eventFor())

    expect(providers).toHaveLength(150)
    expect(providers.every(provider => provider.capabilities.length === 1)).toBe(true)
  })
})
