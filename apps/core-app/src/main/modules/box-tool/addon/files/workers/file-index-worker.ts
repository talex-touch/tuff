import type {
  FileParserChunk,
  FileParserEmbedding,
  FileParserResult
} from '@talex-touch/utils/electron/file-parsers'
import type {
  SearchIndexItem,
  SearchIndexKeyword
} from '../../../search-engine/search-index-service'
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import { getWorkerMemorySnapshot, readWorkerThreadCpuUsage } from './worker-status'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { parentPort } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { fileParserRegistry } from '@talex-touch/utils/electron/file-parsers'
import {
  CONTENT_INDEXABLE_EXTENSIONS,
  FILE_CONTENT_MAX_CHARS,
  FILE_CONTENT_TOO_LONG_REASON,
  FILE_PARSE_OUTPUT_MAX_BYTES,
  getContentSizeLimitMB,
  getTypeTagsForExtension,
  IMAGE_EMBEDDING_EXTENSIONS,
  KEYWORD_MAP
} from '../constants'
import {
  INDEX_WORKER_RESULT_MAX_BYTES,
  INDEX_WORKER_RESULT_TOO_LARGE,
  measureIndexWorkerPayloadBytes
} from './index-worker-payload-budget'
import {
  classifyIndexWorkerReadFailure,
  pushIndexWorkerFailureSample
} from './index-worker-read-failure'

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

interface CancelRequest {
  type: 'cancel'
  taskId: string
}

interface IndexDoneMessage {
  type: 'done'
  taskId: string
  processed: number
  failed: number
  /** Up to three `lastError` values of this batch's failed files. */
  failureSamples?: string[]
}

interface IndexErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

interface IndexProgressUpdate {
  status: 'pending' | 'processing' | 'completed' | 'truncated' | 'failed' | 'skipped'
  progress: number
  processedBytes: number | null
  totalBytes: number | null
  lastError: string | null
  startedAt?: string
  updatedAt?: string
}

interface IndexFileUpdate {
  content: string | null
  embeddingStatus: 'none' | 'pending' | 'completed'
  embeddings?: FileParserEmbedding[]
  contentHash?: string | null
  chunks?: FileParserChunk[]
}

interface IndexFileResultMessage {
  type: 'file'
  taskId: string
  fileId: number
  /** File mtime (ms) the result was produced for; new-version fence. */
  fileVersion: number
  /** File size at scheduling time; second half of the version fingerprint. */
  fileSize: number | null
  progress: IndexProgressUpdate
  fileUpdate: IndexFileUpdate | null
  indexItem: SearchIndexItem
}

interface IndexFileVersionFingerprint {
  mtime: number
  size: number | null
}

function buildMetricsPayload(): WorkerMetricsPayload {
  const eventLoop =
    typeof performance.eventLoopUtilization === 'function'
      ? performance.eventLoopUtilization()
      : null
  return {
    timestamp: Date.now(),
    memory: getWorkerMemorySnapshot(),
    cpuUsage: readWorkerThreadCpuUsage(),
    eventLoop: eventLoop
      ? {
          active: eventLoop.active,
          idle: eventLoop.idle,
          utilization: eventLoop.utilization
        }
      : null
  }
}

const queue: IndexRequest[] = []
const cancelledTaskIds = new Set<string>()
let running = false
let activeTaskId: string | null = null
let activeParseController: AbortController | null = null
function buildContentHash(content: string): string | null {
  if (!content) return null
  return createHash('sha256').update(content).digest('hex')
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

function emitFileResult(
  version: IndexFileVersionFingerprint,
  message: Omit<IndexFileResultMessage, 'fileVersion' | 'fileSize'>
): void {
  if (cancelledTaskIds.has(message.taskId)) return
  parentPort?.postMessage({
    ...message,
    fileVersion: version.mtime,
    fileSize: version.size
  })
}

async function handleIndexTask(
  task: IndexRequest
): Promise<{ processed: number; failed: number; failureSamples: string[] }> {
  let failed = 0
  const failureSamples: string[] = []

  for (const file of task.files) {
    if (cancelledTaskIds.has(task.taskId)) break
    // Fingerprint the version BEFORE ensureFileSize may stat/mutate size: the
    // fence must compare against the size the database row carried at scheduling.
    const version: IndexFileVersionFingerprint = {
      mtime: file.mtime,
      size: typeof file.size === 'number' ? file.size : null
    }
    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    const indexable = CONTENT_INDEXABLE_EXTENSIONS.has(extension)
    const imageEmbeddingCandidate = IMAGE_EMBEDDING_EXTENSIONS.has(extension)
    const size = await ensureFileSize(file)
    if (cancelledTaskIds.has(task.taskId)) break

    // Image vectors are generated in the main process by the authorized local
    // media encoder. The worker must never parse pixels or invent text content:
    // retain a durable pending task until that encoder publishes the vector.
    if (imageEmbeddingCandidate) {
      emitFileResult(version, {
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'pending',
          progress: 0,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError: 'image-embedding-pending',
          updatedAt: new Date().toISOString()
        },
        fileUpdate: {
          content: null,
          embeddingStatus: 'pending'
        },
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    if (!indexable) {
      emitFileResult(version, {
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
      emitFileResult(version, {
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

    emitFileResult(version, {
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
    const parseController = new AbortController()
    activeParseController = parseController
    try {
      result = await fileParserRegistry.parseWithBestParser({
        filePath: file.path,
        extension,
        size: size ?? 0,
        maxBytes,
        maxOutputBytes: FILE_PARSE_OUTPUT_MAX_BYTES,
        maxChunks: 1024,
        signal: parseController.signal
      })
    } catch (error) {
      failed += 1
      const lastError = error instanceof Error ? error.message : 'parser-error'
      pushIndexWorkerFailureSample(failureSamples, lastError)
      emitFileResult(version, {
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'failed',
          progress: 100,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError,
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    } finally {
      if (activeParseController === parseController) activeParseController = null
    }

    if (cancelledTaskIds.has(task.taskId)) break

    if (!result) {
      emitFileResult(version, {
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
      // Over the cap, or cut by the parser's own budget (which a file within the cap cannot hit):
      // not indexed at all, never a prefix. Null content also drops the chunks and vectors that an
      // earlier, shorter version of the file left behind. Terminal like any other skip.
      if (result.truncated === true || rawContent.length > FILE_CONTENT_MAX_CHARS) {
        emitFileResult(version, {
          type: 'file',
          taskId: task.taskId,
          fileId: file.id,
          progress: {
            status: 'skipped',
            progress: 100,
            processedBytes,
            totalBytes,
            lastError: FILE_CONTENT_TOO_LONG_REASON,
            updatedAt: new Date().toISOString()
          },
          fileUpdate: { content: null, embeddingStatus: 'none' },
          indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
        })
        continue
      }
      const embeddingStatus =
        result.embeddings && result.embeddings.length > 0 ? 'completed' : 'pending'
      const contentHash = buildContentHash(rawContent)
      const successMessage = {
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        fileVersion: version.mtime,
        fileSize: version.size,
        progress: {
          status: 'completed',
          progress: 100,
          processedBytes,
          totalBytes,
          lastError: null,
          updatedAt: new Date().toISOString()
        },
        fileUpdate: {
          content: rawContent,
          embeddingStatus,
          embeddings: result.embeddings?.length ? result.embeddings : undefined,
          contentHash,
          chunks: result.chunks?.length ? result.chunks : undefined
        } satisfies IndexFileUpdate,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType, rawContent)
      } satisfies IndexFileResultMessage

      if (
        measureIndexWorkerPayloadBytes(successMessage, INDEX_WORKER_RESULT_MAX_BYTES).exceedsBudget
      ) {
        // Explicit terminal failure: oversized output is never silently dropped
        // and is counted in `failed` like every other real worker failure (the
        // existing failure semantics — surface the batch failure, do not fake
        // failed=0). It terminates because the emitted progress is `failed`, so
        // resume (pending/processing/null only) will not re-select the file. The
        // metadata-only indexItem keeps it searchable by name/path.
        failed += 1
        pushIndexWorkerFailureSample(failureSamples, INDEX_WORKER_RESULT_TOO_LARGE)
        emitFileResult(version, {
          type: 'file',
          taskId: task.taskId,
          fileId: file.id,
          progress: {
            status: 'failed',
            progress: 100,
            processedBytes,
            totalBytes,
            lastError: INDEX_WORKER_RESULT_TOO_LARGE,
            updatedAt: new Date().toISOString()
          },
          fileUpdate: null,
          indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
        })
        continue
      }

      // Already carries fileVersion/fileSize, so post it verbatim; keep the
      // cancellation guard emitFileResult would have applied.
      if (!cancelledTaskIds.has(task.taskId)) {
        parentPort?.postMessage(successMessage)
      }
      continue
    }

    if (result.status === 'skipped') {
      emitFileResult(version, {
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

    const readSkipReason = classifyIndexWorkerReadFailure(result.errorCode)
    if (readSkipReason) {
      // A missing or unreadable file fails the same way until the file itself
      // changes: record a terminal skip, not a failure (index-worker-read-failure).
      emitFileResult(version, {
        type: 'file',
        taskId: task.taskId,
        fileId: file.id,
        progress: {
          status: 'skipped',
          progress: 100,
          processedBytes: 0,
          totalBytes: size ?? null,
          lastError: readSkipReason,
          updatedAt: new Date().toISOString()
        },
        fileUpdate: null,
        indexItem: buildSearchIndexItem(file, task.providerId, task.providerType)
      })
      continue
    }

    failed += 1
    pushIndexWorkerFailureSample(failureSamples, result.reason)

    emitFileResult(version, {
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

  return { processed: task.files.length, failed, failureSamples }
}

async function processQueue(): Promise<void> {
  if (running) return

  const next = queue.shift()
  if (!next) return
  if (cancelledTaskIds.has(next.taskId)) {
    cancelledTaskIds.delete(next.taskId)
    void processQueue()
    return
  }

  running = true
  activeTaskId = next.taskId
  try {
    const { processed, failed, failureSamples } = await handleIndexTask(next)
    if (!cancelledTaskIds.has(next.taskId)) {
      parentPort?.postMessage({
        type: 'done',
        taskId: next.taskId,
        processed,
        failed,
        ...(failureSamples.length > 0 ? { failureSamples } : {})
      } satisfies IndexDoneMessage)
    }
  } catch (error) {
    if (!cancelledTaskIds.has(next.taskId)) {
      parentPort?.postMessage({
        type: 'error',
        taskId: next.taskId,
        error: error instanceof Error ? error.message : String(error)
      } satisfies IndexErrorMessage)
    }
  } finally {
    cancelledTaskIds.delete(next.taskId)
    activeTaskId = null
    running = false
    if (queue.length > 0) void processQueue()
  }
}

parentPort?.on('message', (payload: IndexRequest | CancelRequest | WorkerMetricsRequest) => {
  if (!payload) return

  if (payload.type === 'metrics') {
    parentPort?.postMessage({
      type: 'metrics',
      requestId: payload.requestId,
      metrics: buildMetricsPayload()
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type === 'cancel') {
    cancelledTaskIds.add(payload.taskId)
    if (activeTaskId === payload.taskId) activeParseController?.abort()
    const queuedIndex = queue.findIndex((task) => task.taskId === payload.taskId)
    if (queuedIndex >= 0) queue.splice(queuedIndex, 1)
    if (activeTaskId !== payload.taskId) cancelledTaskIds.delete(payload.taskId)
    return
  }

  queue.push(payload)
  void processQueue()
})
