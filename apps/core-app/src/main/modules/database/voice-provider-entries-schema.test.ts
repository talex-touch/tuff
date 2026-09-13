/**
 * Schema parity for `voice_provider_entries` (2026-09-13).
 *
 * A stored `voice-provider` catalog pack is projected into this table and read back to rebuild the
 * active pack from SQLite alone (see `catalog-repository.ts`). The table has exactly ONE creator:
 * the hand-written `0046_voice_provider_entries.sql` migration. There is no aux DDL and no second
 * home, so the divergence this test pins is migration-vs-schema, not primary-vs-aux.
 *
 * The column contract is read from a database migrated through the real `_journal.json` chain and
 * compared against the Drizzle table definition in `schema.ts`. A migration written but never
 * journaled therefore fails as a missing table rather than as a silent no-op, and a renamed or
 * dropped column fails as a column-name mismatch.
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { getTableColumns } from 'drizzle-orm'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { voiceProviderEntries } from '../../db/schema'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

const TABLE = 'voice_provider_entries'
const PACK_INDEX = 'idx_voice_provider_entries_pack'
const PRIMARY_KEY_COLUMNS = ['pack_type', 'pack_id', 'pack_version', 'provider_id']

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
}

interface IndexInfo {
  name: string
  columns: string[]
}

async function applyMigrationFile(client: Client, fileName: string): Promise<void> {
  const sql = await readFile(join(migrationsFolder, fileName), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

async function applyFullChain(client: Client): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as { entries: Array<{ tag: string }> }
  for (const entry of journal.entries) {
    await applyMigrationFile(client, `${entry.tag}.sql`)
  }
}

async function readColumns(client: Client): Promise<ColumnInfo[]> {
  const result = await client.execute(
    `SELECT name, type, "notnull", pk FROM pragma_table_info('${TABLE}')`
  )
  return (result.rows as unknown as ColumnInfo[]).map((row) => ({
    name: String(row.name),
    type: String(row.type).toLowerCase(),
    notnull: Number(row.notnull),
    pk: Number(row.pk)
  }))
}

async function readIndex(client: Client, name: string): Promise<IndexInfo | null> {
  const list = await client.execute(
    `SELECT name FROM pragma_index_list('${TABLE}') WHERE name = '${name}'`
  )
  if (list.rows.length === 0) return null

  const info = await client.execute(`SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`)
  return {
    name,
    columns: (info.rows as unknown as Array<{ name: string }>).map((column) => String(column.name))
  }
}

/** Drizzle column type discriminator → the SQLite declared type the DDL must use. */
const SQLITE_TYPE_BY_COLUMN_TYPE: Record<string, string> = {
  SQLiteText: 'text',
  SQLiteInteger: 'integer'
}

describe(`${TABLE} schema`, () => {
  let directory: string
  let client: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-voice-provider-entries-schema-'))
    client = createClient({ url: `file:${join(directory, 'chain.db')}` })
    await applyFullChain(client)
  })

  afterEach(async () => {
    client?.close()
    client = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('materializes every column declared by the Drizzle table after the full journaled chain', async () => {
    const columns = await readColumns(client!)
    const declared = Object.values(getTableColumns(voiceProviderEntries))

    expect(columns.map((column) => column.name)).toEqual(declared.map((column) => column.name))
    expect(columns.map((column) => column.type)).toEqual(
      declared.map((column) => SQLITE_TYPE_BY_COLUMN_TYPE[String(column.columnType)])
    )
    expect(columns.filter((column) => column.notnull === 1).map((column) => column.name)).toEqual(
      declared.filter((column) => column.notNull).map((column) => column.name)
    )
  })

  it('keys rows by the full pack/provider tuple so pack replacement can conflict on it', async () => {
    const columns = await readColumns(client!)
    expect(columns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(
      PRIMARY_KEY_COLUMNS
    )
  })

  it('cascades deletes from catalog_packs through the pack columns', async () => {
    const foreignKeys = await client!.execute(`PRAGMA foreign_key_list('${TABLE}')`)
    const edges = (
      foreignKeys.rows as unknown as Array<{
        table: string
        from: string
        to: string
        on_delete: string
      }>
    )
      .sort((left, right) => left.from.localeCompare(right.from))
      .map((row) => ({ table: row.table, from: row.from, to: row.to, onDelete: row.on_delete }))

    expect(edges).toEqual([
      { table: 'catalog_packs', from: 'pack_id', to: 'pack_id', onDelete: 'CASCADE' },
      { table: 'catalog_packs', from: 'pack_type', to: 'type', onDelete: 'CASCADE' },
      { table: 'catalog_packs', from: 'pack_version', to: 'version', onDelete: 'CASCADE' }
    ])
  })

  it('serves pack lookups through the pack index', async () => {
    expect(await readIndex(client!, PACK_INDEX)).toEqual({
      name: PACK_INDEX,
      columns: ['pack_type', 'pack_id', 'pack_version']
    })
  })
})
