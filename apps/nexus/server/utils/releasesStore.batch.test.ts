import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Release lookups against real SQLite: a release with its assets in one round trip. */

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
}))

let store: typeof import('./releasesStore')
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

function insertRelease(tag: string, channel: string, status: string, publishedAt: string | null, assets: Array<[string, string]>) {
  const at = '2026-10-01T00:00:00.000Z'
  d1.sqlite.prepare(`
    INSERT INTO app_releases (id, tag, name, channel, version, notes, status, published_at, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, 'admin', ?, ?)
  `).run(`release-${tag}`, tag, tag, channel, tag, status, publishedAt, at, at)
  for (const [platform, arch] of assets) {
    d1.sqlite.prepare(`
      INSERT INTO app_release_assets (id, release_id, platform, arch, filename, download_url, size, content_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'https://example.com/file', 10, 'application/octet-stream', ?, ?)
    `).run(`asset-${tag}-${platform}-${arch}`, `release-${tag}`, platform, arch, `${tag}-${platform}-${arch}`, at, at)
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./releasesStore')
  d1 = createSqliteD1()
  // Creates the release tables.
  await store.getReleaseByTag(eventFor(), 'warm-up')
  insertRelease('v1.0.0', 'RELEASE', 'published', '2026-09-01T00:00:00.000Z', [['darwin', 'arm64'], ['win32', 'x64']])
  insertRelease('v1.1.0', 'RELEASE', 'published', '2026-10-01T00:00:00.000Z', [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64']])
  insertRelease('v1.2.0', 'RELEASE', 'draft', null, [['darwin', 'arm64']])
  insertRelease('v2.0.0-beta', 'BETA', 'published', '2026-10-05T00:00:00.000Z', [['linux', 'x64']])
})

afterEach(() => {
  d1.close()
})

describe('getLatestRelease', () => {
  it('answers with the newest published release of the channel and its assets, in one round trip', async () => {
    const counting = countingD1(d1)
    await store.getReleaseByTag(eventFor(counting.db), 'warm-up') // reads the schema record
    const before = counting.roundTrips()

    const release = await store.getLatestRelease(eventFor(counting.db), 'RELEASE')

    expect(counting.roundTrips() - before).toBe(1)
    expect(release?.tag).toBe('v1.1.0')
    expect(release?.assets?.map(asset => `${asset.platform}/${asset.arch}`)).toEqual(['darwin/arm64', 'darwin/x64', 'win32/x64'])
  })

  it('narrows the assets to a platform, and answers null for a channel with nothing published', async () => {
    expect((await store.getLatestRelease(eventFor(), 'RELEASE', 'darwin' as any))?.assets?.map(asset => asset.arch)).toEqual(['arm64', 'x64'])
    expect((await store.getLatestRelease(eventFor(), 'BETA'))?.tag).toBe('v2.0.0-beta')
    expect(await store.getLatestRelease(eventFor(), 'SNAPSHOT' as any)).toBeNull()
  })
})

describe('getReleaseByTag', () => {
  it('reads a release with its assets in one round trip, and without them in one statement', async () => {
    const counting = countingD1(d1)
    await store.getReleaseByTag(eventFor(counting.db), 'warm-up')
    const before = counting.roundTrips()

    const release = await store.getReleaseByTag(eventFor(counting.db), 'v1.0.0')
    const bare = await store.getReleaseByTag(eventFor(counting.db), 'v1.0.0', false)

    expect(counting.roundTrips() - before).toBe(2)
    expect(release?.assets?.map(asset => asset.id)).toEqual(['asset-v1.0.0-darwin-arm64', 'asset-v1.0.0-win32-x64'])
    expect(bare).toMatchObject({ tag: 'v1.0.0' })
    expect(bare?.assets).toBeUndefined()
    expect(await store.getReleaseByTag(eventFor(), 'missing')).toBeNull()
  })
})

describe('listReleases', () => {
  it('reads a page of releases with their assets in one round trip', async () => {
    const counting = countingD1(d1)
    await store.getReleaseByTag(eventFor(counting.db), 'warm-up')
    const before = counting.roundTrips()

    const releases = await store.listReleases(eventFor(counting.db), { channel: 'RELEASE' as any, status: 'published' as any, includeAssets: true, limit: 2 })

    expect(counting.roundTrips() - before).toBe(1)
    expect(releases.map(release => [release.tag, release.assets?.length])).toEqual([['v1.1.0', 3], ['v1.0.0', 2]])
  })

  it('lists more releases with assets than one statement may bind parameters', async () => {
    for (let index = 0; index < 150; index += 1)
      insertRelease(`bulk-${index}`, 'SNAPSHOT', 'published', `2026-08-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`, [['linux', 'x64']])

    const releases = await store.listReleases(eventFor(), { channel: 'SNAPSHOT' as any, includeAssets: true })

    expect(releases).toHaveLength(150)
    expect(releases.every(release => release.assets?.length === 1)).toBe(true)
  })
})
