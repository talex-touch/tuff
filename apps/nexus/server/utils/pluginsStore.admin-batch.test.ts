import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * The admin writes on a plugin against real SQLite: a status change and a deletion each read once and
 * write once, whatever the number of versions, and the write is one transaction.
 */

const storage = vi.hoisted(() => ({
  deletePluginPackage: vi.fn(async (_event: unknown, _key: string, _options?: unknown) => {}),
  uploadPluginPackage: vi.fn(),
  deleteImage: vi.fn(async (_event: unknown, _key: string) => {}),
  uploadImageFromBuffer: vi.fn(),
}))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
}))
vi.mock('./pluginPackageStorage', () => ({
  deletePluginPackage: storage.deletePluginPackage,
  uploadPluginPackage: storage.uploadPluginPackage,
}))
vi.mock('./imageStorage', () => ({
  deleteImage: storage.deleteImage,
  uploadImageFromBuffer: storage.uploadImageFromBuffer,
}))

let store: typeof import('./pluginsStore')
let d1: SqliteD1Database
let roundTrips = 0
let db: ReturnType<typeof countingDb>

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

function eventFor() {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

const AT = '2026-10-01T00:00:00.000Z'

function seed(versionCount: number) {
  d1.sqlite.prepare(`
    INSERT INTO dashboard_plugins (id, user_id, name, summary, category, badges, slug, status, icon_key, created_at, updated_at, latest_version_id)
    VALUES ('plugin-1', 'owner-1', 'Focus', 'Focus summary', 'utilities', '[]', 'focus', 'approved', 'plugin-icon', ?, ?, 'v-0')
  `).run(AT, AT)
  for (let index = 0; index < versionCount; index += 1) {
    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugin_versions (
        id, plugin_id, created_by, channel, version, signature, artifact_sha256,
        publisher_signature, publisher_key, publisher_key_id, publisher_verified_at, nexus_attestation,
        admission_status, policy_decision, artifact_state, package_key, package_url, package_size,
        icon_key, icon_url, status, security_scan_decision, created_at, updated_at
      ) VALUES (?, 'plugin-1', 'owner-1', 'RELEASE', ?, 'sig', ?, ?, ?, 'key-1', ?, ?, 'eligible', 'passed', 'available',
        ?, ?, 10, ?, '/icon', 'approved', 'passed', ?, ?)
    `).run(
      `v-${index}`,
      `1.${index}.0`,
      'a'.repeat(64),
      JSON.stringify({ payload: { policyVersion: 'v1' } }),
      JSON.stringify({ keyId: 'key-1' }),
      AT,
      JSON.stringify({ issuer: 'nexus' }),
      `pkg-${index}.tpex`,
      `/api/plugins/assets/pkg-${index}.tpex`,
      `icon-${index}`,
      `2026-10-0${1 + (index % 9)}T00:00:00.000Z`,
      AT,
    )
  }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  store = await import('./pluginsStore')
  d1 = createSqliteD1()
  db = countingDb()
  // Creates the plugin tables, and reads the schema record once, as a warm isolate has.
  await store.getPluginBySlug(eventFor(), 'warm-up')
  roundTrips = 0
})

afterEach(() => {
  d1.close()
})

describe('setPluginStatus', () => {
  it('re-evaluates every version, the latest version and the timeline in one read and one write', async () => {
    seed(12)

    const updated = await store.setPluginStatus(eventFor(), 'plugin-1', 'rejected', { actorId: 'admin-1', actorRole: 'admin', reason: 'policy' })

    expect(roundTrips).toBe(2)
    expect(updated).toMatchObject({ id: 'plugin-1', status: 'rejected', latestVersionId: null })
    const plugin = d1.sqlite.prepare(`SELECT status, latest_version_id FROM dashboard_plugins WHERE id = 'plugin-1'`).get()
    expect(plugin).toEqual({ status: 'rejected', latest_version_id: null })
    const versions = d1.sqlite.prepare(`SELECT eligibility_revision, eligibility_reasons FROM dashboard_plugin_versions`).all() as Array<{ eligibility_revision: number, eligibility_reasons: string }>
    expect(versions).toHaveLength(12)
    for (const version of versions) {
      expect(version.eligibility_revision).toBe(1)
      expect(JSON.parse(version.eligibility_reasons)).toEqual(['PLUGIN_ELIGIBILITY_PLUGIN_REVIEW_REQUIRED'])
    }
    const timeline = d1.sqlite.prepare(`SELECT event_type, actor_id, actor_role, from_status, to_status, reason, meta FROM dashboard_plugin_timeline`).all() as Array<Record<string, string>>
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ event_type: 'plugin.status.changed', actor_id: 'admin-1', actor_role: 'admin', from_status: 'approved', to_status: 'rejected', reason: 'policy' })
    expect(JSON.parse(timeline[0]!.meta!).eligibilityRevisions).toHaveLength(12)
  })

  it('picks the latest eligible version when a plugin is approved', async () => {
    seed(3)
    d1.sqlite.prepare(`UPDATE dashboard_plugins SET status = 'pending', latest_version_id = NULL`).run()

    const updated = await store.setPluginStatus(eventFor(), 'plugin-1', 'approved')

    expect(updated.latestVersionId).toBe('v-2')
    expect(d1.sqlite.prepare(`SELECT latest_version_id FROM dashboard_plugins`).get()).toEqual({ latest_version_id: 'v-2' })
  })

  it('reads once and writes nothing when the status is already set', async () => {
    seed(2)

    const unchanged = await store.setPluginStatus(eventFor(), 'plugin-1', 'approved')

    expect(unchanged.status).toBe('approved')
    expect(roundTrips).toBe(1)
    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM dashboard_plugin_timeline`).get()).toEqual({ n: 0 })
  })

  it('changes nothing when part of the write fails', async () => {
    seed(2)
    d1.sqlite.exec(`DROP TABLE dashboard_plugin_timeline`)

    await expect(store.setPluginStatus(eventFor(), 'plugin-1', 'rejected')).rejects.toThrow()

    expect(d1.sqlite.prepare(`SELECT status FROM dashboard_plugins`).get()).toEqual({ status: 'approved' })
    expect(d1.sqlite.prepare(`SELECT MAX(eligibility_revision) AS r FROM dashboard_plugin_versions`).get()).toEqual({ r: 0 })
  })

  it('answers 404 for a plugin that does not exist', async () => {
    await expect(store.setPluginStatus(eventFor(), 'missing', 'approved')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deletePlugin', () => {
  it('reads once, deletes every stored object, and removes the rows in one write', async () => {
    seed(5)
    d1.sqlite.prepare(`INSERT INTO dashboard_plugin_timeline (id, plugin_id, event_type, actor_role, created_at) VALUES ('t-1', 'plugin-1', 'plugin.created', 'owner', ?)`).run(AT)

    const deleted = await store.deletePlugin(eventFor(), 'plugin-1')

    expect(deleted.id).toBe('plugin-1')
    expect(roundTrips).toBe(2)
    expect(storage.deletePluginPackage.mock.calls.map(call => call[1]).sort()).toEqual(['pkg-0.tpex', 'pkg-1.tpex', 'pkg-2.tpex', 'pkg-3.tpex', 'pkg-4.tpex'])
    expect(storage.deleteImage.mock.calls.map(call => call[1]).sort()).toEqual(['icon-0', 'icon-1', 'icon-2', 'icon-3', 'icon-4', 'plugin-icon'])
    for (const table of ['dashboard_plugins', 'dashboard_plugin_versions', 'dashboard_plugin_timeline'])
      expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get(), table).toEqual({ n: 0 })
  })

  it('answers 404 without touching storage for a plugin that does not exist', async () => {
    await expect(store.deletePlugin(eventFor(), 'missing')).rejects.toMatchObject({ statusCode: 404 })
    expect(storage.deletePluginPackage).not.toHaveBeenCalled()
  })
})

describe('install counters', () => {
  it('counts an install and an uninstall in one round trip each', async () => {
    seed(1)

    await expect(store.incrementPluginInstalls(eventFor(), 'plugin-1')).resolves.toBe(1)
    await expect(store.incrementPluginInstalls(eventFor(), 'plugin-1')).resolves.toBe(2)
    await expect(store.decrementPluginInstalls(eventFor(), 'plugin-1')).resolves.toBe(1)
    expect(roundTrips).toBe(3)
  })

  it('never counts below zero', async () => {
    seed(1)

    await expect(store.decrementPluginInstalls(eventFor(), 'plugin-1')).resolves.toBe(0)
  })
})
