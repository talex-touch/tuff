import type { Client, InValue } from '@libsql/client'
import type {
  PluginSqliteExecuteResult,
  PluginSqliteWorkerRequest,
  PluginSqliteWorkerResponse,
  PluginSqliteWorkerResult
} from './plugin-sqlite-worker-protocol'
import { Buffer } from 'node:buffer'
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { createClient } from '@libsql/client'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import {
  normalizePluginSqlForExecution,
  PluginSqlPolicyError,
  validatePluginSql,
  validatePluginSqlParams,
  validatePluginTransactionStatements
} from './plugin-sql-policy'
import {
  PLUGIN_SQLITE_MAX_DATABASE_BYTES,
  PLUGIN_SQLITE_MAX_HEAP_BYTES,
  PLUGIN_SQLITE_MAX_JOURNAL_BYTES,
  PLUGIN_SQLITE_MAX_RESULT_BYTES,
  PLUGIN_SQLITE_MAX_ROWS
} from './plugin-sqlite-worker-protocol'

const databasePathInput = (workerData as { databasePath?: unknown })?.databasePath
if (!parentPort || typeof databasePathInput !== 'string' || !databasePathInput) {
  throw new Error('PLUGIN_SQLITE_WORKER_INVALID_INIT')
}

const databasePath = databasePathInput
const port = parentPort
let clientPromise: Promise<Client> | null = null
let operationTail = Promise.resolve()

function storageFailure(
  code:
    | typeof PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED
    | typeof PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT
): Error {
  return Object.assign(new Error(code), { storageCode: code })
}

async function assertSafeDatabasePath(requireDatabase: boolean): Promise<void> {
  const dataPath = path.dirname(databasePath)
  if (!path.isAbsolute(databasePath) || path.resolve(databasePath) !== databasePath) {
    throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT)
  }

  const dataStat = await lstat(dataPath)
  if (dataStat.isSymbolicLink() || !dataStat.isDirectory()) {
    throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED)
  }
  if ((await realpath(dataPath)) !== dataPath) {
    throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT)
  }

  const databaseStat = await lstat(databasePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!databaseStat) {
    if (requireDatabase) throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT)
    return
  }
  if (databaseStat.isSymbolicLink() || !databaseStat.isFile()) {
    throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED)
  }
  if ((await realpath(databasePath)) !== databasePath) {
    throw storageFailure(PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT)
  }
}

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Promise.resolve().then(async () => {
      await assertSafeDatabasePath(false)
      const client = createClient({ url: `file:${databasePath}` })
      try {
        await assertSafeDatabasePath(true)
        if ((await currentDatabaseBytes()) > PLUGIN_SQLITE_MAX_DATABASE_BYTES) {
          throw Object.assign(new Error('quota'), {
            storageCode: PLUGIN_STORAGE_ERROR_CODES.DISK_QUOTA
          })
        }
        const pageSizeResult = await client.execute('PRAGMA page_size')
        const rawPageSize = pageSizeResult.rows[0]
          ? Object.values(pageSizeResult.rows[0] as Record<string, unknown>)[0]
          : undefined
        const pageSize = Number(rawPageSize)
        if (!Number.isInteger(pageSize) || pageSize <= 0) {
          throw new Error('PLUGIN_SQLITE_INVALID_PAGE_SIZE')
        }
        const maxPageCount = Math.max(1, Math.floor(PLUGIN_SQLITE_MAX_DATABASE_BYTES / pageSize))
        const maxPageCountResult = await client.execute(`PRAGMA max_page_count = ${maxPageCount}`)
        const effectiveMaxPageCount = Number(
          maxPageCountResult.rows[0]
            ? Object.values(maxPageCountResult.rows[0] as Record<string, unknown>)[0]
            : undefined
        )
        if (!Number.isInteger(effectiveMaxPageCount) || effectiveMaxPageCount > maxPageCount) {
          throw Object.assign(new Error('quota'), {
            storageCode: PLUGIN_STORAGE_ERROR_CODES.DISK_QUOTA
          })
        }
        await client.execute(`PRAGMA journal_size_limit = ${PLUGIN_SQLITE_MAX_JOURNAL_BYTES}`)
        const heapLimitResult = await client.execute(
          `PRAGMA hard_heap_limit = ${PLUGIN_SQLITE_MAX_HEAP_BYTES}`
        )
        const effectiveHeapLimit = Number(
          heapLimitResult.rows[0]
            ? Object.values(heapLimitResult.rows[0] as Record<string, unknown>)[0]
            : undefined
        )
        if (
          !Number.isInteger(effectiveHeapLimit) ||
          effectiveHeapLimit > PLUGIN_SQLITE_MAX_HEAP_BYTES
        ) {
          throw new Error('PLUGIN_SQLITE_INVALID_HEAP_LIMIT')
        }
        await assertSafeDatabasePath(true)
        return client
      } catch (error) {
        client.close()
        throw error
      }
    })
  }
  return clientPromise
}

function normalizeParams(params: unknown[]): InValue[] {
  return params.map((value) => {
    if (value === undefined) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'bigint') return Number(value)
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    if (typeof value === 'object' && value !== null) return JSON.stringify(value)
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return value
    }
    return String(value)
  })
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Uint8Array) return Array.from(value)
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value))
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  return value
}

function normalizeLastInsertRowId(value: unknown): number | null {
  if (typeof value === 'bigint') return Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function executeResult(result: {
  rowsAffected?: number
  lastInsertRowid?: unknown
}): PluginSqliteExecuteResult {
  return {
    rowsAffected: Number(result.rowsAffected ?? 0),
    lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid)
  }
}

async function currentDatabaseBytes(): Promise<number> {
  let total = 0
  for (const target of [databasePath, `${databasePath}-wal`, `${databasePath}-journal`]) {
    total += await stat(target)
      .then((entry) => entry.size)
      .catch(() => 0)
  }
  return total
}

async function enforceDiskQuota(client: Client): Promise<void> {
  await client.execute('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => undefined)
  if ((await currentDatabaseBytes()) > PLUGIN_SQLITE_MAX_DATABASE_BYTES) {
    throw Object.assign(new Error('quota'), { storageCode: PLUGIN_STORAGE_ERROR_CODES.DISK_QUOTA })
  }
}

function ensureBoundedResult(result: unknown): void {
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > PLUGIN_SQLITE_MAX_RESULT_BYTES) {
    throw Object.assign(new Error('result'), {
      storageCode: PLUGIN_STORAGE_ERROR_CODES.RESULT_TOO_LARGE
    })
  }
}

async function handleRequest(request: PluginSqliteWorkerRequest): Promise<void> {
  try {
    const operation = request.operation
    if (operation.type === 'query') {
      validatePluginSql(operation.sql, 'query')
      validatePluginSqlParams(operation.params)
      operation.sql = normalizePluginSqlForExecution(operation.sql)
    } else if (operation.type === 'execute') {
      validatePluginSql(operation.sql, 'execute')
      validatePluginSqlParams(operation.params)
      operation.sql = normalizePluginSqlForExecution(operation.sql)
    } else {
      validatePluginTransactionStatements(operation.statements)
      operation.statements = operation.statements.map((statement) => ({
        sql: normalizePluginSqlForExecution(statement.sql),
        params: validatePluginSqlParams(statement.params)
      }))
    }

    const client = await getClient()
    await assertSafeDatabasePath(true)

    if (operation.type === 'execute') {
      const result = await client.execute({
        sql: operation.sql,
        args: normalizeParams(operation.params)
      })
      await enforceDiskQuota(client)
      await assertSafeDatabasePath(true)
      postResult(request.requestId, executeResult(result))
      return
    }

    if (operation.type === 'query') {
      const boundedSql = `SELECT * FROM (${operation.sql}) AS __tuff_plugin_query LIMIT ${PLUGIN_SQLITE_MAX_ROWS + 1}`
      const result = await client.execute({
        sql: boundedSql,
        args: normalizeParams(operation.params)
      })
      await assertSafeDatabasePath(true)
      if (result.rows.length > PLUGIN_SQLITE_MAX_ROWS) {
        postError(
          request.requestId,
          PLUGIN_STORAGE_ERROR_CODES.ROW_LIMIT,
          'Plugin SQLite row limit exceeded.'
        )
        return
      }
      const normalized = {
        rows: result.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).map(([key, value]) => [
              key,
              normalizeValue(value)
            ])
          )
        ),
        columns: Array.isArray(result.columns) ? result.columns : []
      }
      ensureBoundedResult(normalized)
      postResult(request.requestId, normalized)
      return
    }

    const results: PluginSqliteExecuteResult[] = []
    await client.execute('BEGIN IMMEDIATE')
    try {
      for (const statement of operation.statements) {
        const result = await client.execute({
          sql: statement.sql,
          args: normalizeParams(statement.params)
        })
        results.push(executeResult(result))
      }
      await client.execute('COMMIT')
    } catch (error) {
      await client.execute('ROLLBACK').catch(() => undefined)
      throw error
    }
    await enforceDiskQuota(client)
    await assertSafeDatabasePath(true)
    postResult(request.requestId, { results })
  } catch (error) {
    if (error instanceof PluginSqlPolicyError) {
      postError(request.requestId, error.code, error.message)
      return
    }
    const storageCode =
      error && typeof error === 'object' && 'storageCode' in error
        ? (error as { storageCode: string }).storageCode
        : ''
    if (storageCode === PLUGIN_STORAGE_ERROR_CODES.RESULT_TOO_LARGE) {
      postError(
        request.requestId,
        PLUGIN_STORAGE_ERROR_CODES.RESULT_TOO_LARGE,
        'Plugin SQLite result exceeds the byte limit.'
      )
      return
    }
    if (
      request.operation.type === 'query' &&
      error instanceof Error &&
      /out of memory|SQLITE_NOMEM/i.test(error.message)
    ) {
      postError(
        request.requestId,
        PLUGIN_STORAGE_ERROR_CODES.RESULT_TOO_LARGE,
        'Plugin SQLite result exceeds the byte limit.'
      )
      return
    }
    if (
      storageCode === PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED ||
      storageCode === PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT
    ) {
      postError(
        request.requestId,
        storageCode,
        storageCode === PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED
          ? 'Plugin SQLite path cannot be a symbolic link.'
          : 'Plugin SQLite path is outside the plugin root.'
      )
      return
    }
    if (
      storageCode === PLUGIN_STORAGE_ERROR_CODES.DISK_QUOTA ||
      (error instanceof Error && /database or disk is full|SQLITE_FULL/i.test(error.message))
    ) {
      postError(
        request.requestId,
        PLUGIN_STORAGE_ERROR_CODES.DISK_QUOTA,
        'Plugin SQLite database quota exceeded.'
      )
      return
    }
    postError(
      request.requestId,
      PLUGIN_STORAGE_ERROR_CODES.SQLITE_UNAVAILABLE,
      'Plugin SQLite operation failed.'
    )
  }
}

function postResult(requestId: string, result: PluginSqliteWorkerResult): void {
  port.postMessage({ type: 'result', requestId, result } satisfies PluginSqliteWorkerResponse)
}

function postError(
  requestId: string,
  code: (typeof PLUGIN_STORAGE_ERROR_CODES)[keyof typeof PLUGIN_STORAGE_ERROR_CODES],
  error: string
): void {
  port.postMessage({ type: 'error', requestId, code, error } satisfies PluginSqliteWorkerResponse)
}

port.on('message', (request: PluginSqliteWorkerRequest) => {
  operationTail = operationTail.then(() => handleRequest(request))
})
