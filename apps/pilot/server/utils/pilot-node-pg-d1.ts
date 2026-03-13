import type { PilotDatabase, PilotDbPreparedStatement, PilotDbResult } from '../types/pilot-db'
import process from 'node:process'
import { Pool } from 'pg'

const NODE_PG_D1_CACHE_KEY = '__pilotNodePgD1Cache'

type GlobalNodePgD1Cache = typeof globalThis & {
  [NODE_PG_D1_CACHE_KEY]?: Map<string, PilotDatabase>
}

function normalizeParam(value: unknown): unknown {
  if (value === undefined) {
    return null
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return value
}

function toMeta(input: { rowCount?: number | null } = {}) {
  const changes = Number(input.rowCount || 0)
  return {
    duration: 0,
    changes: Number.isFinite(changes) ? changes : 0,
    last_row_id: 0,
    rows_read: 0,
    rows_written: Number.isFinite(changes) ? changes : 0,
  }
}

function toPgPlaceholders(sql: string): string {
  return sql.replace(/\?(\d+)/g, (_full, index) => `$${index}`)
}

function toPgNowIso(sql: string): string {
  return sql.replaceAll(
    'strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')',
    `to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  )
}

function rewriteInsertOrReplace(sql: string): string {
  const normalized = sql.trim()
  const matched = normalized.match(/^INSERT\s+OR\s+REPLACE\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)\s*$/i)
  if (!matched) {
    return sql
  }

  const tableName = matched[1]
  const columns = matched[2].split(',').map(part => part.trim()).filter(Boolean)
  const values = matched[3].trim()
  if (columns.length === 0) {
    return sql
  }

  const conflictColumn = columns.includes('id') ? 'id' : columns[0]
  const updateColumns = columns.filter(column => column !== conflictColumn)
  if (updateColumns.length === 0) {
    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values}) ON CONFLICT (${conflictColumn}) DO NOTHING`
  }

  const updateSet = updateColumns.map(column => `${column} = EXCLUDED.${column}`).join(', ')
  return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values}) ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateSet}`
}

function toPgSql(sql: string): string {
  return toPgPlaceholders(toPgNowIso(rewriteInsertOrReplace(sql)))
}

class NodePgPreparedStatement {
  constructor(
    private readonly pool: Pool,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): PilotDbPreparedStatement {
    return new NodePgPreparedStatement(this.pool, this.sql, values.map(normalizeParam)) as unknown as PilotDbPreparedStatement
  }

  async first<T = unknown>(columnName?: string): Promise<T | null> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    const row = query.rows[0] as Record<string, unknown> | undefined
    if (!row) {
      return null
    }
    if (columnName) {
      return (row[columnName] as T | undefined) ?? null
    }
    return row as T
  }

  async run<T = unknown>(): Promise<PilotDbResult<T>> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    return {
      success: true,
      meta: toMeta({ rowCount: query.rowCount }),
      results: [],
    } as PilotDbResult<T>
  }

  async all<T = unknown>(): Promise<PilotDbResult<T>> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    return {
      success: true,
      meta: toMeta({ rowCount: query.rowCount }),
      results: query.rows as T[],
    } as PilotDbResult<T>
  }

  async raw<T = unknown>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    const rows = query.rows as Record<string, unknown>[]
    const values = rows.map(row => Object.values(row) as T)
    if (options?.columnNames) {
      const columns = (query.fields || []).map(field => field.name)
      return [columns as unknown as T, ...values]
    }
    return values
  }

  getSql() {
    return this.sql
  }

  getParams() {
    return [...this.params]
  }
}

class NodePgDatabase {
  constructor(private readonly pool: Pool) {}

  prepare(query: string): PilotDbPreparedStatement {
    return new NodePgPreparedStatement(this.pool, query) as unknown as PilotDbPreparedStatement
  }

  async batch<T = unknown>(statements: PilotDbPreparedStatement[]): Promise<PilotDbResult<T>[]> {
    const executable = statements.map((statement) => {
      if (!(statement instanceof NodePgPreparedStatement)) {
        throw new TypeError('Node PG D1 adapter only accepts statements created by the same adapter instance.')
      }
      return statement
    })

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const results: PilotDbResult<T>[] = []
      for (const statement of executable) {
        const query = await client.query(toPgSql(statement.getSql()), statement.getParams() as any[])
        results.push({
          success: true,
          meta: toMeta({ rowCount: query.rowCount }),
          results: [],
        } as PilotDbResult<T>)
      }
      await client.query('COMMIT')
      return results
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    finally {
      client.release()
    }
  }

  async exec(query: string): Promise<{ count: number, duration: number }> {
    const result = await this.pool.query(toPgSql(query))
    return {
      count: Number(result.rowCount || 0),
      duration: 0,
    }
  }

  withSession(): any {
    return this
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('Node PG D1 adapter does not support dump().')
  }
}

function resolvePostgresDsn(): string {
  const dsn = String(process.env.PILOT_POSTGRES_URL || '').trim()
  if (!dsn) {
    throw new Error('Postgres mode requires PILOT_POSTGRES_URL.')
  }
  return dsn
}

function createNodePgDatabase(dsn: string): PilotDatabase {
  const max = 10
  const pool = new Pool({
    connectionString: dsn,
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 10,
  })
  return new NodePgDatabase(pool) as unknown as PilotDatabase
}

export function getNodePilotPostgresDatabase(): PilotDatabase {
  const globalCache = globalThis as GlobalNodePgD1Cache
  if (!globalCache[NODE_PG_D1_CACHE_KEY]) {
    globalCache[NODE_PG_D1_CACHE_KEY] = new Map<string, PilotDatabase>()
  }

  const dsn = resolvePostgresDsn()
  const existing = globalCache[NODE_PG_D1_CACHE_KEY]!.get(dsn)
  if (existing) {
    return existing
  }

  const created = createNodePgDatabase(dsn)
  globalCache[NODE_PG_D1_CACHE_KEY]!.set(dsn, created)
  return created
}
