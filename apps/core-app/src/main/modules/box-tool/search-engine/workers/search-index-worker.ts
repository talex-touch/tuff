/**
 * Worker thread for SearchIndexService write operations.
 *
 * Opens its own LibSQL connection with WAL mode and creates a
 * SearchIndexService instance in directMode (bypasses DbWriteScheduler
 * and pacing delays since there is no event loop contention here).
 *
 * Handles: indexItems, removeItems, removeByProvider
 * Read operations (search, lookupByKeywords, etc.) stay on the main thread.
 */
import type { SearchIndexItem } from '../search-index-service'
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from '../../addon/files/workers/worker-status'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'
import { createClient } from '@libsql/client'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../../../db/schema'
import { SearchIndexService } from '../search-index-service'

// ---------- Message Types ----------

interface InitMessage {
  type: 'init'
  taskId: string
  dbPath: string
}

interface IndexItemsMessage {
  type: 'indexItems'
  taskId: string
  items: SearchIndexItem[]
}

interface RemoveItemsMessage {
  type: 'removeItems'
  taskId: string
  itemIds: string[]
}

interface RemoveByProviderMessage {
  type: 'removeByProvider'
  taskId: string
  providerId: string
}

interface CountByProviderMessage {
  type: 'countByProvider'
  taskId: string
  providerId: string
}

interface PersistAndIndexEntry {
  fileId: number
  fileUpdate: {
    content: string | null
    embeddingStatus: string
    embeddings?: Array<{ vector: number[]; model: string }>
    contentHash: string | null
  } | null
  progress: {
    status: string
    progress: number
    processedBytes: number | null
    totalBytes: number | null
    lastError: string | null
    startedAt: string | null
    updatedAt: string | null
  }
  indexItem: SearchIndexItem
}

interface PersistAndIndexMessage {
  type: 'persistAndIndex'
  taskId: string
  entries: PersistAndIndexEntry[]
}

interface UpsertFileRecord {
  path: string
  name: string
  extension?: string | null
  size?: number | null
  mtime: Date | number | string
  ctime: Date | number | string
  lastIndexedAt: Date | number | string
  isDir: boolean
  type: string
}

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
}

type WorkerRequest =
  | InitMessage
  | IndexItemsMessage
  | RemoveItemsMessage
  | RemoveByProviderMessage
  | CountByProviderMessage
  | PersistAndIndexMessage
  | UpsertFilesMessage
  | UpsertScanProgressMessage
  | WorkerMetricsRequest

interface DoneMessage {
  type: 'done'
  taskId: string
  result?: unknown
}

interface ErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

// ---------- Worker State ----------

let searchIndex: SearchIndexService | null = null
let db: LibSQLDatabase<typeof schema> | null = null
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
        respond({ type: 'done', taskId })
        break

      case 'indexItems':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.indexItems(message.items)
        respond({ type: 'done', taskId })
        break

      case 'removeItems':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.removeItems(message.itemIds)
        respond({ type: 'done', taskId })
        break

      case 'removeByProvider':
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        await searchIndex.removeByProvider(message.providerId)
        respond({ type: 'done', taskId })
        break

      case 'countByProvider': {
        if (!searchIndex) throw new Error('Worker not initialized — send init first')
        const count = await searchIndex.countByProvider(message.providerId)
        respond({ type: 'done', taskId, result: count })
        break
      }

      case 'persistAndIndex': {
        if (!searchIndex || !db) throw new Error('Worker not initialized — send init first')
        // Interleave persist + index in small chunks to avoid holding the
        // SQLite write lock for extended periods.  Each chunk:
        //   persist transaction → FTS5 index batches → yield
        // The yield between chunks releases the write lock briefly so
        // main-thread services can acquire it (prevents SQLITE_BUSY).
        const PERSIST_CHUNK = 3
        for (let ci = 0; ci < message.entries.length; ci += PERSIST_CHUNK) {
          const chunk = message.entries.slice(ci, ci + PERSIST_CHUNK)
          await handlePersistAndIndex(chunk)
          await searchIndex.indexItems(chunk.map((e) => e.indexItem))
          // Yield between chunks to release the write lock
          if (ci + PERSIST_CHUNK < message.entries.length) {
            await new Promise<void>((resolve) => setTimeout(resolve, 30))
          }
        }
        respond({ type: 'done', taskId })
        break
      }

      case 'upsertFiles': {
        if (!db) throw new Error('Worker not initialized — send init first')
        const rows = await handleUpsertFiles(message.records)
        respond({ type: 'done', taskId, result: rows })
        break
      }

      case 'upsertScanProgress': {
        if (!db) throw new Error('Worker not initialized — send init first')
        await handleUpsertScanProgress(message.paths, message.lastScanned)
        respond({ type: 'done', taskId })
        break
      }

      default:
        respond({ type: 'error', taskId, error: `Unknown message type` })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    respond({ type: 'error', taskId, error: errorMessage })
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
  searchIndex = new SearchIndexService(workerDb, { directMode: true })
  initialized = true

  console.log('[SearchIndexWorker] Initialized with DB path:', dbPath)
}

/**
 * Persist file content/embeddings/progress rows in a single transaction,
 * then hand off to SearchIndexService.indexItems() for FTS5 writes.
 * All operations run on the same LibSQL connection — zero contention.
 */
async function handlePersistAndIndex(entries: PersistAndIndexEntry[]): Promise<void> {
  if (!db) throw new Error('Worker not initialized')
  if (entries.length === 0) return

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const { fileId, fileUpdate, progress } = entry

      // 1. Update files table (content + embeddingStatus)
      if (fileUpdate) {
        await tx
          .update(schema.files)
          .set({
            content: fileUpdate.content,
            embeddingStatus: fileUpdate.embeddingStatus as 'none' | 'pending' | 'completed'
          })
          .where(eq(schema.files.id, fileId))

        // 2. Persist embeddings (delete old → insert new)
        if (fileUpdate.embeddings && fileUpdate.embeddings.length > 0) {
          const sourceId = String(fileId)
          await tx
            .delete(schema.embeddings)
            .where(
              and(
                eq(schema.embeddings.sourceId, sourceId),
                eq(schema.embeddings.sourceType, 'file')
              )
            )
          await tx.insert(schema.embeddings).values(
            fileUpdate.embeddings.map((emb) => ({
              sourceId,
              sourceType: 'file',
              embedding: emb.vector,
              model: emb.model || 'unknown',
              contentHash: fileUpdate.contentHash
            }))
          )
        }
      }

      // 3. Upsert file_index_progress
      const startedAt = progress.startedAt ? new Date(progress.startedAt) : null
      const updatedAt = progress.updatedAt ? new Date(progress.updatedAt) : new Date()

      await tx
        .insert(schema.fileIndexProgress)
        .values({
          fileId,
          status: progress.status as 'pending' | 'processing' | 'completed' | 'skipped' | 'failed',
          progress: progress.progress,
          processedBytes: progress.processedBytes,
          totalBytes: progress.totalBytes,
          lastError: progress.lastError,
          startedAt,
          updatedAt
        })
        .onConflictDoUpdate({
          target: schema.fileIndexProgress.fileId,
          set: {
            status: progress.status as
              | 'pending'
              | 'processing'
              | 'completed'
              | 'skipped'
              | 'failed',
            progress: progress.progress,
            processedBytes: progress.processedBytes,
            totalBytes: progress.totalBytes,
            lastError: progress.lastError,
            startedAt,
            updatedAt
          }
        })
    }
  })
}

function toDate(value: Date | number | string): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  return new Date(value)
}

async function handleUpsertFiles(
  records: UpsertFileRecord[]
): Promise<Array<Record<string, unknown>>> {
  if (!db || records.length === 0) return []
  const rows = await db
    .insert(schema.files)
    .values(
      records.map((record) => ({
        path: record.path,
        name: record.name,
        extension: record.extension ?? null,
        size: typeof record.size === 'number' ? record.size : null,
        mtime: toDate(record.mtime),
        ctime: toDate(record.ctime),
        lastIndexedAt: toDate(record.lastIndexedAt),
        isDir: record.isDir,
        type: record.type
      }))
    )
    .onConflictDoUpdate({
      target: schema.files.path,
      set: {
        name: sql`excluded.name`,
        extension: sql`excluded.extension`,
        size: sql`excluded.size`,
        mtime: sql`excluded.mtime`,
        ctime: sql`excluded.ctime`,
        lastIndexedAt: sql`excluded.last_indexed_at`,
        isDir: sql`excluded.is_dir`,
        type: sql`excluded.type`
      }
    })
    .returning()

  return rows as Array<Record<string, unknown>>
}

async function handleUpsertScanProgress(paths: string[], lastScanned: string): Promise<void> {
  if (!db || paths.length === 0) return
  const lastScannedAt = new Date(lastScanned)
  await db
    .insert(schema.scanProgress)
    .values(paths.map((entryPath) => ({ path: entryPath, lastScanned: lastScannedAt })))
    .onConflictDoUpdate({
      target: schema.scanProgress.path,
      set: { lastScanned: lastScannedAt }
    })
}

// ---------- Communication ----------

function respond(message: DoneMessage | ErrorMessage): void {
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
