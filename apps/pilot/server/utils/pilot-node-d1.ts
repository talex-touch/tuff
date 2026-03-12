import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const NODE_D1_CACHE_KEY = '__pilotNodeD1Cache'
const DEFAULT_DB_FILE = '.data/pilot.sqlite'

type GlobalNodeD1Cache = typeof globalThis & {
  [NODE_D1_CACHE_KEY]?: Map<string, D1Database>
}

function normalizeParam(value: unknown) {
  if (value === undefined) {
    return null
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return value
}

function toMeta(input: { changes?: number | bigint, lastInsertRowid?: number | bigint } = {}) {
  const changes = Number(input.changes ?? 0)
  const lastInsertRowid = Number(input.lastInsertRowid || 0)
  return {
    duration: 0,
    changes: Number.isFinite(changes) ? changes : 0,
    last_row_id: Number.isFinite(lastInsertRowid) ? lastInsertRowid : 0,
    rows_read: 0,
    rows_written: Number.isFinite(changes) ? changes : 0,
  }
}

class NodeD1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new NodeD1PreparedStatement(this.db, this.sql, values.map(normalizeParam)) as unknown as D1PreparedStatement
  }

  async first<T = unknown>(columnName?: string): Promise<T | null> {
    const statement = this.db.prepare(this.sql)
    const row = statement.get(...(this.params as any[])) as Record<string, unknown> | undefined
    if (!row) {
      return null
    }
    if (columnName) {
      return (row[columnName] as T | undefined) ?? null
    }
    return row as T
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const statement = this.db.prepare(this.sql)
    const info = statement.run(...(this.params as any[]))
    return {
      success: true,
      meta: toMeta(info),
      results: [],
    } as D1Result<T>
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const statement = this.db.prepare(this.sql)
    const rows = statement.all(...(this.params as any[])) as T[]
    return {
      success: true,
      meta: toMeta(),
      results: rows,
    } as D1Result<T>
  }

  getSql(): string {
    return this.sql
  }

  getParams(): unknown[] {
    return [...this.params]
  }

  async raw<T = unknown>(): Promise<Array<T[]>> {
    const statement = this.db.prepare(this.sql)
    const rows = statement.all(...(this.params as any[])) as Record<string, unknown>[]
    return rows.map(row => Object.values(row) as T[])
  }
}

class NodeD1Database {
  constructor(private readonly db: DatabaseSync) {}

  prepare(query: string): D1PreparedStatement {
    return new NodeD1PreparedStatement(this.db, query) as unknown as D1PreparedStatement
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const executable = statements.map((statement) => {
      if (!(statement instanceof NodeD1PreparedStatement)) {
        throw new TypeError('Node D1 adapter only accepts statements created by the same adapter instance.')
      }
      return statement
    })

    this.db.exec('BEGIN')
    try {
      const results: D1Result<T>[] = []
      for (const statement of executable) {
        const info = this.db.prepare(statement.getSql()).run(...(statement.getParams() as any[]))
        results.push({
          success: true,
          meta: toMeta(info),
          results: [],
        } as D1Result<T>)
      }
      this.db.exec('COMMIT')
      return results
    }
    catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async exec(query: string): Promise<{ count: number, duration: number }> {
    this.db.exec(query)
    return {
      count: 0,
      duration: 0,
    }
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('Node D1 adapter does not support dump().')
  }
}

function resolveDbFilePath() {
  const configured = String(process.env.PILOT_DB_FILE || process.env.PILOT_DB_PATH || DEFAULT_DB_FILE).trim()
  return resolve(process.cwd(), configured)
}

function createNodeDatabase(filePath: string): D1Database {
  mkdirSync(dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  return new NodeD1Database(db) as unknown as D1Database
}

export function getNodePilotDatabase(): D1Database {
  const globalCache = globalThis as GlobalNodeD1Cache
  if (!globalCache[NODE_D1_CACHE_KEY]) {
    globalCache[NODE_D1_CACHE_KEY] = new Map<string, D1Database>()
  }

  const filePath = resolveDbFilePath()
  const existing = globalCache[NODE_D1_CACHE_KEY]!.get(filePath)
  if (existing) {
    return existing
  }

  const created = createNodeDatabase(filePath)
  globalCache[NODE_D1_CACHE_KEY]!.set(filePath, created)
  return created
}
