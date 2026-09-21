/**
 * Schema parity for `voice_recognition_records` (aux-homed, provider latency added 2026-09-21).
 *
 * The table has TWO creators: the hand-written migration chain (`0043_voice_recognition_records.sql`,
 * extended by `0049_voice_provider_latency.sql`, on the primary db — also the fallback home aux
 * writes land on before the background aux init finishes) and the raw `ensureAuxTables()` DDL
 * (`database-aux.db`). Per database-write-contracts §6 the homes must agree — a column that exists
 * on one and not the other resurfaces as a runtime `no such column` on whichever home
 * `scheduleAuxWrite` happens to resolve.
 *
 * `provider_latency_ms` is the one column whose aux side has two sources: the `CREATE TABLE` DDL
 * (fresh installs) and the pragma-guarded `ALTER TABLE` (installs that already had the table, where
 * the CREATE is a no-op). Both are exercised below, because dropping the guard leaves every existing
 * aux database without the column while a fresh install still looks healthy.
 *
 * It is also the only place that pins the registered side of the migration: the column list is read
 * from a database migrated through the real `_journal.json` chain, so a migration written but never
 * journaled shows up as a missing column rather than as a silent no-op.
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

const TABLE = 'voice_recognition_records'
const LATENCY_COLUMN = 'provider_latency_ms'
const COLUMNS = [
  'id',
  'captured_at',
  'source',
  'status',
  'audio_path',
  'audio_bytes',
  'audio_duration_ms',
  'recognition_duration_ms',
  'raw_text',
  'text',
  'provider_id',
  'model',
  'channel',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'error_code',
  'delivery_method',
  // Appended by the 0049 `ALTER TABLE`, so it sits at the tail of the migrated table while the aux
  // DDL declares it beside the other durations. Hence the name-keyed comparison below.
  LATENCY_COLUMN
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

interface AuxDdl {
  create: string
  indexes: string[]
  upgrades: string[]
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

/**
 * Columns keyed by name: the migration appends the latency column to the tail of the table while the
 * aux DDL declares it inline, so the two homes only agree as sets of columns.
 */
function columnsByName(columns: ColumnInfo[]): Record<string, Omit<ColumnInfo, 'name'>> {
  return Object.fromEntries(
    columns.map((column) => [
      column.name,
      { type: column.type, notnull: column.notnull, pk: column.pk }
    ])
  )
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
 * The aux DDL lives inline in `ensureAuxTables()`; executing the module is not possible without an
 * Electron app, so the statements are lifted from source. A rename there fails this test loudly
 * rather than silently skipping.
 *
 * `upgrades` is the pragma-guarded half of the aux side: the module issues it only against a
 * database where the probe found the column missing, which is the state the second case below
 * reconstructs.
 */
async function extractAuxDdl(): Promise<AuxDdl> {
  const source = await readFile(databaseModuleSource, 'utf8')
  const create = source.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${TABLE} \\([\\s\\S]*?\\n {6}\\)`)
  )
  const indexes = source.match(
    new RegExp(`CREATE INDEX IF NOT EXISTS [^']*ON ${TABLE} \\([^)]*\\)`, 'g')
  )
  const upgrades = [
    ...source.matchAll(new RegExp(`ALTER TABLE ${TABLE} ADD COLUMN \\w+ \\w+`, 'g'))
  ].map((match) => match[0])

  expect(create, `aux CREATE TABLE for ${TABLE} not found in database module`).not.toBeNull()
  expect(indexes, `aux indexes for ${TABLE} not found in database module`).not.toBeNull()

  return { create: create![0], indexes: indexes!, upgrades }
}

/** The unconditional half of `ensureAuxTables`: the CREATEs, then the indexes over them. */
async function applyAuxTables(client: Client, ddl: AuxDdl, create = ddl.create): Promise<void> {
  for (const statement of [create, ...ddl.indexes]) {
    await client.execute(statement)
  }
}

/**
 * The table as an install predating the column left it: `ensureAuxTables()` has already run once
 * against that database, so today's `CREATE TABLE IF NOT EXISTS` is a no-op there and only the
 * guarded `ALTER TABLE` can hand it the column.
 */
function preLatencyCreate(create: string): string {
  const legacy = create.replace(new RegExp(`\\n\\s*${LATENCY_COLUMN} \\w+,`), '')
  expect(legacy, `the pre-upgrade aux table still declares ${LATENCY_COLUMN}`).not.toContain(
    LATENCY_COLUMN
  )
  return legacy
}

describe(`${TABLE} schema`, () => {
  let directory: string
  let primaryClient: Client | undefined
  let auxClient: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-voice-recognition-schema-'))
  })

  afterEach(async () => {
    primaryClient?.close()
    auxClient?.close()
    primaryClient = undefined
    auxClient = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('creates the same column set on the migration home and on a fresh aux home', async () => {
    primaryClient = createClient({ url: `file:${join(directory, 'primary.db')}` })
    auxClient = createClient({ url: `file:${join(directory, 'aux.db')}` })

    await applyFullChain(primaryClient)
    // No upgrade replay here: the CREATE declares the column, so the guard's probe finds it and the
    // ALTER is never issued on a database that starts empty.
    await applyAuxTables(auxClient, await extractAuxDdl())

    const migrationColumns = await readColumns(primaryClient)
    expect(migrationColumns.map((column) => column.name)).toEqual(COLUMNS)
    // One recording per row: the store's upsert conflicts on this exact key.
    expect(migrationColumns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(
      ['id']
    )

    expect(columnsByName(await readColumns(auxClient))).toEqual(columnsByName(migrationColumns))
    expect(await readIndexes(auxClient)).toEqual(await readIndexes(primaryClient))
  })

  it('hands the column to an existing aux database, where the CREATE TABLE is a no-op', async () => {
    primaryClient = createClient({ url: `file:${join(directory, 'primary.db')}` })
    auxClient = createClient({ url: `file:${join(directory, 'aux.db')}` })

    await applyFullChain(primaryClient)
    const ddl = await extractAuxDdl()
    await applyAuxTables(auxClient, ddl, preLatencyCreate(ddl.create))
    await auxClient.execute(
      `INSERT INTO ${TABLE} (id, captured_at, source, status) VALUES ('recorded-before-upgrade', 1, 'recording', 'completed')`
    )

    for (const statement of ddl.upgrades) await auxClient.execute(statement)

    const auxColumns = await readColumns(auxClient)
    expect(auxColumns.map((column) => column.name)).toContain(LATENCY_COLUMN)
    expect(columnsByName(auxColumns)).toEqual(columnsByName(await readColumns(primaryClient)))

    // The rows that were already there are why the upgrade is a nullable ADD COLUMN: a recording
    // made before the column existed simply has no provider latency to report.
    const existing = await auxClient.execute(
      `SELECT ${LATENCY_COLUMN} AS latency FROM ${TABLE} WHERE id = 'recorded-before-upgrade'`
    )
    expect(existing.rows.map((row) => row.latency)).toEqual([null])
  })
})
