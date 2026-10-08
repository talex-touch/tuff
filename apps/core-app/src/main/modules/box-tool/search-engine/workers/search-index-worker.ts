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
  ListPendingFileDeletionCommitsMessage,
  AcknowledgeFileDeletionCommitsMessage,
  BeginProviderReplacementMessage,
  CleanupOrphanKeywordsMessage,
  RunIndexMaintenanceSliceMessage,
  AcknowledgeIndexMaintenanceCommitMessage,
  CommitProviderReplacementMessage,
  CountByProviderMessage,
  ExecWriteMessage,
  ExecWriteResult,
  GetProviderReplacementOutcomeMessage,
  InitMessage,
  PersistAndApplyProviderItemsMessage,
  PersistAndApplyProviderItemsResult,
  PersistEntriesMessage,
  RemoveByProviderMessage,
  RemoveFileExtensionsMessage,
  RemoveFileRecordsMessage,
  RemoveMissingFileSearchRecordsMessage,
  RemoveProviderItemsMessage,
  ShutdownMessage,
  StageProviderReplacementItemsMessage,
  WorkerErrorMessage,
  WorkerResultMessage,
  VacuumMessage,
  VacuumResult
} from './search-index-worker-types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  FileIndexPersistenceRepository,
  FileMetadataUpdateRecord,
  UpsertFileRecord
} from '../file-index-persistence-repository'
import { stat, statfs } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { performance } from 'node:perf_hooks'
import { parentPort } from 'node:worker_threads'
import { type Client, createClient, type InValue } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../../../db/schema'
import { createLogger } from '../../../../utils/logger'
import { resolveSearchIndexCompactionDecision } from '../search-index-compaction'
import {
  FILE_INDEX_PERSISTENCE_RETRY_LABELS,
  listPendingFileDeletionCommitsInHome,
  acknowledgeFileDeletionCommitsInHome,
  removeFileRecordsInTransaction,
  removeMissingFileSearchRecordsInTransaction,
  SqliteFileIndexPersistenceRepository,
  withFileIndexPersistenceRetry
} from '../file-index-persistence-repository'
import { noopSearchIndexRuntimeLogger, SearchIndexService } from '../search-index-service'
import { serializeSearchIndexWorkerError } from './search-index-worker-error'
import { getWorkerMemorySnapshot } from '../../addon/files/workers/worker-status'

const searchIndexWorkerLog = createLogger('SearchIndex').child('Worker')

interface CpuUsageSnapshot {
  user: number
  system: number
}

const threadCpuUsage = (
  process as unknown as {
    threadCpuUsage?: (previousValue?: CpuUsageSnapshot) => CpuUsageSnapshot
  }
).threadCpuUsage

function readWorkerCpuUsage(previousValue?: CpuUsageSnapshot): CpuUsageSnapshot {
  return threadCpuUsage
    ? threadCpuUsage.call(process, previousValue)
    : process.cpuUsage(previousValue)
}

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

interface UpdateFileMetadataMessage {
  type: 'updateFileMetadata'
  taskId: string
  records: FileMetadataUpdateRecord[]
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
  | PersistAndApplyProviderItemsMessage
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
  | UpdateFileMetadataMessage
  | UpsertScanProgressMessage
  | RemoveFileRecordsMessage
  | RemoveMissingFileSearchRecordsMessage
  | ListPendingFileDeletionCommitsMessage
  | AcknowledgeFileDeletionCommitsMessage
  | RemoveFileExtensionsMessage
  | CleanupOrphanKeywordsMessage
  | RunIndexMaintenanceSliceMessage
  | AcknowledgeIndexMaintenanceCommitMessage
  | ShutdownMessage
  | ExecWriteMessage
  | VacuumMessage
  | WorkerMetricsRequest

// ---------- Worker State ----------

let searchIndex: SearchIndexService | null = null
let db: LibSQLDatabase<typeof schema> | null = null
let client: Client | null = null
let dbFilePath: string | null = null
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
      case 'persistAndApplyProviderItems': {
        if (!filePersistenceRepository || !searchIndex) {
          throw new Error('Worker not initialized — send init first')
        }
        // Metadata, FTS and keyword mappings share one owner transaction and one IPC boundary.
        const operationStartedAt = performance.now()
        const cpuStartedAt = readWorkerCpuUsage()
        const summary = await searchIndex.persistAndApplyProviderItems(
          message.records,
          message.providerId,
          message.items,
          message.legacyItemIds
        )
        const persistDurationMs = summary.persistDurationMs
        const applyDurationMs = summary.applyDurationMs
        const cpuUsage = readWorkerCpuUsage(cpuStartedAt)
        const metrics = {
          requestedRows: message.records.length,
          persistedRows: summary.persistedCount,
          indexedItems: summary.indexedItems,
          removedItems: summary.removedItems,
          legacyItemIds: message.legacyItemIds.length,
          workerDurationMs: performance.now() - operationStartedAt,
          workerCpuMicros: cpuUsage.user + cpuUsage.system,
          persistDurationMs,
          applyDurationMs
        }
        searchIndexWorkerLog.debug('Fused file/index write completed', {
          meta: { operation: 'persist-and-apply', sourceId: message.providerId, ...metrics }
        })
        const result: PersistAndApplyProviderItemsResult = {
          persistedCount: summary.persistedCount,
          summary,
          metrics
        }
        respond({ type: 'result', taskId, result })
        break
      }

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

      case 'updateFileMetadata': {
        if (!filePersistenceRepository) {
          throw new Error('Worker not initialized — send init first')
        }
        respond({
          type: 'result',
          taskId,
          result: await filePersistenceRepository.updateFileMetadata(message.records)
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

      case 'removeFileRecords': {
        if (!db || !searchIndex || !client) {
          throw new Error('Worker not initialized — send init first')
        }
        const workerDb = db
        const workerService = searchIndex
        const cancellationState = message.cancellation ? new Int32Array(message.cancellation) : null
        const result = await withFileIndexPersistenceRetry(
          async () => {
            if (cancellationState && Atomics.load(cancellationState, 0)) {
              const error = new Error('FILE_INDEX_DELETE_CANCELLED')
              error.name = 'FileIndexDeleteCancelledError'
              throw error
            }
            return await workerDb.transaction(
              async (tx) => {
                if (cancellationState && Atomics.load(cancellationState, 0)) {
                  const error = new Error('FILE_INDEX_DELETE_CANCELLED')
                  error.name = 'FileIndexDeleteCancelledError'
                  throw error
                }
                return await removeFileRecordsInTransaction(
                  tx,
                  workerService,
                  message.sourceId,
                  message.records
                )
              },
              { behavior: 'immediate' }
            )
          },
          FILE_INDEX_PERSISTENCE_RETRY_LABELS.removeFileRecords,
          client
        )
        respond({ type: 'result', taskId, result })
        break
      }

      case 'removeMissingFileSearchRecords': {
        if (!db || !searchIndex || !client) {
          throw new Error('Worker not initialized — send init first')
        }
        const workerDb = db
        const workerService = searchIndex
        const cancellationState = message.cancellation ? new Int32Array(message.cancellation) : null
        const result = await withFileIndexPersistenceRetry(
          async () => {
            if (cancellationState && Atomics.load(cancellationState, 0)) {
              const error = new Error('FILE_INDEX_DELETE_CANCELLED')
              error.name = 'FileIndexDeleteCancelledError'
              throw error
            }
            return await workerDb.transaction(
              async (tx) => {
                if (cancellationState && Atomics.load(cancellationState, 0)) {
                  const error = new Error('FILE_INDEX_DELETE_CANCELLED')
                  error.name = 'FileIndexDeleteCancelledError'
                  throw error
                }
                return await removeMissingFileSearchRecordsInTransaction(
                  tx,
                  workerService,
                  message.sourceId,
                  message.records
                )
              },
              { behavior: 'immediate' }
            )
          },
          FILE_INDEX_PERSISTENCE_RETRY_LABELS.removeMissingFileSearchRecords,
          client
        )
        respond({ type: 'result', taskId, result })
        break
      }

      case 'listPendingFileDeletionCommits': {
        if (!db || !client) throw new Error('Worker not initialized — send init first')
        const workerDb = db
        const cancellationState = message.cancellation ? new Int32Array(message.cancellation) : null
        const result = await withFileIndexPersistenceRetry(
          async () => {
            if (cancellationState && Atomics.load(cancellationState, 0)) {
              const error = new Error('FILE_INDEX_DELETE_CANCELLED')
              error.name = 'FileIndexDeleteCancelledError'
              throw error
            }
            return await listPendingFileDeletionCommitsInHome(
              workerDb,
              message.sourceId,
              message.limit
            )
          },
          FILE_INDEX_PERSISTENCE_RETRY_LABELS.listPendingFileDeletionCommits,
          client
        )
        respond({ type: 'result', taskId, result })
        break
      }

      case 'acknowledgeFileDeletionCommits': {
        if (!db || !client) throw new Error('Worker not initialized — send init first')
        const workerDb = db
        const cancellationState = message.cancellation ? new Int32Array(message.cancellation) : null
        const result = await withFileIndexPersistenceRetry(
          async () => {
            if (cancellationState && Atomics.load(cancellationState, 0)) {
              const error = new Error('FILE_INDEX_DELETE_CANCELLED')
              error.name = 'FileIndexDeleteCancelledError'
              throw error
            }
            return await acknowledgeFileDeletionCommitsInHome(
              workerDb,
              message.sourceId,
              message.commitIds
            )
          },
          FILE_INDEX_PERSISTENCE_RETRY_LABELS.acknowledgeFileDeletionCommits,
          client
        )
        respond({ type: 'result', taskId, result })
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
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        const deletedCount = await searchIndex.cleanupOrphanKeywords(message.sourceId)
        respond({ type: 'result', taskId, result: deletedCount })
        break
      }

      case 'runIndexMaintenanceSlice': {
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        const cancellationState = message.cancellation ? new Int32Array(message.cancellation) : null
        if (cancellationState && Atomics.load(cancellationState, 0)) {
          const error = new Error('FILE_INDEX_DELETE_CANCELLED')
          error.name = 'FileIndexDeleteCancelledError'
          throw error
        }
        respond({
          type: 'result',
          taskId,
          result: await searchIndex.runIndexMaintenanceSlice(message.sourceId, message.limit)
        })
        break
      }

      case 'acknowledgeIndexMaintenanceCommit':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.acknowledgeIndexMaintenanceCommit(message.notification)
        respond({ type: 'result', taskId })
        break

      case 'shutdown':
        await handleShutdown()
        respond({ type: 'result', taskId })
        break

      case 'execWrite':
        respond({ type: 'result', taskId, result: await handleExecWrite(message) })
        break

      case 'vacuum':
        respond({ type: 'result', taskId, result: await handleVacuum(message) })
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
async function readPragmaNumber(target: Client, pragma: string, column: string): Promise<number> {
  const result = await target.execute(`PRAGMA ${pragma}`)
  const row = result.rows?.[0] as Record<string, unknown> | undefined
  const value = Number(row?.[column])
  return Number.isFinite(value) ? value : 0
}

/**
 * `VACUUM` outside any transaction, on this worker thread only. The main process never runs
 * it: a VACUUM of a multi-GB file takes minutes and the main-thread libsql binding is
 * synchronous. Readers keep their WAL snapshot meanwhile; index writes wait in the queue.
 */
async function handleVacuum(message: VacuumMessage): Promise<VacuumResult> {
  if (!client || !dbFilePath) throw new Error('Worker not initialized — send init first')
  const target = client
  const filePath = dbFilePath
  const startedAt = performance.now()
  const pageSize = await readPragmaNumber(target, 'page_size', 'page_size')
  const freelistPages = await readPragmaNumber(target, 'freelist_count', 'freelist_count')
  const freelistBytesBefore = freelistPages * pageSize
  const fileBytesBefore = (await stat(filePath)).size
  const freeDiskBytes = await statfs(path.dirname(filePath))
    .then((stats) => Number(stats.bavail) * Number(stats.bsize))
    .catch(() => null)
  const decision = resolveSearchIndexCompactionDecision({
    fileBytes: fileBytesBefore,
    freelistBytes: freelistBytesBefore,
    freeDiskBytes
  })
  if (!decision.run) {
    searchIndexWorkerLog.info('Search index compaction skipped', {
      meta: { reason: decision.reason, fileBytesBefore, freelistBytesBefore, freeDiskBytes }
    })
    return {
      ran: false,
      reason: decision.reason,
      fileBytesBefore,
      fileBytesAfter: fileBytesBefore,
      freelistBytesBefore,
      durationMs: Math.round(performance.now() - startedAt)
    }
  }
  await target.execute('VACUUM')
  // Under WAL the rewritten database sits in the WAL until a checkpoint; truncate it now so
  // the reclaimed space is actually returned instead of parked in `-wal`.
  await target.execute('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => undefined)
  const fileBytesAfter = (await stat(filePath)).size
  const durationMs = Math.round(performance.now() - startedAt)
  searchIndexWorkerLog.info('Search index compacted', {
    meta: {
      reason: message.reason,
      fileBytesBefore,
      fileBytesAfter,
      freelistBytesBefore,
      durationMs
    }
  })
  return {
    ran: true,
    reason: message.reason,
    fileBytesBefore,
    fileBytesAfter,
    freelistBytesBefore,
    durationMs
  }
}

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

  // A previous init attempt may have failed AFTER opening its connection
  // (e.g. schema drift during warmup). Close that stale handle before opening
  // a new one, or every init retry leaks an open sqlite connection.
  const staleClient = client
  client = null
  if (staleClient) {
    try {
      staleClient.close()
    } catch (error) {
      searchIndexWorkerLog.warn('Failed to close stale DB client before re-init', { error })
    }
  }

  const workerClient = createClient({ url: `file:${dbPath}`, timeout: 30_000 })
  client = workerClient
  dbFilePath = dbPath

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

// ---------- Communication ----------

function respond(message: WorkerResultMessage | WorkerErrorMessage): void {
  parentPort?.postMessage(message)
}

function respondMetrics(request: WorkerMetricsRequest): void {
  const mem = process.memoryUsage()
  const cpu = process.cpuUsage()
  const metrics: WorkerMetricsPayload = {
    timestamp: Date.now(),
    memory: getWorkerMemorySnapshot(mem),
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
