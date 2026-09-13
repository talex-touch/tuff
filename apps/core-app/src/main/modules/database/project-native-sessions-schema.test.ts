/**
 * Regression for folder projects and local AI CLI session pointers (0046, 2026-09-13).
 *
 * One project is one canonical existing directory: `projects.root_path` is the identity (display
 * name is mutable), so the unique index must hold the *canonical* spelling and the store must
 * collapse a symlink and its target onto one row. The pointer table's triple
 * (provider, project_root, native_session_id) is the only thing that may identify a native CLI
 * transcript; if it narrowed, two providers would share one pointer, and if it widened, one Pi
 * session would fork into two rows.
 *
 * These run against a real libSQL chain because the properties under test are SQLite's: what the
 * migration actually created, and what the FKs do when a project is archived or removed. A mocked
 * db could only prove that an insert was attempted.
 */
import type { Client } from '@libsql/client'
import type { MainDatabase } from '../../db/db-write'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { createOrRestoreProject, listProjects } from '../project/project-store'

// Driving the whole migration chain repeatedly costs seconds on a loaded CI runner.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let db: MainDatabase
let directory: string
let client: Client | undefined

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

// The scheduler only serialises; running the task inline keeps these tests about the write itself.
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: string | null
}

interface IndexInfo {
  name: string
  unique: number
  columns: string[]
}

interface ForeignKeyInfo {
  table: string
  from: string
  to: string
  onDelete: string
}

async function applyMigrationFile(target: Client, fileName: string): Promise<void> {
  const sql = await readFile(join(migrationsFolder, fileName), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await target.execute(statement)
  }
}

/** Applies every journal entry, or only those before `untilIdxExclusive`. */
async function applyChain(target: Client, untilIdxExclusive?: number): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as { entries: Array<{ idx: number; tag: string }> }
  for (const entry of journal.entries) {
    if (untilIdxExclusive !== undefined && entry.idx >= untilIdxExclusive) continue
    await applyMigrationFile(target, `${entry.tag}.sql`)
  }
}

async function readColumns(target: Client, table: string): Promise<ColumnInfo[]> {
  const result = await target.execute(
    `SELECT name, type, "notnull", pk, dflt_value FROM pragma_table_info('${table}')`
  )
  return result.rows
    .map((row) => ({
      name: String(row.name),
      type: String(row.type).toLowerCase(),
      notnull: Number(row.notnull),
      pk: Number(row.pk),
      dflt_value: row.dflt_value == null ? null : String(row.dflt_value)
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function readIndexes(target: Client, table: string): Promise<IndexInfo[]> {
  const list = await target.execute(`SELECT name, "unique" FROM pragma_index_list('${table}')`)
  const indexes: IndexInfo[] = []

  for (const row of list.rows.map((entry) => ({
    name: String(entry.name),
    unique: Number(entry.unique)
  }))) {
    const info = await target.execute(
      `SELECT name FROM pragma_index_info('${row.name}') ORDER BY seqno`
    )
    indexes.push({
      name: row.name,
      unique: row.unique,
      columns: info.rows.map((column) => String(column.name))
    })
  }

  return indexes
}

async function readForeignKeys(target: Client, table: string): Promise<ForeignKeyInfo[]> {
  const result = await target.execute(
    `SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list('${table}')`
  )
  return result.rows.map((row) => ({
    table: String(row.table),
    from: String(row.from),
    to: String(row.to),
    onDelete: String(row.on_delete)
  }))
}

async function seedProject(
  target: Client,
  id: string,
  rootPath = `/projects/${id}`
): Promise<void> {
  await target.execute({
    sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, 0, 0, 1, 1, 1)`,
    args: [id, rootPath, id]
  })
}

async function countRows(target: Client, table: string, where: string): Promise<number> {
  const result = await target.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
  return Number(result.rows[0]?.n ?? 0)
}

describe('folder projects / native session schema', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-project-schema-'))
    client = createClient({ url: `file:${join(directory, 'chain.db')}` })
    // DatabaseModule configures every connection this way; without it SQLite ignores the FKs
    // declared by 0046 and a project delete would leave dangling owner ids.
    await client.execute('PRAGMA foreign_keys = ON')
    db = drizzle(client, { schema })
  })

  afterEach(async () => {
    client?.close()
    client = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('creates the exact project and pointer columns the stores write', async () => {
    await applyChain(client!)

    const projectColumns = await readColumns(client!, 'projects')
    expect(
      Object.fromEntries(
        projectColumns.map((column) => [
          column.name,
          { type: column.type, notnull: column.notnull, dflt: column.dflt_value }
        ])
      )
    ).toEqual({
      archived: { type: 'integer', notnull: 1, dflt: '0' },
      created_at: { type: 'integer', notnull: 1, dflt: null },
      id: { type: 'text', notnull: 1, dflt: null },
      last_opened_at: { type: 'integer', notnull: 1, dflt: null },
      name: { type: 'text', notnull: 1, dflt: null },
      pinned: { type: 'integer', notnull: 1, dflt: '0' },
      root_path: { type: 'text', notnull: 1, dflt: null },
      updated_at: { type: 'integer', notnull: 1, dflt: null }
    })
    expect(projectColumns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'id'
    ])

    const sessionColumns = await readColumns(client!, 'local_ai_cli_sessions')
    expect(
      Object.fromEntries(
        sessionColumns.map((column) => [
          column.name,
          { type: column.type, notnull: column.notnull, dflt: column.dflt_value }
        ])
      )
    ).toEqual({
      created_at: { type: 'integer', notnull: 1, dflt: null },
      expected_head_id: { type: 'text', notnull: 0, dflt: null },
      id: { type: 'text', notnull: 1, dflt: null },
      last_seen_at: { type: 'integer', notnull: 1, dflt: null },
      native_session_id: { type: 'text', notnull: 1, dflt: null },
      origin: { type: 'text', notnull: 1, dflt: "'tuff'" },
      project_id: { type: 'text', notnull: 0, dflt: null },
      project_root: { type: 'text', notnull: 1, dflt: null },
      provider: { type: 'text', notnull: 1, dflt: null },
      state: { type: 'text', notnull: 1, dflt: "'available'" },
      title: { type: 'text', notnull: 1, dflt: "''" },
      updated_at: { type: 'integer', notnull: 1, dflt: null }
    })
    expect(sessionColumns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'id'
    ])

    // A legacy Home thread gets an owner column that must accept NULL without a backfill.
    const conversationColumns = await readColumns(client!, 'conversations')
    const projectId = conversationColumns.find((column) => column.name === 'project_id')
    expect(projectId).toMatchObject({ type: 'text', notnull: 0, dflt_value: null })
  })

  it('keys projects by canonical root and pointers by the provider/root/native-id triple', async () => {
    await applyChain(client!)

    expect(await readIndexes(client!, 'projects')).toContainEqual({
      name: 'uniq_projects_root',
      unique: 1,
      columns: ['root_path']
    })
    expect(await readIndexes(client!, 'projects')).toContainEqual({
      name: 'idx_projects_archive_pin_recent',
      unique: 0,
      columns: ['archived', 'pinned', 'last_opened_at']
    })

    expect(await readIndexes(client!, 'local_ai_cli_sessions')).toContainEqual({
      name: 'uniq_local_ai_cli_sessions_native',
      unique: 1,
      columns: ['provider', 'project_root', 'native_session_id']
    })
    expect(await readIndexes(client!, 'local_ai_cli_sessions')).toContainEqual({
      name: 'idx_local_ai_cli_sessions_project_recent',
      unique: 0,
      columns: ['project_id', 'last_seen_at']
    })

    expect(await readIndexes(client!, 'conversations')).toContainEqual({
      name: 'idx_conversations_project_updated',
      unique: 0,
      columns: ['project_id', 'updated_at']
    })

    // A project's removal must orphan its rows as Home-owned, never delete user conversations.
    expect(await readForeignKeys(client!, 'conversations')).toEqual([
      { table: 'projects', from: 'project_id', to: 'id', onDelete: 'SET NULL' }
    ])
    expect(await readForeignKeys(client!, 'local_ai_cli_sessions')).toEqual([
      { table: 'projects', from: 'project_id', to: 'id', onDelete: 'SET NULL' }
    ])
  })

  it('rejects a second pointer for the same native triple but allows a different provider or root', async () => {
    await applyChain(client!)
    await seedProject(client!, 'project-1')

    const insert = (id: string, provider: string, root: string, nativeId: string) =>
      client!.execute({
        sql: `INSERT INTO local_ai_cli_sessions (id, project_id, provider, project_root, native_session_id, title, state, origin, expected_head_id, created_at, updated_at, last_seen_at) VALUES (?, 'project-1', ?, ?, ?, '', 'available', 'tuff', NULL, 1, 1, 1)`,
        args: [id, provider, root, nativeId]
      })

    await insert('session-1', 'pi', '/projects/project-1', 'native-1')

    await expect(insert('session-2', 'pi', '/projects/project-1', 'native-1')).rejects.toThrow(
      /UNIQUE/i
    )

    // Same native id under another provider or root is a distinct transcript, not a duplicate.
    await expect(
      insert('session-3', 'oh-my-pi', '/projects/project-1', 'native-1')
    ).resolves.toBeDefined()
    await expect(insert('session-4', 'pi', '/projects/other', 'native-1')).resolves.toBeDefined()

    expect(await countRows(client!, 'local_ai_cli_sessions', '1=1')).toBe(3)
  })

  it('archives a project without detaching its conversations or pointers', async () => {
    await applyChain(client!)
    await seedProject(client!, 'project-1')
    await client!.execute(
      `INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES ('thread-1', 'owned', 'project-1', 1, 1)`
    )
    await client!.execute(
      `INSERT INTO local_ai_cli_sessions (id, project_id, provider, project_root, native_session_id, title, state, origin, expected_head_id, created_at, updated_at, last_seen_at) VALUES ('session-1', 'project-1', 'pi', '/projects/project-1', 'native-1', 'title', 'available', 'tuff', NULL, 1, 1, 1)`
    )

    await client!.execute(`UPDATE projects SET archived = 1 WHERE id = 'project-1'`)

    expect(
      await countRows(client!, 'conversations', `id = 'thread-1' AND project_id = 'project-1'`)
    ).toBe(1)
    expect(
      await countRows(
        client!,
        'local_ai_cli_sessions',
        `id = 'session-1' AND project_id = 'project-1'`
      )
    ).toBe(1)

    // Removing the project (not part of this slice, but the FK contract is user-facing) nulls the
    // owner instead of cascading the delete into their data.
    await client!.execute(`DELETE FROM projects WHERE id = 'project-1'`)
    expect(
      await countRows(client!, 'conversations', `id = 'thread-1' AND project_id IS NULL`)
    ).toBe(1)
    expect(
      await countRows(client!, 'local_ai_cli_sessions', `id = 'session-1' AND project_id IS NULL`)
    ).toBe(1)
  })

  it('leaves conversations written before 0046 owned by Home (project_id NULL)', async () => {
    await applyChain(client!, 46)
    await client!.execute(
      `INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('legacy-1', 'before projects', 10, 20)`
    )

    await applyMigrationFile(client!, '0046_folder_projects_native_sessions.sql')

    const rows = await client!.execute(`SELECT project_id FROM conversations WHERE id = 'legacy-1'`)
    expect(rows.rows).toEqual([{ project_id: null }])
  })

  it('collapses a symlink and its target onto one project row with the canonical root', async () => {
    await applyChain(client!)

    const realRoot = join(directory, 'real-project')
    const linkedRoot = join(directory, 'linked-project')
    await mkdir(realRoot)
    await symlink(realRoot, linkedRoot, 'dir')
    const canonicalRoot = await realpath(realRoot)

    const linked = await createOrRestoreProject(linkedRoot)
    const direct = await createOrRestoreProject(realRoot)

    expect(linked.rootPath).toBe(canonicalRoot)
    expect(linked.name).toBe(basename(canonicalRoot))
    expect(direct.id).toBe(linked.id)
    expect(await listProjects()).toHaveLength(1)
  })

  it('rejects a path that is missing or not a directory', async () => {
    await applyChain(client!)

    await expect(createOrRestoreProject(join(directory, 'nope'))).rejects.toThrow(
      'PROJECT_PATH_INVALID'
    )

    const filePath = join(directory, 'not-a-folder')
    await writeFile(filePath, 'plain file')
    await expect(createOrRestoreProject(filePath)).rejects.toThrow('PROJECT_PATH_INVALID')
  })
})
