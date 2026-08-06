/**
 * Schema parity for `recommendation_exposure_daily` (aux-homed, 2026-08-06).
 *
 * The table has TWO creators: the generated drizzle migration (primary db, and
 * the fallback home aux writes land on before the background aux init finishes)
 * and the raw `ensureAuxTables()` DDL (database-aux.db). Per
 * database-write-contracts §6 the homes must agree — a column that exists on
 * one and not the other resurfaces as a runtime `no such column` on whichever
 * home `scheduleAuxWrite` happens to resolve.
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
const databaseModuleSource = resolve(testDir, './index.ts')

const TABLE = 'recommendation_exposure_daily'

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
  /** Compared too: a default present on one home only breaks partial inserts there. */
  dflt_value: string | null
}

interface IndexInfo {
  name: string
  unique: number
  columns: string[]
}

async function readColumns(client: Client): Promise<ColumnInfo[]> {
  const result = await client.execute(
    `SELECT name, type, "notnull", pk, dflt_value FROM pragma_table_info('${TABLE}')`
  )
  return (result.rows as unknown as ColumnInfo[])
    .map((row) => ({
      name: String(row.name),
      type: String(row.type).toLowerCase(),
      notnull: Number(row.notnull),
      pk: Number(row.pk),
      dflt_value: row.dflt_value == null ? null : String(row.dflt_value)
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function readIndexes(client: Client): Promise<IndexInfo[]> {
  const list = await client.execute(`SELECT name, "unique" FROM pragma_index_list('${TABLE}')`)
  const indexes: IndexInfo[] = []

  for (const row of list.rows as unknown as Array<{ name: string; unique: number }>) {
    const name = String(row.name)
    const info = await client.execute(
      `SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`
    )
    indexes.push({
      name,
      unique: Number(row.unique),
      columns: (info.rows as unknown as Array<{ name: string }>).map((column) =>
        String(column.name)
      )
    })
  }

  return indexes.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * The aux DDL lives inline in `ensureAuxTables()`; executing the module is not
 * possible without an Electron app, so the statements are lifted from source.
 * A rename there fails this test loudly rather than silently skipping.
 */
async function extractAuxStatements(): Promise<string[]> {
  const source = await readFile(databaseModuleSource, 'utf8')
  const createMatch = source.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${TABLE} \\([\\s\\S]*?\\n {6}\\)`)
  )
  const indexMatch = source.match(new RegExp(`CREATE INDEX IF NOT EXISTS [^']*ON ${TABLE} [^']*`))

  expect(createMatch, `aux CREATE TABLE for ${TABLE} not found in database module`).not.toBeNull()
  expect(indexMatch, `aux CREATE INDEX for ${TABLE} not found in database module`).not.toBeNull()

  return [createMatch![0], indexMatch![0]]
}

async function applyMigrationFile(client: Client, fileName: string): Promise<void> {
  const sql = await readFile(join(migrationsFolder, fileName), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

describe('recommendation_exposure_daily schema parity', () => {
  let directory: string
  let primaryClient: Client | undefined
  let auxClient: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-exposure-schema-'))
  })

  afterEach(async () => {
    primaryClient?.close()
    auxClient?.close()
    primaryClient = undefined
    auxClient = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('creates an identical table on the migration home and the aux home', async () => {
    primaryClient = createClient({ url: `file:${join(directory, 'primary.db')}` })
    auxClient = createClient({ url: `file:${join(directory, 'aux.db')}` })

    await applyMigrationFile(primaryClient, '0036_recommendation_exposure_daily.sql')
    for (const statement of await extractAuxStatements()) {
      await auxClient.execute(statement)
    }

    const primaryColumns = await readColumns(primaryClient)
    const auxColumns = await readColumns(auxClient)

    expect(primaryColumns.map((column) => column.name)).toEqual([
      'clicks',
      'day',
      'impressions',
      'k',
      'surface',
      'updated_at'
    ])
    expect(primaryColumns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'day',
      'k',
      'surface'
    ])
    expect(
      Object.fromEntries(primaryColumns.map((column) => [column.name, column.dflt_value]))
    ).toEqual({
      clicks: '0',
      day: null,
      impressions: '0',
      k: null,
      surface: null,
      updated_at: "strftime('%s', 'now')"
    })
    expect(auxColumns).toEqual(primaryColumns)
    expect(await readIndexes(auxClient)).toEqual(await readIndexes(primaryClient))
  })

  it('keys the counters by day, surface and k on both homes', async () => {
    primaryClient = createClient({ url: `file:${join(directory, 'primary.db')}` })
    auxClient = createClient({ url: `file:${join(directory, 'aux.db')}` })

    await applyMigrationFile(primaryClient, '0036_recommendation_exposure_daily.sql')
    for (const statement of await extractAuxStatements()) {
      await auxClient.execute(statement)
    }

    for (const client of [primaryClient, auxClient]) {
      const insert = `INSERT INTO ${TABLE} (day, surface, k, impressions, clicks, updated_at) VALUES (1, 'core-box', 3, 1, 0, 0)`
      await client.execute(insert)
      // The upsert the exposure service relies on needs this exact conflict target.
      await client.execute(
        `${insert} ON CONFLICT (day, surface, k) DO UPDATE SET impressions = impressions + 1`
      )

      const rows = await client.execute(`SELECT day, surface, k, impressions FROM ${TABLE}`)
      expect(rows.rows).toEqual([{ day: 1, surface: 'core-box', k: 3, impressions: 2 }])
    }
  })

  it('applies cleanly on top of the full migration chain', async () => {
    primaryClient = createClient({ url: `file:${join(directory, 'chain.db')}` })
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
    ) as { entries: Array<{ tag: string }> }

    for (const entry of journal.entries) {
      await applyMigrationFile(primaryClient, `${entry.tag}.sql`)
    }

    const tables = await primaryClient.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${TABLE}'`
    )
    expect(tables.rows).toHaveLength(1)
  })
})
