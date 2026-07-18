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
  GetProviderReplacementOutcomeMessage,
  InitMessage,
  PersistEntriesMessage,
  RemoveByProviderMessage,
  RemoveFileExtensionsMessage,
  RemoveFileMessage,
  RemoveProviderItemsMessage,
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
import { createClient } from '@libsql/client'
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
  | WorkerMetricsRequest

// ---------- Worker State ----------

let searchIndex: SearchIndexService | null = null
let db: LibSQLDatabase<typeof schema> | null = null
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

      default:
        respond({ type: 'error', taskId, error: { message: `Unknown message type` } })
    }
  } catch (error) {
    respond({ type: 'error', taskId, error: serializeSearchIndexWorkerError(error) })
  }
}

async function handleInit(message: InitMessage): Promise<void> {
  if (initialized && searchIndex) {
    // Already initialized — allow re-init with same path
    return
  }

  const { dbPath } = message

  const client = createClient({ url: `file:${dbPath}` })

  // Apply WAL mode and performance pragmas — same as main thread
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA busy_timeout = 30000')
  await client.execute('PRAGMA synchronous = NORMAL')
  await client.execute('PRAGMA locking_mode = NORMAL')
  await client.execute('PRAGMA mmap_size = 268435456')

  const workerDb = drizzle(client, { schema })

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
