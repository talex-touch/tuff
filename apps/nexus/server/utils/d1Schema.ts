import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'

/**
 * Runtime schema bootstrap for the Nexus D1 database.
 *
 * Every store used to create its tables on first use in every isolate, one awaited statement per
 * `CREATE TABLE` / `CREATE INDEX` / `PRAGMA` / `ALTER`, behind a flag that lived as long as the
 * isolate. The Worker runs far from the database — requests from China are served in LAX or AMS
 * while D1's primary is in NRT — so each of those statements was a 150–250 ms round trip: `auth`
 * alone was 29 of them before a signed-in request could read a user, and D1 Insights counted about
 * 100k schema statements a week, all of them no-ops.
 *
 * A store now declares its schema once with `defineD1Schema` and calls `ensureD1Schema` where it
 * used to run the DDL. The database records which definitions it has applied
 * (`nexus_schema_state`), an isolate reads that record once for every store, and a store whose
 * definition is on record pays nothing more. Only a definition the database has not
 * seen — a fresh database, or a deploy that changed the DDL — is applied: the tables, then any
 * missing columns, then the indexes and one-off backfills, then the record, in as few round trips
 * as the definition allows (one when it declares no columns).
 *
 * The record is keyed by the definition's hash as well as its name, so two deploys rolling out at
 * once each find their own definition recorded instead of re-applying each other's in turn.
 * Applying is idempotent (`IF NOT EXISTS`, columns added only when missing, backfills guarded by
 * their own `WHERE`), so isolates racing to apply the same definition converge.
 */

const SCHEMA_STATE_TABLE = 'nexus_schema_state'

const SCHEMA_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA_STATE_TABLE} (
    key TEXT NOT NULL,
    hash TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (key, hash)
  )
`

export interface D1SchemaColumn {
  /** Column name, as `PRAGMA table_info` reports it. */
  readonly name: string
  /** Everything after `ADD COLUMN`, e.g. `locale TEXT`. */
  readonly ddl: string
}

export interface D1SchemaColumns {
  readonly table: string
  readonly columns: readonly D1SchemaColumn[]
}

export interface D1SchemaInput {
  /**
   * Idempotent DDL: `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, and seed
   * rows written with `INSERT OR IGNORE`. Tables are created before columns are added and
   * everything else after, so an index may name a column that only `columns` adds to an old table.
   */
  readonly statements: readonly string[]
  /** Columns added to tables created by an older definition. Each is added only when missing. */
  readonly columns?: readonly D1SchemaColumns[]
  /**
   * One-off data repairs, run after the columns exist, each time the definition is applied and
   * never on an ordinary request. They must be safe to run again (their own `WHERE` selects only
   * the rows still needing the repair), because concurrent isolates may both apply a definition.
   */
  readonly backfills?: readonly string[]
  /**
   * A one-off migration that SQL alone cannot express (it depends on whether a legacy table exists),
   * run after the backfills when the definition is applied. `id` stands in for the code in the
   * fingerprint — change it when the migration changes. Must be safe to run again.
   */
  readonly migrate?: D1SchemaMigration
}

export interface D1SchemaMigration {
  readonly id: string
  readonly run: (db: D1Database) => Promise<void>
}

export interface D1SchemaDefinition {
  readonly key: string
  readonly hash: string
  readonly tables: readonly string[]
  readonly statements: readonly string[]
  readonly columns: readonly D1SchemaColumns[]
  readonly backfills: readonly string[]
  readonly migrate: D1SchemaMigration | null
}

/** The fingerprint's view of a statement: re-indenting or re-wrapping DDL does not re-apply it. */
function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s/g, '(')
    .replace(/\s\)/g, ')')
    .replace(/\s,/g, ',')
    .trim()
}

/** FNV-1a, 32 bit: a stable fingerprint of the definition's text, not a security boundary. */
function fingerprint(text: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16)}`
}

function isCreateTable(sql: string): boolean {
  return /^CREATE\s+TABLE\b/i.test(sql)
}

export function defineD1Schema(key: string, input: D1SchemaInput): D1SchemaDefinition {
  // Executed as written (a string literal's spacing is data); fingerprinted normalised.
  const statements = input.statements.map(sql => sql.trim()).filter(Boolean)
  const columns = (input.columns ?? []).map(entry => ({
    table: entry.table,
    columns: entry.columns.map(column => ({ name: column.name, ddl: column.ddl.trim() })),
  }))
  const backfills = (input.backfills ?? []).map(sql => sql.trim()).filter(Boolean)
  const fingerprintSource = JSON.stringify({
    statements: statements.map(normalizeSql),
    columns: columns.map(entry => ({
      table: entry.table,
      columns: entry.columns.map(column => ({ name: column.name, ddl: normalizeSql(column.ddl) })),
    })),
    backfills: backfills.map(normalizeSql),
    migrate: input.migrate?.id ?? null,
  })
  return {
    key,
    hash: fingerprint(fingerprintSource),
    tables: statements.filter(isCreateTable),
    statements: statements.filter(sql => !isCreateTable(sql)),
    columns,
    backfills,
    migrate: input.migrate ?? null,
  }
}

interface DatabaseSchemaState {
  /** `key:hash` of every definition known to be applied: on the database's record, or applied by this isolate. */
  readonly applied: Set<string>
  /** Whether the database's record has been read into `applied`. */
  recordRead: boolean
  /** `key:hash` → when to try again, for definitions the database refused to write. */
  readonly deferred: Map<string, number>
}

/**
 * Keyed by the binding object. `env.DB` keeps its identity across requests within an isolate
 * (the per-binding guards several stores kept in a `WeakSet` held across requests in production),
 * and a test's fresh database starts from nothing on its own.
 *
 * Only settled facts are kept, never a query in flight. A query belongs to the request that started
 * it, and a Worker cancels a request's I/O when its client disconnects: a promise shared with other
 * requests would then never settle for any of them, and every later request in the isolate would
 * wait on it. Callers that miss at the same moment each run their own read, side by side, so it
 * costs them no time; once one has settled, none do.
 */
const databaseStates = new WeakMap<object, DatabaseSchemaState>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * How long an isolate leaves a definition alone after the database refused to write it, so that
 * requests made meanwhile do not each pay a round trip for a write that cannot succeed.
 */
const WRITE_REFUSED_RETRY_MS = 60_000

/**
 * The database is up but takes no writes: D1 past the account's daily row-write limit
 * (`D1_ERROR: Your account has exceeded D1's free tier daily row write limit…`), or a read-only
 * database. Unlike a broken definition, this says nothing about the schema already there.
 */
function isWriteRefused(error: unknown): boolean {
  return /row write limit|exceeded D1's free tier|read-?only/i.test(errorMessage(error))
}

async function readRecordedDefinitions(db: D1Database): Promise<Set<string> | null> {
  try {
    const result = await db.prepare(`SELECT key, hash FROM ${SCHEMA_STATE_TABLE}`).all<{ key: string, hash: string }>()
    const rows = Array.isArray(result?.results) ? result.results : []
    return new Set(rows.map(row => `${row.key}:${row.hash}`))
  }
  catch (error) {
    // No table yet: nothing has been recorded, so every definition is applied once and recorded.
    if (/no such table/i.test(errorMessage(error)))
      return new Set()
    // Anything else leaves the record unknown: this caller applies its definition as stores did
    // before the record existed, which is slower but never wrong, and the next caller reads it again.
    return null
  }
}

function stateFor(db: D1Database): DatabaseSchemaState {
  let state = databaseStates.get(db)
  if (!state) {
    state = { applied: new Set(), recordRead: false, deferred: new Map() }
    databaseStates.set(db, state)
  }
  return state
}

type StatementFactory = () => D1PreparedStatement

/**
 * One round trip and one transaction for the lot. A test double without `batch` runs them in order,
 * preparing each just before it runs: some doubles compile at `prepare()`, where D1 compiles at
 * execution, and a statement naming a table created earlier in the list must not be compiled first.
 */
async function runStatements(db: D1Database, factories: StatementFactory[]): Promise<void> {
  if (factories.length === 0)
    return
  if (typeof db.batch === 'function') {
    await db.batch(factories.map(factory => factory()))
    return
  }
  for (const factory of factories)
    await factory().run()
}

async function addMissingColumns(db: D1Database, definition: D1SchemaDefinition): Promise<void> {
  const infos = await Promise.all(definition.columns.map(entry =>
    db.prepare(`PRAGMA table_info(${entry.table})`).all<{ name: string }>(),
  ))

  for (const [index, entry] of definition.columns.entries()) {
    const existing = new Set((infos[index]?.results ?? []).map(row => row.name))
    for (const column of entry.columns) {
      if (existing.has(column.name))
        continue
      try {
        await db.prepare(`ALTER TABLE ${entry.table} ADD COLUMN ${column.ddl}`).run()
      }
      catch (error) {
        // Another isolate applying the same definition added it first.
        if (!/duplicate column/i.test(errorMessage(error)))
          throw error
      }
    }
  }
}

function recordStatement(db: D1Database, definition: D1SchemaDefinition): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO ${SCHEMA_STATE_TABLE} (key, hash, applied_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(key, hash) DO UPDATE SET applied_at = excluded.applied_at
  `).bind(definition.key, definition.hash, new Date().toISOString())
}

async function applyDefinition(db: D1Database, definition: D1SchemaDefinition): Promise<void> {
  const prepare = (sql: string): StatementFactory => () => db.prepare(sql)
  const tables = [prepare(SCHEMA_STATE_DDL), ...definition.tables.map(prepare)]
  const rest = [
    ...definition.statements.map(prepare),
    ...definition.backfills.map(prepare),
  ]
  const record = () => recordStatement(db, definition)

  if (definition.columns.length === 0 && !definition.migrate) {
    await runStatements(db, [...tables, ...rest, record])
    return
  }

  await runStatements(db, tables)
  if (definition.columns.length > 0)
    await addMissingColumns(db, definition)
  if (!definition.migrate) {
    await runStatements(db, [...rest, record])
    return
  }
  await runStatements(db, rest)
  await definition.migrate.run(db)
  await runStatements(db, [record])
}

/**
 * Makes sure `definition` is applied to `db`. Costs one query per isolate for the record (shared by
 * every store) and nothing after that for a recorded definition.
 */
export async function ensureD1Schema(db: D1Database, definition: D1SchemaDefinition): Promise<void> {
  const state = stateFor(db)
  const id = `${definition.key}:${definition.hash}`
  if (state.applied.has(id))
    return

  if (!state.recordRead) {
    const recorded = await readRecordedDefinitions(db)
    if (recorded) {
      for (const entry of recorded)
        state.applied.add(entry)
      state.recordRead = true
    }
    if (state.applied.has(id))
      return
  }

  const retryAt = state.deferred.get(id)
  if (retryAt !== undefined && Date.now() < retryAt)
    return

  try {
    await applyDefinition(db, definition)
  }
  catch (error) {
    if (isWriteRefused(error)) {
      // The tables an earlier deploy created are still there, so the caller's reads can go ahead
      // without whatever this definition adds; failing them too would take read-only endpoints down
      // with the writes. Not recorded, so it is applied once the database takes writes again.
      state.deferred.set(id, Date.now() + WRITE_REFUSED_RETRY_MS)
      console.warn(`[d1-schema] "${definition.key}" not applied, the database refused the write: ${errorMessage(error)}`)
      return
    }
    // A failed apply is not remembered: the next request retries it, as the old per-store flags did.
    console.warn(`[d1-schema] applying "${definition.key}" failed: ${errorMessage(error)}`)
    throw error
  }
  state.deferred.delete(id)
  state.applied.add(id)
}
