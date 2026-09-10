import type { InValue } from '@libsql/client'
import type {
  SearchIndexReadWorkerRequest,
  SearchIndexReadWorkerResponse
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

function isQueryRequest(value: unknown): value is SearchIndexReadWorkerRequest {
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

async function executeQuery(request: SearchIndexReadWorkerRequest): Promise<void> {
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
}

port.on('message', (message: unknown) => {
  if (!isQueryRequest(message)) return
  void executeQuery(message)
})
