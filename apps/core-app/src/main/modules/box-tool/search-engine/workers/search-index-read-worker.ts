import type { InValue } from '@libsql/client'
import type {
  SearchIndexReadWorkerQueryMessage,
  SearchIndexReadWorkerResponse,
  SearchIndexReadWorkerSemanticMessage,
  SearchIndexSemanticMatch,
  SearchIndexReadWorkerShutdownMessage
} from './search-index-read-worker-types'
import { lstat } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { createClient, type Client } from '@libsql/client'
import { serializeSearchIndexWorkerError } from './search-index-worker-error'
import { readStoredVector } from '../../../../db/embedding-vector-codec'

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

function isSemanticRequest(value: unknown): value is SearchIndexReadWorkerSemanticMessage {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<SearchIndexReadWorkerSemanticMessage>
  return (
    request.type === 'semantic-search' &&
    typeof request.requestId === 'string' &&
    Array.isArray(request.vector) &&
    typeof request.model === 'string' &&
    typeof request.limit === 'number' &&
    request.cancelFlag instanceof SharedArrayBuffer
  )
}

async function rankSemanticFiles(
  client: Client,
  request: SearchIndexReadWorkerSemanticMessage
): Promise<SearchIndexSemanticMatch[]> {
  const { vector, model } = request
  const limit = Number.isFinite(request.limit) ? Math.max(0, Math.floor(request.limit)) : 0
  if (!limit || !model || !vector.length || !vector.every(Number.isFinite)) return []
  const cancelled = new Int32Array(request.cancelFlag)
  let queryNorm = 0
  for (const value of vector) queryNorm += value * value
  if (!Number.isFinite(queryNorm) || queryNorm <= 0) return []
  queryNorm = Math.sqrt(queryNorm)
  const bestByFile = new Map<string, SearchIndexSemanticMatch>()
  let cursor = 0
  for (;;) {
    if (Atomics.load(cancelled, 0)) return []
    const result = await client.execute({
      sql: 'SELECT id, source_id, embedding, content_hash FROM embeddings WHERE source_type = ? AND model = ? AND id > ? ORDER BY id LIMIT 128',
      args: ['file', model, cursor]
    })
    for (const row of result.rows) {
      if (Atomics.load(cancelled, 0)) return []
      cursor = Number(row.id)
      if (typeof row.source_id !== 'string') continue
      const candidate = readStoredVector(row.embedding, vector.length)
      if (!candidate) continue
      let dot = 0
      let norm = 0
      for (let index = 0; index < vector.length; index++) {
        const value = candidate[index]!
        dot += vector[index] * value
        norm += value * value
      }
      const score = dot / (queryNorm * Math.sqrt(norm))
      if (
        !Number.isFinite(score) ||
        score <= 0.3 ||
        score <= (bestByFile.get(row.source_id)?.score ?? -1)
      )
        continue
      bestByFile.set(row.source_id, {
        sourceId: row.source_id,
        score,
        contentHash: typeof row.content_hash === 'string' ? row.content_hash : null
      })
      if (bestByFile.size > limit) {
        let worst: SearchIndexSemanticMatch | undefined
        for (const entry of bestByFile.values())
          if (!worst || entry.score < worst.score) worst = entry
        if (worst) bestByFile.delete(worst.sourceId)
      }
    }
    if (result.rows.length < 128) break
    // Let graceful shutdown and queued port messages run between bounded pages.
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  return [...bestByFile.values()].sort((left, right) => right.score - left.score)
}

function post(message: SearchIndexReadWorkerResponse): void {
  port.postMessage(message)
}

function executeQuery(
  request: SearchIndexReadWorkerQueryMessage | SearchIndexReadWorkerSemanticMessage
): void {
  const run = (async () => {
    try {
      const client = await getClient()
      const rows =
        request.type === 'semantic-search'
          ? await rankSemanticFiles(client, request)
          : (await client.execute({ sql: request.sql, args: request.args as InValue[] })).rows
      // Project libSQL's null-prototype records before crossing the boundary.
      post({
        type: 'result',
        requestId: request.requestId,
        rows: rows.map((row) => ({ ...row }))
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
  if (!isQueryRequest(message) && !isSemanticRequest(message)) return
  executeQuery(message)
})
