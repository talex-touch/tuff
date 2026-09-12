/**
 * Schema parity for `voice_polish_telemetry` (aux-homed, 2026-09-10).
 *
 * The table has TWO creators: the hand-written `0045_voice_polish_telemetry.sql` migration (the
 * primary db, and the fallback home aux writes land on before the background aux init finishes)
 * and the raw `ensureAuxTables()` DDL (`database-aux.db`). Per database-write-contracts §6 the
 * homes must agree — a column that exists on one and not the other resurfaces as a runtime
 * `no such column` on whichever home `scheduleAuxWrite` happens to resolve.
 *
 * It is also the only place that pins the registered side of the migration: the column list is
 * read from a database that was migrated through the real `_journal.json` chain, so a migration
 * written but never journaled shows up as a missing table rather than as a silent no-op.
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
const databaseModuleSource = resolve(testDir, './index.ts')

const TABLE = 'voice_polish_telemetry'
const MIGRATION_FILE = '0045_voice_polish_telemetry.sql'
const COLUMNS = [
  'id',
  'day',
  'captured_at',
  'tier',
  'units',
  'characters',
  'outcome',
  'strength',
  'requested_strength',
  'latency_ms',
  'polished_characters',
  'generation'
]

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
}

interface IndexInfo {
  name: string
  unique: number
  columns: string[]
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
 * The aux DDL lives inline in `ensureAuxTables()`; executing the module is not possible without
 * an Electron app, so the statements are lifted from source. A rename there fails this test
 * loudly rather than silently skipping.
 */
async function extractAuxStatements(): Promise<string[]> {
  const source = await readFile(databaseModuleSource, 'utf8')
  const create = source.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${TABLE} \\([\\s\\S]*?\\n {6}\\)`)
  )
  const indexes = source.match(
    new RegExp(`CREATE INDEX IF NOT EXISTS [^']*ON ${TABLE} \\([^)]*\\)`, 'g')
  )

  expect(create, `aux CREATE TABLE for ${TABLE} not found in database module`).not.toBeNull()
  expect(indexes, `aux indexes for ${TABLE} not found in database module`).not.toBeNull()

  return [create![0], ...indexes!]
}

async function applyMigrationFile(client: Client, fileName: string): Promise<void> {
  const sql = await readFile(join(migrationsFolder, fileName), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

describe(`${TABLE} schema`, () => {
  let directory: string
  let migrationClient: Client | undefined
  let auxClient: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-voice-polish-schema-'))
  })

  afterEach(async () => {
    migrationClient?.close()
    auxClient?.close()
    migrationClient = undefined
    auxClient = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('creates an identical table on the migration home and the aux home', async () => {
    migrationClient = createClient({ url: `file:${join(directory, 'primary.db')}` })
    auxClient = createClient({ url: `file:${join(directory, 'aux.db')}` })

    await applyMigrationFile(migrationClient, MIGRATION_FILE)
    for (const statement of await extractAuxStatements()) {
      await auxClient.execute(statement)
    }

    const migrationColumns = await readColumns(migrationClient)
    expect(migrationColumns.map((column) => column.name)).toEqual(COLUMNS)
    // One row per decision: the store relies on this exact conflict target, and the null
    // strengths are how a gate skip is recorded.
    expect(migrationColumns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(
      ['id']
    )
    expect(
      migrationColumns.filter((column) => column.notnull === 1).map((column) => column.name)
    ).toEqual(COLUMNS.filter((name) => name !== 'strength' && name !== 'requested_strength'))

    expect(await readColumns(auxClient)).toEqual(migrationColumns)
    expect(await readIndexes(auxClient)).toEqual(await readIndexes(migrationClient))
  })

  it('applies cleanly on top of the full migration chain', async () => {
    migrationClient = createClient({ url: `file:${join(directory, 'chain.db')}` })
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
    ) as { entries: Array<{ tag: string }> }

    for (const entry of journal.entries) {
      await applyMigrationFile(migrationClient, `${entry.tag}.sql`)
    }

    const columns = await readColumns(migrationClient)
    expect(columns.map((column) => column.name)).toEqual(COLUMNS)
    expect(columns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(['id'])
  })
})
