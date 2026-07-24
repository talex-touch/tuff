/**
 * Worker thread for SearchIndexService write operations.
 *
 * Opens its own LibSQL connection with WAL mode and creates a
 * SearchIndexService instance in directMode (bypasses DbWriteScheduler
 * and pacing delays since there is no event loop contention here).
 *
 * Handles: atomic provider apply, staged replacement, provider-scoped remove/clear
 * Read operations (search, lookupByKeywords, etc.) stay on the main thread.
 */
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from '../../addon/files/workers/worker-status'
import type {
  AbortProviderReplacementMessage,
  ApplyProviderItemsMessage,
  BeginProviderReplacementMessage,
  CleanupOrphanKeywordsMessage,
  CommitProviderReplacementMessage,
  CountByProviderMessage,
  ExecWriteMessage,
  ExecWriteResult,
  GetProviderReplacementOutcomeMessage,
  InitMessage,
  PersistEntriesMessage,
  RemoveByProviderMessage,
  RemoveFileExtensionsMessage,
  RemoveFileMessage,
  RemoveProviderItemsMessage,
  ShutdownMessage,
  StageProviderReplacementItemsMessage,
  WorkerErrorMessage,
  WorkerResultMessage
} from './search-index-worker-types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  FileIndexPersistenceRepository,
  UpsertFileRecord
} from '../file-index-persistence-repository'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'
import { type Client, createClient, type InValue } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../../../db/schema'
import { createLogger } from '../../../../utils/logger'
import {
  SqliteFileIndexPersistenceRepository,
  withFileIndexPersistenceRetry
} from '../file-index-persistence-repository'
import { noopSearchIndexRuntimeLogger, SearchIndexService } from '../search-index-service'
import { serializeSearchIndexWorkerError } from './search-index-worker-error'

const searchIndexWorkerLog = createLogger('SearchIndex').child('Worker')

export {
  FILE_INDEX_PERSISTENCE_RETRY_LABELS as WORKER_RETRY_LABELS,
  withFileIndexPersistenceRetry as withWorkerWriteRetry
} from '../file-index-persistence-repository'

// ---------- Internal Message Types (not in shared types) ----------

interface UpsertFilesMessage {
  type: 'upsertFiles'
  taskId: string
  records: UpsertFileRecord[]
}

interface UpsertScanProgressMessage {
  type: 'upsertScanProgress'
  taskId: string
  paths: string[]
  lastScanned: string
  sourceId?: string
}

type WorkerRequest =
  | InitMessage
  | ApplyProviderItemsMessage
  | BeginProviderReplacementMessage
  | StageProviderReplacementItemsMessage
  | CommitProviderReplacementMessage
  | AbortProviderReplacementMessage
  | GetProviderReplacementOutcomeMessage
  | RemoveProviderItemsMessage
  | RemoveByProviderMessage
  | CountByProviderMessage
  | PersistEntriesMessage
  | UpsertFilesMessage
  | UpsertScanProgressMessage
  | RemoveFileMessage
  | RemoveFileExtensionsMessage
  | CleanupOrphanKeywordsMessage
  | ShutdownMessage
  | ExecWriteMessage
  | WorkerMetricsRequest

// ---------- Worker State ----------

let searchIndex: SearchIndexService | null = null
let db: LibSQLDatabase<typeof schema> | null = null
let client: Client | null = null
let filePersistenceRepository: FileIndexPersistenceRepository | null = null
let initialized = false

// Serial queue to avoid concurrent DB access within this worker
const queue: WorkerRequest[] = []
let running = false

// ---------- Queue Processing ----------

async function processQueue(): Promise<void> {
  if (running) return
  running = true

  while (queue.length > 0) {
    const message = queue.shift()!
    await handleMessage(message)
  }

  running = false
}

async function handleMessage(message: WorkerRequest): Promise<void> {
  if (message.type === 'metrics') {
    respondMetrics(message)
    return
  }

  const { taskId } = message

  try {
    switch (message.type) {
      case 'init':
        await handleInit(message)
        respond({ type: 'result', taskId })
        break

      case 'applyProviderItems':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.applyProviderItems(
            message.providerId,
            message.items,
            message.legacyItemIds
          )
        })
        break

      case 'beginProviderReplacement':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.beginProviderReplacement(message.providerId, message.replacementId)
        respond({ type: 'result', taskId })
        break

      case 'stageProviderReplacementItems':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.stageProviderReplacementItems(
            message.providerId,
            message.replacementId,
            message.items
          )
        })
        break

      case 'commitProviderReplacement':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.commitProviderReplacement(
            message.providerId,
            message.replacementId
          )
        })
        break

      case 'abortProviderReplacement':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.abortProviderReplacement(message.providerId, message.replacementId)
        respond({ type: 'result', taskId })
        break

      case 'getProviderReplacementOutcome':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.getProviderReplacementOutcome(
            message.providerId,
            message.replacementId
          )
        })
        break

      case 'removeProviderItems': {
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        const removedItems = await searchIndex.removeProviderItems(
          message.providerId,
          message.itemIds
        )
        respond({ type: 'result', taskId, result: removedItems })
        break
      }

      case 'removeByProvider':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.removeByProvider(message.providerId)
        })
        break

      case 'countByProvider': {
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        const count = await searchIndex.countByProvider(message.providerId)
        respond({ type: 'result', taskId, result: count })
        break
      }

      case 'persistEntries': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        respond({
          type: 'result',
          taskId,
          result: await filePersistenceRepository.persistEntries(message.entries)
        })
        break
      }

      case 'upsertFiles': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        respond({
          type: 'result',
          taskId,
          result: await filePersistenceRepository.upsertFiles(message.records)
        })
        break
      }

      case 'upsertScanProgress': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        respond({
          type: 'result',
          taskId,
          result: await filePersistenceRepository.upsertScanProgress(
            message.paths,
            message.lastScanned,
            message.sourceId
          )
        })
        break
      }

      case 'removeFile': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        await filePersistenceRepository.removeFile(message.path)
        searchIndexWorkerLog.debug('Removed file', { meta: { path: message.path } })
        respond({ type: 'result', taskId })
        break
      }

      case 'removeFileExtensions': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        await filePersistenceRepository.removeFileExtensions(message.fileId, message.keys)
        searchIndexWorkerLog.debug('Removed file extensions', {
          meta: { fileId: message.fileId, keys: message.keys.join(',') }
        })
        respond({ type: 'result', taskId })
        break
      }

      case 'cleanupOrphanKeywords': {
        if (!db) throw new Error('Worker not initialized — send init first')
        const deletedCount = await handleCleanupOrphanKeywords(message)
        respond({ type: 'result', taskId, result: deletedCount })
        break
      }

      case 'shutdown':
        await handleShutdown()
        respond({ type: 'result', taskId })
        break

      case 'execWrite':
        respond({ type: 'result', taskId, result: await handleExecWrite(message) })
        break

      default:
        respond({ type: 'error', taskId, error: { message: `Unknown message type` } })
    }
  } catch (error) {
    respond({ type: 'error', taskId, error: serializeSearchIndexWorkerError(error) })
  }
}

/**
 * Finalize and close the worker's DB connection. Runs through the serial queue,
 * so it executes after any in-flight write. Checkpointing (TRUNCATE) flushes the
 * WAL into the main db and `close()` releases the connection cleanly before the
 * parent terminates the thread — closing the abrupt-terminate corruption window.
 */
async function handleExecWrite(message: ExecWriteMessage): Promise<ExecWriteResult[]> {
  if (!client) throw new Error('Worker not initialized — send init first')

  const statements = message.statements
    .filter((statement) => typeof statement?.sql === 'string' && statement.sql.length > 0)
    .map((statement) => ({
      sql: statement.sql,
      args: (statement.args ?? []) as InValue[]
    }))
  if (statements.length === 0) return []

  const toResult = (resultSet: {
    rowsAffected: number
    lastInsertRowid?: bigint | null
    columns: string[]
    rows: unknown[]
  }): ExecWriteResult => ({
    rowsAffected: resultSet.rowsAffected,
    lastInsertRowid: resultSet.lastInsertRowid != null ? String(resultSet.lastInsertRowid) : null,
    rows: resultSet.rows.map((row) => {
      const record: Record<string, unknown> = {}
      resultSet.columns.forEach((column, index) => {
        record[column] = (row as unknown as unknown[])[index]
      })
      return record
    })
  })

  // 'transaction' wraps the statements in one atomic BEGIN/COMMIT so multi-table
  // writes (e.g. a file row + its extensions) can't tear; 'single' autocommits
  // each statement. Both run on the worker's connection — the sole writer.
  if (message.mode === 'transaction' && statements.length > 1) {
    const resultSets = await client.batch(statements, 'write')
    return resultSets.map(toResult)
  }

  const results: ExecWriteResult[] = []
  for (const statement of statements) {
    results.push(toResult(await client.execute(statement)))
  }
  return results
}

async function handleShutdown(): Promise<void> {
  const closing = client
  client = null
  db = null
  searchIndex = null
  filePersistenceRepository = null
  initialized = false
  if (!closing) return
  try {
    await closing.execute('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => undefined)
    closing.close()
  } catch (error) {
    searchIndexWorkerLog.warn('Worker DB close during shutdown failed', { error })
  }
}

async function handleInit(message: InitMessage): Promise<void> {
  if (initialized && searchIndex) {
    // Already initialized — allow re-init with same path
    return
  }

  const { dbPath } = message

  const workerClient = createClient({ url: `file:${dbPath}` })
  client = workerClient

  // Apply WAL mode and performance pragmas — same as main thread
  const journalModeResult = await workerClient.execute('PRAGMA journal_mode = WAL')
  const journalMode = String(
    (journalModeResult.rows?.[0] as Record<string, unknown> | undefined)?.journal_mode ?? ''
  ).toLowerCase()
  if (journalMode !== 'wal') {
    // This connection shares database.db with the main-thread connection.
    // Mismatched journal modes across the two is a direct corruption path.
    searchIndexWorkerLog.error('Worker DB did not enter WAL mode', {
      meta: { journalMode }
    })
  }
  await workerClient.execute('PRAGMA busy_timeout = 30000')
  await workerClient.execute('PRAGMA synchronous = NORMAL')
  await workerClient.execute('PRAGMA locking_mode = NORMAL')
  // Disable mmap on the worker connection. The worker is force-terminated
  // (worker.terminate(), no close) on idle/shutdown/error; tearing down a large
  // memory-mapped write region mid-write is SQLite's classic corruption
  // amplifier. This write-heavy indexing path gains little from mmap.
  await workerClient.execute('PRAGMA mmap_size = 0')

  const workerDb = drizzle(workerClient, { schema })

  db = workerDb
  filePersistenceRepository = new SqliteFileIndexPersistenceRepository(workerDb)
  searchIndex = new SearchIndexService(workerDb, {
    directMode: true,
    logger: noopSearchIndexRuntimeLogger
  })
  await searchIndex.warmup()
  initialized = true

  searchIndexWorkerLog.info('Initialized', {
    meta: { dbPathLength: dbPath.length }
  })
}

/** Persist file content, embeddings, and progress rows in one transaction. */
async function handleCleanupOrphanKeywords(message: CleanupOrphanKeywordsMessage): Promise<number> {
  if (!db) throw new Error('Worker not initialized')
  const { sourceId } = message

  const workerDb = db
  const result = await withFileIndexPersistenceRetry(async () => {
    return await workerDb.run(sql`
        DELETE FROM keyword_mappings
        WHERE provider_id = ${sourceId}
          AND item_id NOT IN (
            SELECT item_id FROM search_index WHERE provider = ${sourceId}
          )
      `)
  }, 'worker.cleanupOrphanKeywords')

  const deletedCount = result.rowsAffected ?? 0
  searchIndexWorkerLog.info('Cleaned orphan keywords', {
    meta: { sourceId, deletedCount }
  })
  return deletedCount
}

// ---------- Communication ----------

function respond(message: WorkerResultMessage | WorkerErrorMessage): void {
  parentPort?.postMessage(message)
}

function respondMetrics(request: WorkerMetricsRequest): void {
  const mem = process.memoryUsage()
  const cpu = process.cpuUsage()
  const metrics: WorkerMetricsPayload = {
    timestamp: Date.now(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers
    },
    cpuUsage: {
      user: cpu.user,
      system: cpu.system
    },
    eventLoop: null
  }
  const response: WorkerMetricsResponse = {
    type: 'metrics',
    requestId: request.requestId,
    metrics
  }
  parentPort?.postMessage(response)
}

// ---------- Entry Point ----------

parentPort?.on('message', (message: WorkerRequest) => {
  queue.push(message)
  void processQueue()
})
