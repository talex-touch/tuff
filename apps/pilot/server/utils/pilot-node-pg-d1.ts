import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types'
import process from 'node:process'
import { Pool } from 'pg'

const NODE_PG_D1_CACHE_KEY = '__pilotNodePgD1Cache'

type GlobalNodePgD1Cache = typeof globalThis & {
  [NODE_PG_D1_CACHE_KEY]?: Map<string, D1Database>
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

  bind(...values: unknown[]): D1PreparedStatement {
    return new NodePgPreparedStatement(this.pool, this.sql, values.map(normalizeParam)) as unknown as D1PreparedStatement
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

  async run<T = unknown>(): Promise<D1Result<T>> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    return {
      success: true,
      meta: toMeta({ rowCount: query.rowCount }),
      results: [],
    } as D1Result<T>
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const query = await this.pool.query(toPgSql(this.sql), this.params as any[])
    return {
      success: true,
      meta: toMeta({ rowCount: query.rowCount }),
      results: query.rows as T[],
    } as D1Result<T>
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

  prepare(query: string): D1PreparedStatement {
    return new NodePgPreparedStatement(this.pool, query) as unknown as D1PreparedStatement
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const executable = statements.map((statement) => {
      if (!(statement instanceof NodePgPreparedStatement)) {
        throw new TypeError('Node PG D1 adapter only accepts statements created by the same adapter instance.')
      }
      return statement
    })

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const results: D1Result<T>[] = []
      for (const statement of executable) {
        const query = await client.query(toPgSql(statement.getSql()), statement.getParams() as any[])
        results.push({
          success: true,
          meta: toMeta({ rowCount: query.rowCount }),
          results: [],
        } as D1Result<T>)
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
  const dsn = String(
    process.env.PILOT_POSTGRES_URL
    || process.env.PILOT_PG_DSN
    || process.env.DATABASE_URL
    || '',
  ).trim()
  if (!dsn) {
    throw new Error('Postgres mode requires PILOT_POSTGRES_URL (or PILOT_PG_DSN / DATABASE_URL).')
  }
  return dsn
}

function createNodePgDatabase(dsn: string): D1Database {
  const max = Number(process.env.PILOT_POSTGRES_POOL_MAX || 10)
  const pool = new Pool({
    connectionString: dsn,
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 10,
  })
  return new NodePgDatabase(pool) as unknown as D1Database
}

export function getNodePilotPostgresDatabase(): D1Database {
  const globalCache = globalThis as GlobalNodePgD1Cache
  if (!globalCache[NODE_PG_D1_CACHE_KEY]) {
    globalCache[NODE_PG_D1_CACHE_KEY] = new Map<string, D1Database>()
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
