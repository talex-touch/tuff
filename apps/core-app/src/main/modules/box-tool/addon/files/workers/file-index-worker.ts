import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { SearchIndexItem, SearchIndexKeyword } from '../../../search-engine/search-index-service'
import { parentPort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { fileParserRegistry } from '@talex-touch/utils/electron/file-parsers'
import * as schema from '../../../../../db/schema'
import { createDbUtils } from '../../../../../db/utils'
import { SearchIndexService } from '../../../search-engine/search-index-service'
import {
  CONTENT_INDEXABLE_EXTENSIONS,
  getContentSizeLimitMB,
  getTypeTagsForExtension,
  KEYWORD_MAP,
} from '../constants'
import type { WorkerMetricsPayload, WorkerMetricsRequest, WorkerMetricsResponse } from './worker-status'

type IndexFilePayload = {
  id: number
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  mtime: number
  ctime: number
}

type IndexRequest = {
  type: 'index'
  taskId: string
  dbPath: string
  providerId: string
  providerType: string
  files: IndexFilePayload[]
}

type IndexDoneMessage = {
  type: 'done'
  taskId: string
  processed: number
  failed: number
}

type IndexErrorMessage = {
  type: 'error'
  taskId: string
  error: string
}

function buildMetricsPayload(): WorkerMetricsPayload {
  const memory = process.memoryUsage()
  const eventLoop = typeof performance.eventLoopUtilization === 'function'
    ? performance.eventLoopUtilization()
    : null
  return {
    timestamp: Date.now(),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers ?? 0,
    },
    cpuUsage: process.cpuUsage(),
    eventLoop: eventLoop
      ? {
          active: eventLoop.active,
          idle: eventLoop.idle,
          utilization: eventLoop.utilization,
        }
      : null,
  }
}

const MAX_CONTENT_LENGTH = 200_000

const queue: IndexRequest[] = []
let running = false

let currentDbPath: string | null = null
let client: Client | null = null
let db: LibSQLDatabase<typeof schema> | null = null
let dbUtils: ReturnType<typeof createDbUtils> | null = null
let searchIndex: SearchIndexService | null = null

async function ensureDb(dbPath: string): Promise<void> {
  if (db && currentDbPath === dbPath) {
    return
  }

  currentDbPath = dbPath
  if (client) {
    client.close()
  }

  client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA busy_timeout = 30000')
    await client.execute('PRAGMA synchronous = NORMAL')
    await client.execute('PRAGMA locking_mode = NORMAL')
  } catch {
    // ignore pragma failures in worker
  }

  db = drizzle(client, { schema })
  dbUtils = createDbUtils(db)
  searchIndex = new SearchIndexService(db)
}

async function ensureFileSize(file: IndexFilePayload): Promise<number | null> {
  if (typeof file.size === 'number' && file.size >= 0) {
    return file.size
  }
  try {
    const stats = await fs.stat(file.path)
    file.size = stats.size
    return stats.size
  } catch {
    return null
  }
}

function buildSearchIndexItem(
  file: IndexFilePayload,
  providerId: string,
  providerType: string,
  content?: string | null,
): SearchIndexItem {
  const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
  const extensionKeywords = KEYWORD_MAP[extension] || []
  const keywords: SearchIndexKeyword[] = extensionKeywords.map((keyword) => ({
    value: keyword,
    priority: 1.05,
  }))

  const tags = new Set<string>()
  if (extension) {
    tags.add(extension.replace(/^\./, ''))
  }
  for (const tag of getTypeTagsForExtension(extension)) {
    tags.add(tag)
  }

  return {
    itemId: file.path,
    providerId,
    type: providerType,
    name: file.name,
    displayName: file.displayName ?? undefined,
    path: file.path,
    extension,
    content: content ?? undefined,
    keywords,
    tags: tags.size > 0 ? Array.from(tags) : undefined,
  }
}

async function updateProgress(
  fileId: number,
  payload: Partial<Omit<typeof schema.fileIndexProgress.$inferInsert, 'fileId'>>,
): Promise<void> {
  if (!dbUtils) {
    return
  }
  await dbUtils.setFileIndexProgress(fileId, payload)
}

async function handleIndexTask(task: IndexRequest): Promise<{ processed: number, failed: number }> {
  await ensureDb(task.dbPath)
  if (!db || !dbUtils || !searchIndex) {
    throw new Error('Database not initialized in index worker')
  }

  const items: SearchIndexItem[] = []
  let failed = 0

  for (const file of task.files) {
    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    const indexable = CONTENT_INDEXABLE_EXTENSIONS.has(extension)
    const size = await ensureFileSize(file)
    let content: string | null = null

    if (!indexable) {
      await updateProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: size ?? null,
        lastError: 'content-indexing-disabled',
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
      continue
    }

    const maxBytes = getContentSizeLimitMB(extension) * 1024 * 1024
    if (maxBytes && size !== null && size > maxBytes) {
      await updateProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: size,
        lastError: 'file-too-large',
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
      continue
    }

    await updateProgress(file.id, {
      status: 'processing',
      progress: 5,
      processedBytes: 0,
      totalBytes: size ?? null,
      startedAt: new Date(),
      lastError: null,
    })

    let result = null
    try {
      result = await fileParserRegistry.parseWithBestParser({
        filePath: file.path,
        extension,
        size: size ?? 0,
        maxBytes,
      })
    } catch (error) {
      failed += 1
      await updateProgress(file.id, {
        status: 'failed',
        progress: 100,
        processedBytes: 0,
        totalBytes: size ?? null,
        lastError: error instanceof Error ? error.message : 'parser-error',
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
      continue
    }

    if (!result) {
      await updateProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: size ?? null,
        lastError: 'parser-not-found',
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
      continue
    }

    const totalBytes = result.totalBytes ?? size ?? null
    const processedBytes = result.processedBytes ?? totalBytes ?? null

    if (result.status === 'success') {
      const rawContent = result.content ?? ''
      const trimmedContent =
        rawContent.length > MAX_CONTENT_LENGTH
          ? `${rawContent.slice(0, MAX_CONTENT_LENGTH)}\n...[truncated]`
          : rawContent
      content = trimmedContent
      await db
        .update(schema.files)
        .set({
          content: trimmedContent,
          embeddingStatus:
            result.embeddings && result.embeddings.length > 0 ? 'completed' : 'pending',
        })
        .where(eq(schema.files.id, file.id))
      await updateProgress(file.id, {
        status: 'completed',
        progress: 100,
        processedBytes,
        totalBytes,
        lastError: null,
        updatedAt: new Date(),
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType, content))
      continue
    }

    if (result.status === 'skipped') {
      await updateProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes,
        totalBytes,
        lastError: result.reason ?? null,
        updatedAt: new Date(),
      })
      items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
      continue
    }

    failed += 1
    await updateProgress(file.id, {
      status: 'failed',
      progress: 100,
      processedBytes,
      totalBytes,
      lastError: result.reason ?? null,
      updatedAt: new Date(),
    })
    items.push(buildSearchIndexItem(file, task.providerId, task.providerType))
  }

  if (items.length > 0) {
    await searchIndex.indexItems(items)
  }

  return { processed: task.files.length, failed }
}

async function processQueue(): Promise<void> {
  if (running) {
    return
  }
  const next = queue.shift()
  if (!next) {
    return
  }
  running = true

  try {
    const { processed, failed } = await handleIndexTask(next)
    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      processed,
      failed,
    } satisfies IndexDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies IndexErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: IndexRequest | WorkerMetricsRequest) => {
  if (!payload) {
    return
  }
  if (payload.type === 'metrics') {
    parentPort?.postMessage({
      type: 'metrics',
      requestId: payload.requestId,
      metrics: buildMetricsPayload(),
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type !== 'index') {
    return
  }
  queue.push(payload)
  void processQueue()
})
