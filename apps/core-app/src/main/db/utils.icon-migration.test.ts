import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'
import { createDbUtils, type CoreDatabase, type DbUtils } from './utils'

/**
 * Real-SQLite contract for the bounded legacy file-icon migration queries.
 *
 * The migration service must never materialize a legacy value it cannot afford and must never
 * clobber a value that changed since it was read, so these tests exercise the actual SQL predicate
 * (`files.type` + the `icon` key + "still a PNG data URL") and the compare-and-update against a
 * real libsql database rather than a mock that would forward anything.
 */

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGNgYPj/n5H5/38Gdsb//zlY/v8HAEBuCBGhphy2AAAAAElFTkSuQmCC'

/** A legacy icon value is a PNG data URL; `padding` only exists to make lengths distinct. */
function legacyIconValue(padding = ''): string {
  return `data:image/png;base64,${PNG_BASE64}${padding}`
}

async function makeDb(): Promise<{ client: Client; db: CoreDatabase }> {
  const client = createClient({ url: ':memory:' })
  await client.execute(`CREATE TABLE files (
    id integer PRIMARY KEY AUTOINCREMENT,
    path text NOT NULL UNIQUE,
    name text NOT NULL,
    display_name text,
    extension text,
    size integer,
    mtime integer NOT NULL,
    ctime integer NOT NULL,
    last_indexed_at integer NOT NULL DEFAULT 0,
    is_dir integer NOT NULL DEFAULT 0,
    type text NOT NULL DEFAULT 'file',
    content text,
    embedding_status text NOT NULL DEFAULT 'none'
  )`)
  await client.execute(`CREATE TABLE file_extensions (
    file_id integer NOT NULL,
    key text NOT NULL,
    value text,
    PRIMARY KEY (file_id, key)
  )`)
  return { client, db: drizzle(client, { schema }) }
}

async function seedFile(
  client: Client,
  row: { id: number; type?: string; icon?: string | null; iconKey?: string }
): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO files (id, path, name, type, mtime, ctime) VALUES (?, ?, ?, ?, 0, 0)',
    args: [row.id, `/tmp/file-${row.id}.bin`, `file-${row.id}.bin`, row.type ?? 'file']
  })
  if (row.iconKey === undefined && row.icon === undefined) return
  await client.execute({
    sql: 'INSERT INTO file_extensions (file_id, key, value) VALUES (?, ?, ?)',
    args: [row.id, row.iconKey ?? 'icon', row.icon ?? null]
  })
}

function iconValue(rows: Array<{ key: string; value: string | null }>): string | null {
  return rows.find((row) => row.key === 'icon')?.value ?? null
}

describe('dbUtils legacy file-icon migration queries', () => {
  let dbUtils: DbUtils
  let client: Client

  async function setup(): Promise<void> {
    const main = await makeDb()
    client = main.client
    dbUtils = createDbUtils(main.db)
  }

  it('pages only ordinary file rows whose icon is still a PNG data URL', async () => {
    await setup()
    const legacy = legacyIconValue()
    await seedFile(client, { id: 1, icon: legacy })
    // Already migrated: the value is a path, so it must never re-enter the conversion set.
    await seedFile(client, { id: 2, icon: '/Users/x/Library/Caches/tuff/file-icons/a.png' })
    // Non-file rows keep their data-URL icons (app hydration writes them elsewhere).
    await seedFile(client, { id: 3, type: 'app', icon: legacy })
    // Same value under a different extension key is not a file icon.
    await seedFile(client, { id: 4, iconKey: 'bundleId', icon: legacy })
    // A missing value is not a data URL.
    await seedFile(client, { id: 5, icon: null })

    expect(await dbUtils.getLegacyFileIconPage(0, 32)).toEqual([
      { fileId: 1, valueLength: legacy.length }
    ])
  })

  it('walks a strict ascending keyset without gaps, repeats, or a page past the limit', async () => {
    await setup()
    const values = new Map<number, string>()
    for (const id of [1, 3, 5, 7, 9]) {
      const value = legacyIconValue('A'.repeat(id))
      values.set(id, value)
      await seedFile(client, { id, icon: value })
    }

    const first = await dbUtils.getLegacyFileIconPage(0, 2)
    const second = await dbUtils.getLegacyFileIconPage(first[first.length - 1]!.fileId, 2)
    const third = await dbUtils.getLegacyFileIconPage(second[second.length - 1]!.fileId, 2)
    const fourth = await dbUtils.getLegacyFileIconPage(third[third.length - 1]!.fileId, 2)

    expect([...first, ...second, ...third].map((row) => row.fileId)).toEqual([1, 3, 5, 7, 9])
    expect(fourth).toEqual([])
    for (const row of [...first, ...second, ...third]) {
      // Length is metadata only: the page must report it without materializing the value.
      expect(row.valueLength).toBe(values.get(row.fileId)!.length)
    }
  })

  it('reads a legacy value only within the byte bound and returns null over it', async () => {
    await setup()
    const legacy = legacyIconValue()
    await seedFile(client, { id: 1, icon: legacy })
    await seedFile(client, { id: 2, icon: '/cache/file-icons/migrated.png' })

    expect(await dbUtils.getLegacyFileIconValue(1, legacy.length)).toBe(legacy)
    expect(await dbUtils.getLegacyFileIconValue(1, legacy.length - 1)).toBeNull()
    expect(await dbUtils.getLegacyFileIconValue(2, 4096)).toBeNull()
    expect(await dbUtils.getLegacyFileIconValue(999, 4096)).toBeNull()
  })

  it('compare-and-updates only while the read value is still the stored value', async () => {
    await setup()
    const legacy = legacyIconValue()
    await seedFile(client, { id: 1, icon: legacy })
    await seedFile(client, { id: 2, icon: legacy, iconKey: 'bundleId' })
    await seedFile(client, { id: 3, icon: legacy })

    const iconPath = '/Users/x/Library/Caches/tuff/file-icons/0123.png'
    expect(await dbUtils.replaceFileIconValue(1, legacy, iconPath)).toBe(true)
    expect(iconValue(await dbUtils.getFileExtensions(1))).toBe(iconPath)
    // The converted row stops matching the migration predicate.
    expect((await dbUtils.getLegacyFileIconPage(0, 32)).map((row) => row.fileId)).toEqual([3])

    // A concurrent lazy write changed the value after it was read: the compare-update must lose
    // and leave the newer value intact.
    const concurrent = '/cache/file-icons/lazy.png'
    expect(await dbUtils.replaceFileIconValue(1, legacy, '/cache/file-icons/stale.png')).toBe(false)
    expect(iconValue(await dbUtils.getFileExtensions(1))).toBe(iconPath)

    // Another key holding the same string is not the file's icon.
    expect(await dbUtils.replaceFileIconValue(2, legacy, concurrent)).toBe(false)
    expect((await dbUtils.getFileExtensions(2)).find((row) => row.key === 'bundleId')?.value).toBe(
      legacy
    )

    // A row whose value was replaced concurrently keeps the concurrent value.
    expect(await dbUtils.replaceFileIconValue(3, '/cache/file-icons/gone.png', iconPath)).toBe(
      false
    )
    expect(iconValue(await dbUtils.getFileExtensions(3))).toBe(legacy)
  })
})
