import type { SQLInputValue } from 'node:sqlite'
import { DatabaseSync } from 'node:sqlite'

/**
 * A D1 binding over a real in-memory SQLite database (Node's built-in
 * `node:sqlite`, no dependency), for store tests whose behaviour is decided by
 * the SQL itself: a conditional `UPDATE` decides what is written, and its
 * `meta.changes` says whether it was.
 *
 * A fake that matches statements by their text re-implements every predicate
 * and then agrees with itself whatever the store writes. The admin credit
 * deduction that answered 200 while the balance never moved (the next read
 * raised it back to the plan allowance) was invisible to exactly that kind of
 * suite. Here the store's own statements run.
 *
 * What D1 does that the shim keeps (workerd's D1 API, Miniflare's local D1):
 * - `prepare(sql)` compiles when the statement runs, so a bad statement fails
 *   where D1 fails it;
 * - `bind()` returns a new statement; booleans bind as 1 / 0, and `undefined` or
 *   a `bigint` throws `D1_TYPE_ERROR` there, as D1 does;
 * - `first()` is the first row or `null`; `first(column)` is that column's
 *   value, and throws `D1_COLUMN_NOTFOUND` when the row has no such column;
 * - `all()` / `run()` answer `{ results, success, meta }`, where `meta.changes`
 *   is the rows the statement itself wrote: the `total_changes()` difference
 *   across it, as Miniflare counts. node:sqlite's own `changes` is
 *   `sqlite3_changes()`, which DDL and `SELECT` leave at the previous write's
 *   count and a `RETURNING` statement read row by row never reports;
 * - `batch()` is one transaction: when a statement throws, all of them roll back;
 * - a statement binds at most 100 parameters (D1's limit, far under SQLite's), so
 *   an `IN (?, ?, …)` list built from rows fails here as it fails in production;
 * - a compound SELECT takes at most five terms: D1 refuses a sixth, and the
 *   telemetry daily rollup passed every local test and failed on it in production
 *   (2026-10-09). SQLite's own default is 500;
 * - a function call takes at most 32 arguments, D1's documented cap (SQLite allows
 *   1000). A 34-argument call still ran on production D1 on 2026-10-09, so this one
 *   may be stricter than production.
 *
 * Every call yields a microtask before it touches the database, so two callers
 * running at once interleave between their statements as they do against D1: a
 * read-then-write can lose an update here, a single conditional statement cannot.
 */

export interface SqliteD1Result<T = Record<string, unknown>> {
  results: T[]
  success: true
  meta: { changes: number, last_row_id: number }
}

function toSqliteValue(value: unknown, index: number): SQLInputValue {
  // node:sqlite would bind a bigint; D1 refuses it, like `undefined`.
  if (value === undefined || typeof value === 'bigint')
    throw new TypeError(`D1_TYPE_ERROR: Type '${typeof value}' not supported for value '${String(value)}' (parameter ${index + 1})`)
  if (typeof value === 'boolean')
    return value ? 1 : 0
  return value as SQLInputValue
}

/** D1's limit on the parameters one statement binds. */
const D1_MAX_BOUND_PARAMETERS = 100

/** SQLite's running count of written rows, and the last inserted rowid: D1 reports a statement's `meta` from these. */
function writeCounters(database: DatabaseSync): { total: number, lastRowId: number } {
  const row = database.prepare('SELECT total_changes() AS total, last_insert_rowid() AS lastRowId').get()!
  return { total: Number(row.total), lastRowId: Number(row.lastRowId) }
}

export class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    readonly sql: string,
    private readonly values: readonly SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values.map(toSqliteValue))
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    await Promise.resolve()
    const row = this.compile().get(...this.values)
    if (!row)
      return null
    if (column === undefined)
      return { ...row } as T
    // A misspelt column is an error in D1, not a `null` value.
    if (row[column] === undefined)
      throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`)
    return row[column] as T | null
  }

  async all<T = Record<string, unknown>>(): Promise<SqliteD1Result<T>> {
    await Promise.resolve()
    return this.execute() as SqliteD1Result<T>
  }

  async run<T = Record<string, unknown>>(): Promise<SqliteD1Result<T>> {
    await Promise.resolve()
    return this.execute() as SqliteD1Result<T>
  }

  /** Runs the statement now: its rows when it returns any, and the rows it wrote. */
  execute(): SqliteD1Result {
    const statement = this.compile()
    const before = writeCounters(this.database)
    const results = statement.columns().length > 0
      ? statement.all(...this.values).map(row => ({ ...row }))
      : (statement.run(...this.values), [])
    const after = writeCounters(this.database)
    return { results, success: true, meta: { changes: after.total - before.total, last_row_id: after.lastRowId } }
  }

  private compile() {
    if (this.values.length > D1_MAX_BOUND_PARAMETERS)
      throw new Error(`D1_ERROR: too many SQL variables: ${this.values.length} bound, D1 allows ${D1_MAX_BOUND_PARAMETERS}`)
    return this.database.prepare(this.sql)
  }
}

export class SqliteD1Database {
  /** The database underneath, for a test to seed and read rows without going through the store. */
  readonly sqlite = new DatabaseSync(':memory:')

  constructor() {
    // Node 26's node:sqlite has `limits`; the installed @types/node does not declare it yet.
    const { limits } = this.sqlite as DatabaseSync & { limits: Record<'functionArg' | 'compoundSelect', number> }
    limits.functionArg = 32
    limits.compoundSelect = 5
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql)
  }

  async batch(statements: SqliteD1Statement[]): Promise<SqliteD1Result[]> {
    await Promise.resolve()
    this.sqlite.exec('BEGIN')
    try {
      const results = statements.map(statement => statement.execute())
      this.sqlite.exec('COMMIT')
      return results
    }
    catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.sqlite.close()
  }
}

export function createSqliteD1(): SqliteD1Database {
  return new SqliteD1Database()
}
