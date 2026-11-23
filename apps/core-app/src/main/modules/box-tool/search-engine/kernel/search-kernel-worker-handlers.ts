import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import type { SearchKernelTaskContext, SearchKernelTaskHandler } from './search-kernel-process'
import type { SerializedSearchIndexWorkerError } from '../workers/search-index-worker-error'

export const SEARCH_KERNEL_TASKS = {
  WRITER_REQUEST: 'search-index.writer.request',
  WRITER_CLOSE: 'search-index.writer.close',
  READER_QUERY: 'search-index.reader.query',
  READER_SEMANTIC_SEARCH: 'search-index.reader.semantic-search',
  READER_CANCEL: 'search-index.reader.cancel',
  READER_RETIRE: 'search-index.reader.retire'
} as const

export type SearchKernelTaskName = (typeof SEARCH_KERNEL_TASKS)[keyof typeof SEARCH_KERNEL_TASKS]

export const SEARCH_INDEX_WRITER_WORKER_FILENAME = 'search-index-worker.js'
export const SEARCH_INDEX_READER_WORKER_FILENAME = 'search-index-read-worker.js'

export const SEARCH_KERNEL_READER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4
} as const

const DEFAULT_WRITER_GRACEFUL_CLOSE_TIMEOUT_MS = 2_000
const DEFAULT_READER_RETIRE_TIMEOUT_MS = 2_000

export interface SearchKernelWriterRequestPayload {
  message: Record<string, unknown>
}

/** Exact worker response message returned by `search-index-worker.js` (including structured errors). */
export type SearchKernelWriterRequestResult = Record<string, unknown>

export interface SearchKernelWriterClosePayload {
  graceful?: boolean
  timeoutMs?: number
}

export interface SearchKernelWriterCloseResult {
  closed: boolean
  gracefulAck: boolean
  terminated: boolean
}

export interface SearchKernelReaderQueryPayload {
  lane: string
  databasePath: string
  requestId: string
  sql: string
  args: unknown[]
}

export interface SearchKernelReaderSemanticSearchPayload {
  lane: string
  databasePath: string
  requestId: string
  vector: number[]
  model: string
  limit: number
}

export interface SearchKernelReaderRowsResult {
  rows: Record<string, unknown>[]
}

export interface SearchKernelReaderErrorResult {
  error: SerializedSearchIndexWorkerError
}

export type SearchKernelReaderResult = SearchKernelReaderRowsResult | SearchKernelReaderErrorResult

export interface SearchKernelReaderCancelPayload {
  lane: string
  requestId: string
  databasePath?: string
}

export interface SearchKernelReaderCancelResult {
  cancelled: boolean
}

export interface SearchKernelReaderRetirePayload {
  lane?: string
  databasePath?: string
  timeoutMs?: number
}

export interface SearchKernelReaderRetireResult {
  retiredCount: number
  lanes: string[]
}

export interface SearchKernelManagedWorker {
  readonly threadId?: number
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  off(event: 'message', listener: (message: unknown) => void): unknown
  off(event: 'error', listener: (error: Error) => void): unknown
  off(event: 'exit', listener: (code: number) => void): unknown
  removeAllListeners?(event?: string): unknown
  unref?(): unknown
  postMessage(message: unknown): void
  terminate(): Promise<number>
}

export interface SearchKernelWorkerPathResolveOptions {
  dirname?: string
  resourcesPath?: string
  cwd?: string
  exists?: (candidate: string) => boolean
}

export interface SearchKernelWorkerHandlersOptions {
  resolveWriterWorkerPath?: () => string
  resolveReaderWorkerPath?: () => string
  createWriterWorker?: (workerPath: string) => SearchKernelManagedWorker
  createReaderWorker?: (workerPath: string, options: WorkerOptions) => SearchKernelManagedWorker
  writerGracefulCloseTimeoutMs?: number
  readerRetireTimeoutMs?: number
}

export interface SearchKernelWorkerHandlersBundle {
  handlers: Record<SearchKernelTaskName, SearchKernelTaskHandler>
  cleanup: () => Promise<void>
  hasPendingActivity: () => boolean
  getActiveSemanticCancelCount: () => number
  getActiveReaderLaneCount: () => number
  hasActiveWriterWorker: () => boolean
}

interface PendingWaiter<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
}

interface ReaderWorkerEntry {
  key: string
  lane: string
  databasePath: string
  worker: SearchKernelManagedWorker
  pending: Map<string, PendingWaiter<SearchKernelReaderResult>>
  retired: boolean
  exited: boolean
  exitPromise: Promise<void>
  detachListeners: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function normalizePositiveMs(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function createCodedError(code: string, message: string, retryable = false): Error {
  return Object.assign(new Error(message), { code, retryable })
}

function resolveSiblingWorkerPath(
  filename: string,
  options: SearchKernelWorkerPathResolveOptions = {}
): string {
  const dirname = options.dirname ?? __dirname
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const cwd = options.cwd ?? process.cwd()
  const exists = options.exists ?? existsSync

  const candidates = new Set<string>([
    path.join(dirname, filename),
    path.resolve(dirname, '..', filename),
    path.resolve(dirname, '..', 'workers', filename)
  ])
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    candidates.add(path.join(resourcesPath, 'app.asar.unpacked', 'out', 'main', filename))
    candidates.add(path.join(resourcesPath, 'app.asar', 'out', 'main', filename))
    candidates.add(path.join(resourcesPath, 'out', 'main', filename))
  }
  candidates.add(path.resolve(cwd, 'out', 'main', filename))

  const all = Array.from(candidates)
  const found = all.find((candidate) => exists(candidate))
  if (!found) {
    throw createCodedError(
      'SEARCH_KERNEL_WORKER_NOT_FOUND',
      `Search kernel sibling worker not found (${filename}): ${all.join(', ')}`,
      false
    )
  }
  return found
}

export function resolveSearchKernelWriterWorkerPath(
  options?: SearchKernelWorkerPathResolveOptions
): string {
  return resolveSiblingWorkerPath(SEARCH_INDEX_WRITER_WORKER_FILENAME, options)
}

export function resolveSearchKernelReaderWorkerPath(
  options?: SearchKernelWorkerPathResolveOptions
): string {
  return resolveSiblingWorkerPath(SEARCH_INDEX_READER_WORKER_FILENAME, options)
}

function defaultCreateWriterWorker(workerPath: string): SearchKernelManagedWorker {
  return new Worker(workerPath) as unknown as SearchKernelManagedWorker
}

function defaultCreateReaderWorker(
  workerPath: string,
  options: WorkerOptions
): SearchKernelManagedWorker {
  return new Worker(workerPath, options) as unknown as SearchKernelManagedWorker
}

function isReaderWorkerResponse(
  value: unknown
): value is
  | { type: 'result'; requestId: string; rows: Record<string, unknown>[] }
  | { type: 'error'; requestId: string; error: SerializedSearchIndexWorkerError } {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.requestId)) return false
  if (value.type === 'result') {
    return Array.isArray(value.rows)
  }
  if (value.type === 'error') {
    return isRecord(value.error) && typeof value.error.message === 'string'
  }
  return false
}

function readerKey(lane: string, databasePath: string): string {
  return `${lane}\u0000${databasePath}`
}

function semanticCancelKey(lane: string, databasePath: string, requestId: string): string {
  return `${lane}\u0000${databasePath}\u0000${requestId}`
}

/**
 * Creates the built-in writer and per-lane reader task handlers that execute inside the
 * Search & Index Kernel process. Pure Node + `worker_threads` — zero Electron GUI imports.
 */
export function createSearchKernelWorkerHandlers(
  options: SearchKernelWorkerHandlersOptions = {}
): SearchKernelWorkerHandlersBundle {
  const resolveWriterPath =
    options.resolveWriterWorkerPath ?? (() => resolveSearchKernelWriterWorkerPath())
  const resolveReaderPath =
    options.resolveReaderWorkerPath ?? (() => resolveSearchKernelReaderWorkerPath())
  const createWriterWorker = options.createWriterWorker ?? defaultCreateWriterWorker
  const createReaderWorker = options.createReaderWorker ?? defaultCreateReaderWorker
  const defaultWriterCloseTimeoutMs = normalizePositiveMs(
    options.writerGracefulCloseTimeoutMs,
    DEFAULT_WRITER_GRACEFUL_CLOSE_TIMEOUT_MS
  )
  const defaultReaderRetireTimeoutMs = normalizePositiveMs(
    options.readerRetireTimeoutMs,
    DEFAULT_READER_RETIRE_TIMEOUT_MS
  )

  // ---------- Writer Worker State ----------

  let writerWorker: SearchKernelManagedWorker | null = null
  let detachWriterListeners: (() => void) | null = null
  let writerPendingTasks = new Map<string, PendingWaiter<SearchKernelWriterRequestResult>>()
  let writerPendingMetrics = new Map<string, PendingWaiter<SearchKernelWriterRequestResult>>()
  let writerClosePromise: Promise<SearchKernelWriterCloseResult> | null = null
  let writerCloseSeq = 0
  let shutdownSequence = 0

  const rejectWriterWaiters = (
    tasks: Map<string, PendingWaiter<SearchKernelWriterRequestResult>>,
    metrics: Map<string, PendingWaiter<SearchKernelWriterRequestResult>>,
    error: Error
  ): void => {
    for (const waiter of tasks.values()) {
      waiter.reject(error)
    }
    tasks.clear()
    for (const waiter of metrics.values()) {
      waiter.reject(error)
    }
    metrics.clear()
  }

  const detachCurrentWriter = (
    worker: SearchKernelManagedWorker
  ): {
    tasks: Map<string, PendingWaiter<SearchKernelWriterRequestResult>>
    metrics: Map<string, PendingWaiter<SearchKernelWriterRequestResult>>
  } | null => {
    if (writerWorker !== worker) return null
    writerWorker = null
    if (detachWriterListeners) {
      const detach = detachWriterListeners
      detachWriterListeners = null
      detach()
    }
    const tasks = writerPendingTasks
    const metrics = writerPendingMetrics
    writerPendingTasks = new Map()
    writerPendingMetrics = new Map()
    return { tasks, metrics }
  }

  const ensureWriterWorker = (): SearchKernelManagedWorker => {
    if (writerWorker) return writerWorker

    const workerPath = resolveWriterPath()
    const worker = createWriterWorker(workerPath)

    const onMessage = (raw: unknown): void => {
      if (writerWorker !== worker || !isRecord(raw)) return
      if (raw.type === 'metrics' && isNonEmptyString(raw.requestId)) {
        const waiter = writerPendingMetrics.get(raw.requestId)
        if (!waiter) return
        writerPendingMetrics.delete(raw.requestId)
        waiter.resolve(raw)
        return
      }
      if (isNonEmptyString(raw.taskId)) {
        const waiter = writerPendingTasks.get(raw.taskId)
        if (!waiter) return
        writerPendingTasks.delete(raw.taskId)
        waiter.resolve(raw)
      }
    }

    const onError = (error: Error): void => {
      const detached = detachCurrentWriter(worker)
      if (!detached) return
      const wrapped = createCodedError(
        'SEARCH_INDEX_WRITER_EXITED',
        error?.message || 'Search index writer worker errored',
        true
      )
      rejectWriterWaiters(detached.tasks, detached.metrics, wrapped)
    }

    const onExit = (code: number): void => {
      const detached = detachCurrentWriter(worker)
      if (!detached) return
      const wrapped = createCodedError(
        'SEARCH_INDEX_WRITER_EXITED',
        `Search index writer worker exited with code ${String(code)}`,
        true
      )
      rejectWriterWaiters(detached.tasks, detached.metrics, wrapped)
    }

    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)

    detachWriterListeners = () => {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
    }

    writerWorker = worker
    return worker
  }

  const requestWriterGracefulShutdown = (
    worker: SearchKernelManagedWorker,
    timeoutMs: number
  ): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const taskId = `kernel-writer-shutdown-${Date.now()}-${++shutdownSequence}`
      let settled = false
      const finish = (acked: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.off('message', onMessage)
        worker.off('exit', onExit)
        worker.off('error', onError)
        resolve(acked)
      }
      const onMessage = (raw: unknown): void => {
        if (isRecord(raw) && raw.taskId === taskId) {
          finish(true)
        }
      }
      const onExit = (): void => {
        finish(true)
      }
      const onError = (): void => {
        finish(false)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      timer.unref?.()
      worker.on('message', onMessage)
      worker.on('exit', onExit)
      worker.on('error', onError)
      try {
        worker.postMessage({ type: 'shutdown', taskId })
      } catch {
        finish(false)
      }
    })
  }

  const closeWriter = async (
    payload: SearchKernelWriterClosePayload = {}
  ): Promise<SearchKernelWriterCloseResult> => {
    const worker = writerWorker
    if (!worker) {
      if (writerClosePromise) {
        return await writerClosePromise
      }
      return { closed: false, gracefulAck: false, terminated: false }
    }

    const graceful = payload.graceful !== false
    const timeoutMs = normalizePositiveMs(payload.timeoutMs, defaultWriterCloseTimeoutMs)
    // Attach a close-specific error listener BEFORE detaching the active writer listeners so
    // an error emitted during graceful shutdown can never become an unhandled EventEmitter crash.
    const onCloseError = (): void => undefined
    worker.on('error', onCloseError)
    const detached = detachCurrentWriter(worker)

    const closeTask = (async (): Promise<SearchKernelWriterCloseResult> => {
      worker.unref?.()
      let gracefulAck = false
      if (graceful) {
        gracefulAck = await requestWriterGracefulShutdown(worker, timeoutMs)
      }
      if (detached) {
        rejectWriterWaiters(
          detached.tasks,
          detached.metrics,
          createCodedError('SEARCH_INDEX_WRITER_CLOSED', 'Search index writer closed', false)
        )
      }
      try {
        await worker.terminate()
      } catch {
        // Worker may already have exited cleanly.
      }
      return { closed: true, gracefulAck, terminated: true }
    })()

    const closeId = ++writerCloseSeq
    writerClosePromise = closeTask
    try {
      return await closeTask
    } finally {
      if (writerCloseSeq === closeId) {
        writerClosePromise = null
      }
    }
  }

  const handleWriterRequest: SearchKernelTaskHandler<
    SearchKernelWriterRequestPayload,
    SearchKernelWriterRequestResult
  > = async (payload, context) => {
    if (!isRecord(payload) || !isRecord(payload.message)) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Writer request payload must contain a message object',
        false
      )
    }
    const message = payload.message
    if (!isNonEmptyString(message.type)) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Writer message must include a non-empty type',
        false
      )
    }

    if (message.type === 'metrics') {
      if (!isNonEmptyString(message.requestId)) {
        throw createCodedError(
          'KERNEL_INVALID_MESSAGE',
          'Writer metrics message must include a non-empty requestId',
          false
        )
      }
      const requestId = message.requestId
      if (!writerWorker) {
        return { type: 'metrics', requestId, metrics: null }
      }
      const worker = writerWorker
      return await new Promise<SearchKernelWriterRequestResult>((resolve, reject) => {
        const onAbort = (): void => {
          writerPendingMetrics.delete(requestId)
          reject(createCodedError('KERNEL_ABORTED', 'Writer metrics request aborted', true))
        }
        const waiter: PendingWaiter<SearchKernelWriterRequestResult> = {
          resolve: (value) => {
            context.signal.removeEventListener('abort', onAbort)
            resolve(value)
          },
          reject: (error) => {
            context.signal.removeEventListener('abort', onAbort)
            reject(error)
          }
        }
        context.signal.addEventListener('abort', onAbort, { once: true })
        writerPendingMetrics.set(requestId, waiter)
        try {
          worker.postMessage(message)
        } catch (error) {
          writerPendingMetrics.delete(requestId)
          context.signal.removeEventListener('abort', onAbort)
          reject(
            createCodedError(
              'SEARCH_INDEX_WRITER_EXITED',
              error instanceof Error ? error.message : String(error),
              true
            )
          )
        }
      })
    }

    if (!isNonEmptyString(message.taskId)) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Writer message must include a non-empty taskId',
        false
      )
    }
    const taskId = message.taskId

    if (writerClosePromise) {
      await writerClosePromise.catch(() => undefined)
    }

    const worker = ensureWriterWorker()
    return await new Promise<SearchKernelWriterRequestResult>((resolve, reject) => {
      if (context.signal.aborted) {
        reject(createCodedError('KERNEL_SHUTTING_DOWN', 'Search kernel is shutting down', true))
        return
      }
      const onAbort = (): void => {
        writerPendingTasks.delete(taskId)
        reject(createCodedError('KERNEL_SHUTTING_DOWN', 'Search kernel is shutting down', true))
      }
      const waiter: PendingWaiter<SearchKernelWriterRequestResult> = {
        resolve: (value) => {
          context.signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          context.signal.removeEventListener('abort', onAbort)
          reject(error)
        }
      }
      context.signal.addEventListener('abort', onAbort, { once: true })
      writerPendingTasks.set(taskId, waiter)
      try {
        worker.postMessage(message)
      } catch (error) {
        writerPendingTasks.delete(taskId)
        context.signal.removeEventListener('abort', onAbort)
        reject(
          createCodedError(
            'SEARCH_INDEX_WRITER_EXITED',
            error instanceof Error ? error.message : String(error),
            true
          )
        )
      }
    })
  }

  // ---------- Reader Worker State ----------

  const readers = new Map<string, ReaderWorkerEntry>()
  const activeReaderRetirements = new Set<Promise<void>>()
  const activeSemanticCancels = new Map<
    string,
    {
      lane: string
      databasePath: string
      requestId: string
      cancelFlag: SharedArrayBuffer
    }
  >()

  const rejectReaderPending = (entry: ReaderWorkerEntry, error: Error): void => {
    const waiters = Array.from(entry.pending.values())
    entry.pending.clear()
    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }

  const ensureReaderWorker = (lane: string, databasePath: string): ReaderWorkerEntry => {
    const key = readerKey(lane, databasePath)
    const existing = readers.get(key)
    if (existing && !existing.retired && !existing.exited) {
      return existing
    }

    const workerPath = resolveReaderPath()
    const worker = createReaderWorker(workerPath, {
      workerData: { databasePath },
      resourceLimits: { ...SEARCH_KERNEL_READER_RESOURCE_LIMITS }
    })

    let resolveExit!: () => void
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })

    const entry: ReaderWorkerEntry = {
      key,
      lane,
      databasePath,
      worker,
      pending: new Map(),
      retired: false,
      exited: false,
      exitPromise,
      detachListeners: () => {}
    }

    const onMessage = (raw: unknown): void => {
      if (entry.retired || !isReaderWorkerResponse(raw)) return
      const waiter = entry.pending.get(raw.requestId)
      if (!waiter) return
      entry.pending.delete(raw.requestId)
      if (raw.type === 'result') {
        waiter.resolve({ rows: raw.rows })
      } else {
        waiter.resolve({ error: raw.error })
      }
    }

    const onError = (error: Error): void => {
      if (readers.get(key) === entry) {
        readers.delete(key)
      }
      entry.retired = true
      rejectReaderPending(
        entry,
        createCodedError(
          'SEARCH_INDEX_READER_EXITED',
          error?.message || `Search index reader (${lane}) errored`,
          true
        )
      )
    }

    const onExit = (code: number): void => {
      entry.exited = true
      resolveExit()
      if (readers.get(key) === entry) {
        readers.delete(key)
      }
      rejectReaderPending(
        entry,
        createCodedError(
          'SEARCH_INDEX_READER_EXITED',
          `Search index reader (${lane}) exited with code ${String(code)}`,
          true
        )
      )
    }

    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)

    entry.detachListeners = () => {
      worker.off('message', onMessage)
      worker.off('error', onError)
    }

    readers.set(key, entry)
    return entry
  }

  const dispatchReaderMessage = async (
    entry: ReaderWorkerEntry,
    requestId: string,
    message: Record<string, unknown>,
    context: SearchKernelTaskContext
  ): Promise<SearchKernelReaderResult> => {
    return await new Promise<SearchKernelReaderResult>((resolve, reject) => {
      if (context.signal.aborted) {
        reject(createCodedError('KERNEL_SHUTTING_DOWN', 'Search kernel is shutting down', true))
        return
      }
      const onAbort = (): void => {
        entry.pending.delete(requestId)
        reject(createCodedError('KERNEL_SHUTTING_DOWN', 'Search kernel is shutting down', true))
      }
      const waiter: PendingWaiter<SearchKernelReaderResult> = {
        resolve: (value) => {
          context.signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          context.signal.removeEventListener('abort', onAbort)
          reject(error)
        }
      }
      context.signal.addEventListener('abort', onAbort, { once: true })
      entry.pending.set(requestId, waiter)
      try {
        entry.worker.postMessage(message)
      } catch (error) {
        entry.pending.delete(requestId)
        context.signal.removeEventListener('abort', onAbort)
        reject(
          createCodedError(
            'SEARCH_INDEX_READER_EXITED',
            error instanceof Error ? error.message : String(error),
            true
          )
        )
      }
    })
  }

  const retireReaderEntry = (entry: ReaderWorkerEntry, timeoutMs: number): Promise<void> => {
    const retirement = (async (): Promise<void> => {
      if (readers.get(entry.key) === entry) {
        readers.delete(entry.key)
      }
      entry.retired = true
      rejectReaderPending(
        entry,
        createCodedError('SEARCH_INDEX_READER_RETIRED', `Reader lane ${entry.lane} retired`, true)
      )

      // Never call `worker.terminate()` on a libSQL read worker (neon SIGABRT risk while a native
      // query is in flight). Ask it to close cleanly and await exit with a bounded deadline.
      entry.worker.unref?.()
      entry.worker.on('error', () => undefined)
      entry.detachListeners()
      try {
        entry.worker.postMessage({ type: 'shutdown' })
      } catch {
        return
      }

      if (entry.exited) return
      let timer: ReturnType<typeof setTimeout> | null = null
      try {
        await Promise.race([
          entry.exitPromise,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              timer = null
              resolve()
            }, timeoutMs)
            timer.unref?.()
          })
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    })()

    activeReaderRetirements.add(retirement)
    void retirement.finally(() => {
      activeReaderRetirements.delete(retirement)
    })
    return retirement
  }

  const retireReaders = async (
    payload: SearchKernelReaderRetirePayload = {}
  ): Promise<SearchKernelReaderRetireResult> => {
    const laneFilter = isNonEmptyString(payload?.lane) ? payload.lane : undefined
    const dbFilter = isNonEmptyString(payload?.databasePath) ? payload.databasePath : undefined
    const timeoutMs = normalizePositiveMs(payload?.timeoutMs, defaultReaderRetireTimeoutMs)

    const matched: ReaderWorkerEntry[] = []
    for (const entry of readers.values()) {
      if (laneFilter && entry.lane !== laneFilter) continue
      if (dbFilter && entry.databasePath !== dbFilter) continue
      matched.push(entry)
    }

    await Promise.allSettled(matched.map((entry) => retireReaderEntry(entry, timeoutMs)))

    return {
      retiredCount: matched.length,
      lanes: matched.map((entry) => entry.lane)
    }
  }

  const handleReaderQuery: SearchKernelTaskHandler<
    SearchKernelReaderQueryPayload,
    SearchKernelReaderResult
  > = async (payload, context) => {
    if (
      !isRecord(payload) ||
      !isNonEmptyString(payload.lane) ||
      !isNonEmptyString(payload.databasePath) ||
      !isNonEmptyString(payload.requestId) ||
      typeof payload.sql !== 'string' ||
      !Array.isArray(payload.args)
    ) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Reader query payload requires lane, databasePath, requestId, sql, and args',
        false
      )
    }

    const entry = ensureReaderWorker(payload.lane, payload.databasePath)
    return await dispatchReaderMessage(
      entry,
      payload.requestId,
      {
        type: 'query',
        requestId: payload.requestId,
        sql: payload.sql,
        args: payload.args
      },
      context
    )
  }

  const handleReaderSemanticSearch: SearchKernelTaskHandler<
    SearchKernelReaderSemanticSearchPayload,
    SearchKernelReaderResult
  > = async (payload, context) => {
    if (
      !isRecord(payload) ||
      !isNonEmptyString(payload.lane) ||
      !isNonEmptyString(payload.databasePath) ||
      !isNonEmptyString(payload.requestId) ||
      !Array.isArray(payload.vector) ||
      typeof payload.model !== 'string' ||
      typeof payload.limit !== 'number'
    ) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Reader semantic-search payload requires lane, databasePath, requestId, vector, model, and limit',
        false
      )
    }

    const cancelFlag = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const cancelKey = semanticCancelKey(payload.lane, payload.databasePath, payload.requestId)
    activeSemanticCancels.set(cancelKey, {
      lane: payload.lane,
      databasePath: payload.databasePath,
      requestId: payload.requestId,
      cancelFlag
    })

    const onShutdownAbort = (): void => {
      Atomics.store(new Int32Array(cancelFlag), 0, 1)
    }
    context.signal.addEventListener('abort', onShutdownAbort, { once: true })

    try {
      const entry = ensureReaderWorker(payload.lane, payload.databasePath)
      return await dispatchReaderMessage(
        entry,
        payload.requestId,
        {
          type: 'semantic-search',
          requestId: payload.requestId,
          vector: payload.vector,
          model: payload.model,
          limit: payload.limit,
          cancelFlag
        },
        context
      )
    } finally {
      context.signal.removeEventListener('abort', onShutdownAbort)
      activeSemanticCancels.delete(cancelKey)
    }
  }

  const handleReaderCancel: SearchKernelTaskHandler<
    SearchKernelReaderCancelPayload,
    SearchKernelReaderCancelResult
  > = (payload) => {
    if (
      !isRecord(payload) ||
      !isNonEmptyString(payload.lane) ||
      !isNonEmptyString(payload.requestId)
    ) {
      throw createCodedError(
        'KERNEL_INVALID_MESSAGE',
        'Reader cancel payload requires lane and requestId',
        false
      )
    }
    if (isNonEmptyString(payload.databasePath)) {
      const match = activeSemanticCancels.get(
        semanticCancelKey(payload.lane, payload.databasePath, payload.requestId)
      )
      if (!match) {
        return { cancelled: false }
      }
      Atomics.store(new Int32Array(match.cancelFlag), 0, 1)
      return { cancelled: true }
    }
    let cancelled = false
    for (const entry of activeSemanticCancels.values()) {
      if (entry.lane === payload.lane && entry.requestId === payload.requestId) {
        Atomics.store(new Int32Array(entry.cancelFlag), 0, 1)
        cancelled = true
      }
    }
    return { cancelled }
  }

  const handleReaderRetire: SearchKernelTaskHandler<
    SearchKernelReaderRetirePayload | undefined,
    SearchKernelReaderRetireResult
  > = async (payload) => {
    return await retireReaders(
      isRecord(payload) ? (payload as SearchKernelReaderRetirePayload) : {}
    )
  }

  const handleWriterClose: SearchKernelTaskHandler<
    SearchKernelWriterClosePayload | undefined,
    SearchKernelWriterCloseResult
  > = async (payload) => {
    return await closeWriter(isRecord(payload) ? (payload as SearchKernelWriterClosePayload) : {})
  }

  const hasPendingActivity = (): boolean =>
    writerWorker !== null ||
    writerClosePromise !== null ||
    readers.size > 0 ||
    activeReaderRetirements.size > 0 ||
    activeSemanticCancels.size > 0

  let cleanupPromise: Promise<void> | null = null
  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise
    if (!hasPendingActivity()) {
      return Promise.resolve()
    }
    cleanupPromise = (async () => {
      for (const entry of activeSemanticCancels.values()) {
        Atomics.store(new Int32Array(entry.cancelFlag), 0, 1)
      }
      await Promise.allSettled([
        closeWriter({ graceful: true }),
        retireReaders({}),
        ...Array.from(activeReaderRetirements)
      ])
    })().finally(() => {
      cleanupPromise = null
    })
    return cleanupPromise
  }

  return {
    handlers: {
      [SEARCH_KERNEL_TASKS.WRITER_REQUEST]: handleWriterRequest as SearchKernelTaskHandler,
      [SEARCH_KERNEL_TASKS.WRITER_CLOSE]: handleWriterClose as SearchKernelTaskHandler,
      [SEARCH_KERNEL_TASKS.READER_QUERY]: handleReaderQuery as SearchKernelTaskHandler,
      [SEARCH_KERNEL_TASKS.READER_SEMANTIC_SEARCH]:
        handleReaderSemanticSearch as SearchKernelTaskHandler,
      [SEARCH_KERNEL_TASKS.READER_CANCEL]: handleReaderCancel as SearchKernelTaskHandler,
      [SEARCH_KERNEL_TASKS.READER_RETIRE]: handleReaderRetire as SearchKernelTaskHandler
    },
    cleanup,
    hasPendingActivity,
    getActiveSemanticCancelCount: () => activeSemanticCancels.size,
    getActiveReaderLaneCount: () => readers.size,
    hasActiveWriterWorker: () => writerWorker !== null
  }
}
