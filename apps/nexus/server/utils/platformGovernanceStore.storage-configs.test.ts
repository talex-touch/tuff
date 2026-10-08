import type { D1Database } from '@cloudflare/workers-types'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** The storage channel configs object operations read, against real SQLite: from memory, but never stale here. */

let store: typeof import('./platformGovernanceStore')
let d1: SqliteD1Database

function eventFor(db: unknown = d1) {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

/** Counts reads of the config table, and can make the next one never settle. */
function trackedD1(inner: SqliteD1Database) {
  const state = { configReads: 0, hangNext: false }
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'all' && target.sql.includes('FROM platform_governance_configs')) {
        return (...args: unknown[]) => {
          state.configReads += 1
          if (state.hangNext) {
            state.hangNext = false
            return new Promise(() => {})
          }
          return (target as any).all(...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: (statements: SqliteD1Statement[]) => inner.batch(statements),
  }
  return { db: db as unknown as D1Database, state }
}

const PROVIDERS: Record<string, string> = { r2: 'cloudflare-r2', memory: 'memory' }
const policy = (channel: string, enabled = true, targetId?: string) => ({
  configType: 'storage_channel',
  name: `${channel} policy`,
  channel,
  provider: PROVIDERS[channel],
  targetId,
  enabled,
  limits: { maxBytes: 1000 },
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  vi.resetModules()
  store = await import('./platformGovernanceStore')
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

describe('listEnabledStorageChannelConfigs', () => {
  it('reads the enabled configs once within the window', async () => {
    await store.upsertPlatformGovernanceConfig(eventFor(), policy('r2'), 'admin')
    await store.upsertPlatformGovernanceConfig(eventFor(), policy('memory', false), 'admin')
    const tracked = trackedD1(d1)

    const first = await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))
    await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))
    await store.assertStorageChannelPolicy(eventFor(tracked.db), { action: 'storage.write', channel: 'r2', unit: 'byte', quantity: 1 }).catch(() => {})

    expect(first.map(config => config.channel)).toEqual(['r2'])
    expect(tracked.state.configReads).toBe(1)
  })

  it('sees a config written through this isolate at once, and one written elsewhere after the window', async () => {
    const tracked = trackedD1(d1)
    expect(await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))).toEqual([])

    await store.upsertPlatformGovernanceConfig(eventFor(tracked.db), policy('r2'), 'admin')
    expect((await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))).map(config => config.channel)).toEqual(['r2'])

    // Another isolate's write: straight to the table.
        d1.sqlite.prepare(`UPDATE platform_governance_configs SET enabled = 0`).run()
    expect((await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))).map(config => config.channel)).toEqual(['r2'])
    vi.setSystemTime(new Date('2026-10-15T08:00:31.000Z'))
    expect(await store.listEnabledStorageChannelConfigs(eventFor(tracked.db))).toEqual([])
  })

  it('does not make other requests wait on a read that never settles', async () => {
    const tracked = trackedD1(d1)
    await store.listEnabledStorageChannelConfigs(eventFor(tracked.db)) // reads the schema record
    vi.setSystemTime(new Date('2026-10-15T08:00:31.000Z'))
    tracked.state.hangNext = true

    void store.listEnabledStorageChannelConfigs(eventFor(tracked.db))
    const settled = await Promise.race([
      store.listEnabledStorageChannelConfigs(eventFor(tracked.db)).then(() => 'answered'),
      new Promise(resolve => setTimeout(resolve, 500, 'still waiting')),
    ])

    expect(settled).toBe('answered')
  })
})
