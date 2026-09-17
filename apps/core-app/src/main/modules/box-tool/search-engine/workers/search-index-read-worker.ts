import type { InValue } from '@libsql/client'
import type {
  SearchIndexReadWorkerQueryMessage,
  SearchIndexReadWorkerResponse,
  SearchIndexReadWorkerShutdownMessage
} from './search-index-read-worker-types'
import { lstat } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { createClient, type Client } from '@libsql/client'
import { serializeSearchIndexWorkerError } from './search-index-worker-error'

const databasePath =
  workerData &&
  typeof workerData === 'object' &&
  'databasePath' in workerData &&
  typeof workerData.databasePath === 'string'
    ? workerData.databasePath
    : null
if (!parentPort || !databasePath) {
  throw new Error('SEARCH_INDEX_READ_WORKER_INVALID_INIT')
}

const port = parentPort
let clientPromise: Promise<Client> | null = null
let closing: Promise<void> | null = null
/** Settles when the query the reader is running has left the native client. */
let activeQuery: Promise<void> = Promise.resolve()

async function assertExistingRegularDatabaseFile(): Promise<void> {
  const stat = await lstat(databasePath)
  if (!stat.isFile()) {
    throw new Error('SEARCH_INDEX_READ_WORKER_DATABASE_NOT_REGULAR_FILE')
  }
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Promise.resolve().then(async () => {
      // libSQL opens a missing `file:` target by creating it. Assert first so a
      // reader cannot accidentally become a second database initializer.
      await assertExistingRegularDatabaseFile()
      const nextClient = createClient({ url: `file:${databasePath}`, concurrency: 1 })
      try {
        await nextClient.execute('PRAGMA query_only = ON')
        return nextClient
      } catch (error) {
        nextClient.close()
        throw error
      }
    })
  }
  return await clientPromise
}

function isQueryRequest(value: unknown): value is SearchIndexReadWorkerQueryMessage {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    !('requestId' in value) ||
    !('sql' in value) ||
    !('args' in value)
  ) {
    return false
  }
  return (
    value.type === 'query' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.sql === 'string' &&
    Array.isArray(value.args)
  )
}

function post(message: SearchIndexReadWorkerResponse): void {
  port.postMessage(message)
}

function executeQuery(request: SearchIndexReadWorkerQueryMessage): void {
  const run = (async () => {
    try {
      const client = await getClient()
      const result = await client.execute({ sql: request.sql, args: request.args as InValue[] })
      // ResultSet rows have a null prototype in some libSQL versions. Project
      // them into ordinary records before crossing the worker boundary.
      post({
        type: 'result',
        requestId: request.requestId,
        rows: result.rows.map((row) => ({ ...row }))
      })
    } catch (error) {
      post({
        type: 'error',
        requestId: request.requestId,
        error: serializeSearchIndexWorkerError(error)
      })
    }
  })()

  activeQuery = run
  void run
}

/**
 * Close the reading connection and leave the thread.
 *
 * The parent must never terminate this thread while a query is in flight: tearing it down
 * mid-query makes libSQL's native client abort the entire process (neon asserts on the pending
 * exception, surfacing as SIGABRT from `sys/external.rs`). So the parent asks for this instead and
 * the connection is closed only once the running query has settled. Nothing else is queued by
 * then, so exiting here - rather than waiting for a native thread to let the loop drain - is what
 * actually ends a retired reader.
 */
async function shutdown(): Promise<void> {
  if (!closing) {
    closing = (async () => {
      await activeQuery.catch(() => undefined)
      const pending = clientPromise
      clientPromise = null
      const client = await (pending ?? Promise.resolve(null)).catch(() => null)
      try {
        client?.close()
      } catch {
        // The reader is leaving either way; a close failure only costs the file handle.
      }
      port.close()
      process.exit(0)
    })()
  }
  await closing
}

function isShutdownRequest(value: unknown): value is SearchIndexReadWorkerShutdownMessage {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'shutdown'
}

port.on('message', (message: unknown) => {
  if (closing) return
  if (isShutdownRequest(message)) {
    void shutdown()
    return
  }
  if (!isQueryRequest(message)) return
  executeQuery(message)
})
