import type { D1Database, D1PreparedStatement, D1Result, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { createEvent } from 'h3'
import { createUser, setUserRole } from '../../server/utils/authStore'
import { signBrowserSessionToken } from '../../server/utils/sessionJwt'

export const TEST_AUTH_SECRET = 'test-nexus-api-auth-secret-32-bytes-minimum!'
export const TEST_ENCRYPT_KEY = 'test-nexus-api-encrypt-key-32-bytes-minimum!'
export const TEST_SECURE_STORE_KEY = 'test-nexus-api-provider-store-key-32-bytes!'

function normalizeBindParam(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === undefined || value === null)
    return null
  if (typeof value === 'boolean')
    return value ? 1 : 0
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return value
  if (value instanceof Uint8Array)
    return value
  return String(value)
}

function isQueryReturningRows(sql: string): boolean {
  const trimmed = sql.trim().replace(/^\/\*[\s\S]*?\*\/\s*/g, '').replace(/^--.*\n/g, '').trim()
  return /^(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed)
}

interface SqlitePrepared extends D1PreparedStatement {
  _sql: string
  _params: Array<string | number | bigint | Uint8Array | null>
  _execForBatch: () => D1Result<Record<string, unknown>>
}

/**
 * Faithful in-memory Cloudflare D1 adapter backed by real Node.js SQLite (`node:sqlite`).
 * Executes real SQL including GROUP BY, COUNT(DISTINCT ...), json_each, ON CONFLICT, and atomic db.batch().
 */
export function createSqliteD1Database(): D1Database & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')

  function runStatement<T = Record<string, unknown>>(
    sql: string,
    params: Array<string | number | bigint | Uint8Array | null>,
  ): D1Result<T> {
    const stmt = sqlite.prepare(sql)
    if (isQueryReturningRows(sql)) {
      const rows = stmt.all(...params) as T[]
      return {
        results: rows,
        success: true,
        meta: {
          duration: 0,
          size_after: 0,
          rows_read: rows.length,
          rows_written: 0,
          last_row_id: 0,
          changed_db: false,
          changes: 0,
        },
      } as D1Result<T>
    }
    const info = stmt.run(...params)
    const changes = Number(info.changes ?? 0)
    const lastRowId = Number(info.lastInsertRowid ?? 0)
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
        last_row_id: lastRowId,
        changed_db: changes > 0,
        changes,
      },
    } as D1Result<T>
  }

  function makePrepared(
    sql: string,
    params: Array<string | number | bigint | Uint8Array | null> = [],
  ): SqlitePrepared {
    const prepared: SqlitePrepared = {
      _sql: sql,
      _params: params,
      _execForBatch() {
        return runStatement(sql, params)
      },
      bind(...values: unknown[]) {
        return makePrepared(sql, values.map(normalizeBindParam))
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const res = runStatement<Record<string, unknown>>(sql, params)
        const row = res.results[0]
        if (!row)
          return null
        if (colName)
          return (row[colName] ?? null) as T | null
        return row as unknown as T
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        return runStatement<T>(sql, params)
      },
      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        return runStatement<T>(sql, params)
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        const res = runStatement<Record<string, unknown>>(sql, params)
        return res.results.map(row => Object.values(row)) as unknown as T[]
      },
    } as unknown as SqlitePrepared
    return prepared
  }

  const db = {
    sqlite,
    prepare(sql: string) {
      return makePrepared(sql)
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(stmt => (stmt as SqlitePrepared)._execForBatch() as D1Result<T>)
        sqlite.exec('COMMIT')
        return results
      }
      catch (error) {
        try {
          sqlite.exec('ROLLBACK')
        }
        catch {
          // ignore rollback error
        }
        throw error
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 1, duration: 0 }
    },
    async dump() {
      return new ArrayBuffer(0)
    },
  } as unknown as D1Database & { sqlite: DatabaseSync }

  return db
}

export function createMemoryKv(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string, options?: unknown) {
      const raw = store.get(key) ?? null
      if (raw === null)
        return null
      const type = typeof options === 'string'
        ? options
        : (options && typeof options === 'object' && 'type' in options ? (options as { type?: string }).type : 'text')
      if (type === 'json')
        return JSON.parse(raw)
      return raw
    },
    async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream) {
      store.set(key, typeof value === 'string' ? value : String(value))
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? ''
      const keys = [...store.keys()]
        .filter(k => !prefix || k.startsWith(prefix))
        .map(name => ({ name }))
      return { keys, list_complete: true, cacheStatus: null }
    },
  } as unknown as KVNamespace & { store: Map<string, string> }
}

export function createMemoryR2(): R2Bucket & { objects: Map<string, { data: Uint8Array, contentType: string, customMetadata?: Record<string, string> }> } {
  const objects = new Map<string, { data: Uint8Array, contentType: string, customMetadata?: Record<string, string> }>()
  return {
    objects,
    async put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null, options?: { httpMetadata?: { contentType?: string }, customMetadata?: Record<string, string> }) {
      let data: Uint8Array
      if (typeof value === 'string')
        data = Buffer.from(value, 'utf8')
      else if (value instanceof Uint8Array)
        data = value
      else if (value instanceof ArrayBuffer)
        data = new Uint8Array(value)
      else if (value && ArrayBuffer.isView(value))
        data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      else
        data = new Uint8Array(0)
      objects.set(key, {
        data,
        contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
        customMetadata: options?.customMetadata,
      })
      return { key, size: data.byteLength }
    },
    async get(key: string) {
      const entry = objects.get(key)
      if (!entry)
        return null
      return {
        key,
        size: entry.data.byteLength,
        httpMetadata: { contentType: entry.contentType },
        customMetadata: entry.customMetadata,
        async arrayBuffer() {
          return entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength)
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(entry.data)
            controller.close()
          },
        }),
      }
    },
    async delete(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key]
      for (const item of keys)
        objects.delete(item)
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? ''
      const list = [...objects.entries()]
        .filter(([k]) => !prefix || k.startsWith(prefix))
        .map(([key, val]) => ({ key, size: val.data.byteLength }))
      return { objects: list, truncated: false, delimitedPrefixes: [] }
    },
  } as unknown as R2Bucket & { objects: Map<string, { data: Uint8Array, contentType: string, customMetadata?: Record<string, string> }> }
}

export interface TestEventOptions {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  params?: Record<string, string>
  db?: D1Database
  kv?: KVNamespace
  r2?: R2Bucket
  env?: Partial<TuffCloudflareBindings>
  cf?: Record<string, unknown>
}

export function createTestEvent(options: TestEventOptions = {}): H3Event {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = (options.method || 'GET').toUpperCase()
  req.url = options.url || '/api/test'

  const normalizedHeaders: Record<string, string> = {
    host: 'tuff.tagzxia.com',
    'x-forwarded-proto': 'https',
  }
  for (const [k, v] of Object.entries(options.headers || {})) {
    normalizedHeaders[k.toLowerCase()] = v
  }

  let bodyBytes: Buffer | null = null
  if (options.body !== undefined) {
    if (typeof options.body === 'string') {
      bodyBytes = Buffer.from(options.body, 'utf8')
    }
    else {
      bodyBytes = Buffer.from(JSON.stringify(options.body), 'utf8')
      if (!normalizedHeaders['content-type'])
        normalizedHeaders['content-type'] = 'application/json'
    }
    normalizedHeaders['content-length'] = String(bodyBytes.byteLength)
  }

  req.headers = normalizedHeaders
  if (bodyBytes) {
    req.push(bodyBytes)
  }
  req.push(null)

  const res = new ServerResponse(req)
  const event = createEvent(req, res)
  if (options.params)
    event.context.params = { ...options.params }

  const cfEnv: TuffCloudflareBindings = {
    DB: options.db,
    TUFF_INTELLIGENCE_RUNTIME: options.kv,
    R2: options.r2,
    AUTH_SECRET: TEST_AUTH_SECRET,
    APP_AUTH_JWT_SECRET: TEST_AUTH_SECRET,
    AUTH_ORIGIN: 'https://tuff.tagzxia.com',
    NUXT_INTELLIGENCE_ENCRYPT_KEY: TEST_ENCRYPT_KEY,
    PROVIDER_REGISTRY_SECURE_STORE_KEY: TEST_SECURE_STORE_KEY,
    NOTIFICATION_WEB_PUSH_PUBLIC_KEY: 'BTestVapidPublicKey1234567890',
    ...(options.env || {}),
  }

  event.context.cloudflare = {
    env: cfEnv,
    request: {
      cf: options.cf || {},
    },
    context: {
      waitUntil: () => {},
    },
  }

  return event
}

export async function seedTestUser(
  db: D1Database,
  input: {
    email: string
    name?: string
    role?: 'admin' | 'user'
  },
) {
  const setupEvent = createTestEvent({ db })
  const user = await createUser(setupEvent, {
    email: input.email,
    name: input.name ?? 'Test User',
    emailVerified: new Date().toISOString(),
    emailState: 'verified',
  })
  if (input.role === 'admin')
    await setUserRole(setupEvent, user.id, 'admin')
  return {
    ...user,
    role: input.role ?? 'user',
  }
}

export async function buildSessionCookieHeader(payload: {
  userId: string
  email: string
  role?: 'admin' | 'user'
  authTime?: number
}): Promise<string> {
  const token = await signBrowserSessionToken(TEST_AUTH_SECRET, {
    userId: payload.userId,
    email: payload.email,
    role: payload.role ?? 'user',
    authTime: payload.authTime ?? Math.floor(Date.now() / 1000),
  })
  return `__Secure-next-auth.session-token=${token}`
}
