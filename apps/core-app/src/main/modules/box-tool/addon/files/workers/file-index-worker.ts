import type { FileParserResult } from '@talex-touch/utils/electron/file-parsers'
import type {
  SearchIndexItem,
  SearchIndexKeyword
} from '../../../search-engine/search-index-service'
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { parentPort } from 'node:worker_threads'
import { fileParserRegistry } from '@talex-touch/utils/electron/file-parsers'
import {
  CONTENT_INDEXABLE_EXTENSIONS,
  getContentSizeLimitMB,
  getTypeTagsForExtension,
  KEYWORD_MAP
} from '../constants'

interface IndexFilePayload {
  id: number
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  mtime: number
  ctime: number
}

interface IndexRequest {
  type: 'index'
  taskId: string
  dbPath: string
  providerId: string
  providerType: string
  files: IndexFilePayload[]
}

interface IndexDoneMessage {
  type: 'done'
  taskId: string
  processed: number
  failed: number
}

interface IndexErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

interface IndexProgressUpdate {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  progress: number
  processedBytes: number | null
  totalBytes: number | null
  lastError: string | null
  startedAt?: string
  updatedAt?: string
}

interface IndexFileUpdate {
  content: string | null
  embeddingStatus: 'pending' | 'completed'
}

interface IndexFileResultMessage {
  type: 'file'
  taskId: string
  fileId: number
  progress: IndexProgressUpdate
  fileUpdate: IndexFileUpdate | null
  indexItem: SearchIndexItem
}

function buildMetricsPayload(): WorkerMetricsPayload {
  const memory = process.memoryUsage()
  const eventLoop =
    typeof performance.eventLoopUtilization === 'function'
      ? performance.eventLoopUtilization()
      : null
  return {
    timestamp: Date.now(),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers ?? 0
    },
    cpuUsage: process.cpuUsage(),
    eventLoop: eventLoop
      ? {
          active: eventLoop.active,
          idle: eventLoop.idle,
          utilization: eventLoop.utilization
        }
      : null
  }
}

const MAX_CONTENT_LENGTH = 200_000

const queue: IndexRequest[] = []
let running = false

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
  content?: string | null
): SearchIndexItem {
  const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
  const extensionKeywords = KEYWORD_MAP[extension] || []
  const keywords: SearchIndexKeyword[] = extensionKeywords.map((keyword) => ({
    value: keyword,
    priority: 1.05
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
    tags: tags.size > 0 ? Array.from(tags) : undefined
  }
}

function emitFileResult(message: IndexFileResultMessage): void {
  parentPort?.postMessage(message)
}

async function handleIndexTask(task: IndexRequest): Promise<{ processed: number; failed: number }> {
  let failed = 0

  for (const file of task.files) {
    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    const indexable = CONTENT_INDEXABLE_EXTENSIONS.has(extension)
    const size = await ensureFileSize(file)
    let content: string | null = null

    if (!indexable) {
      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'skipped',
          progress: 100,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError: 'content-indexing-disabled',
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    const maxBytes = getContentSizeLimitMB(extension) * 1024 * 1024
    if (maxBytes && size !== null && size > maxBytes) {
      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'skipped',
          progress: 100,
          processedBytes: 0,
          totalBytes: size,
          lastError: 'file-too-large',
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    emitFileResult({
      type: 'file',
      taskId: task.taskId,
      fileId: file.id,
      progress: {
        status: 'processing',
        progress: 5,
        processedBytes: 0,
        totalBytes: size ?? null,
        startedAt: new Date().toISOString(),
        lastError: null
      },
      fileUpdate: null,
      indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
    })

    let result: FileParserResult | null = null
    try {
      result = await fileParserRegistry.parseWithBestParser({
        filePath: file.path,
        extension,
        size: size ?? 0,
        maxBytes
      })
    } catch (error) {
      failed += 1
      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'failed',
          progress: 100,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError: error instanceof Error ? error.message : 'parser-error',
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    if (!result) {
      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'skipped',
          progress: 100,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError: 'parser-not-found',
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
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
      const embeddingStatus =
        result.embeddings && result.embeddings.length > 0 ? 'completed' : 'pending'

      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'completed',
          progress: 100,
          processedBytes,
          totalBytes,
          lastError: null,
          updatedAt: new Date().toISOString()
        },
        fileUpdate: { content: trimmedContent, embeddingStatus },
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType, content)
      })
      continue
    }

    if (result.status === 'skipped') {
      emitFileResult({
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'skipped',
          progress: 100,
          processedBytes,
          totalBytes,
          lastError: result.reason ?? null,
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    failed += 1

    emitFileResult({
      type: 'file',
      taskId: task.taskId,
      fileId: file.id,
      progress: {
        status: 'failed',
        progress: 100,
        processedBytes,
        totalBytes,
        lastError: result.reason ?? null,
        updatedAt: new Date().toISOString()
      },
      fileUpdate: null,
      indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
    })
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
      failed
    } satisfies IndexDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error)
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
      metrics: buildMetricsPayload()
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type !== 'index') {
    return
  }
  queue.push(payload)
  void processQueue()
})
