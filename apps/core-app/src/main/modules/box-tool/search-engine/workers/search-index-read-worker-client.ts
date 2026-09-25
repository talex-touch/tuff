import type { SearchIndexReadExecutor } from '../search-index-service'
import type { SQL } from 'drizzle-orm'
import type {
  SearchIndexReadWorkerQueryMessage,
  SearchIndexReadWorkerResponse
} from './search-index-read-worker-types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { deserializeSearchIndexWorkerError } from './search-index-worker-error'
import { createLogger } from '../../../../utils/logger'

const DEFAULT_QUERY_TIMEOUT_MS = 15_000
const DEFAULT_MAX_QUEUE_DEPTH = 64
const sqliteDialect = new SQLiteSyncDialect()

/**
 * A reader that failed once used to be a reader that never worked again.
 *
 * `failWorker` latched the client permanently closed and nothing ever rebuilt it, so a single slow
 * query or a worker exit made every later read — and therefore every file/app search — fail for
 * the rest of the session, while the index kept being written normally. The latching, not the
 * original failure, is what turned one bad query into a session-wide outage; a failure now retires
 * the worker and the next query builds a new one.
 *
 * Rebuilding is not free: a retired worker can only be *asked* to shut down (see `retireWorker`),
 * so a reader failing for a permanent reason — a corrupt database, say — would strand one thread
 * per attempt. Consecutive failures therefore trip a cooldown, which keeps a broken reader quiet
 * without ever pretending it is closed for good.
 */
const FAILURE_COOLDOWN_THRESHOLD = 3
const FAILURE_COOLDOWN_MS = 30_000
const readWorkerLog = createLogger('SearchIndex').child('ReadWorker')

export interface SearchIndexReadWorkerClientOptions {
  workerPath?: string
  timeoutMs?: number
  maxQueueDepth?: number
}

export class SearchIndexReadWorkerCancelledError extends Error {
  readonly code = 'SEARCH_INDEX_READ_CANCELLED' as const

  constructor() {
    super('SEARCH_INDEX_READ_CANCELLED')
    this.name = 'SearchIndexReadWorkerCancelledError'
  }
}

export class SearchIndexReadWorkerTimeoutError extends Error {
  readonly code = 'SEARCH_INDEX_READ_TIMEOUT' as const

  constructor(requestId: string, timeoutMs: number) {
    super(`SEARCH_INDEX_READ_TIMEOUT:${requestId}:${String(timeoutMs)}`)
    this.name = 'SearchIndexReadWorkerTimeoutError'
  }
}

export class SearchIndexReadWorkerUnavailableError extends Error {
  readonly code = 'SEARCH_INDEX_READ_WORKER_UNAVAILABLE' as const

  constructor(detail = 'unavailable') {
    super(`SEARCH_INDEX_READ_WORKER_UNAVAILABLE:${detail}`)
    this.name = 'SearchIndexReadWorkerUnavailableError'
  }
}

export class SearchIndexReadWorkerQueueFullError extends Error {
  readonly code = 'SEARCH_INDEX_READ_QUEUE_FULL' as const

  constructor(maxQueueDepth: number) {
    super(`SEARCH_INDEX_READ_QUEUE_FULL:${String(maxQueueDepth)}`)
    this.name = 'SearchIndexReadWorkerQueueFullError'
  }
}

interface PendingRead {
  request: SearchIndexReadWorkerQueryMessage
  resolve: (rows: unknown[]) => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort?: () => void
  settled: boolean
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback
}

function resolveSearchIndexReadWorkerPath(): string {
  const candidates = new Set<string>([
    path.join(__dirname, 'search-index-read-worker.js'),
    path.resolve(__dirname, '..', 'search-index-read-worker.js'),
    path.resolve(process.cwd(), 'out', 'main', 'search-index-read-worker.js')
  ])
  if (process.resourcesPath) {
    candidates.add(
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'out',
        'main',
        'search-index-read-worker.js'
      )
    )
    candidates.add(
      path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'search-index-read-worker.js')
    )
    candidates.add(path.join(process.resourcesPath, 'out', 'main', 'search-index-read-worker.js'))
  }

  const workerPath = Array.from(candidates).find((candidate) => existsSync(candidate))
  if (!workerPath) {
    throw new SearchIndexReadWorkerUnavailableError(
      `not-found:${Array.from(candidates).join(', ')}`
    )
  }
  return workerPath
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function isWorkerResponse(value: unknown): value is SearchIndexReadWorkerResponse {
  if (!value || typeof value !== 'object' || !('requestId' in value) || !('type' in value)) {
    return false
  }
  if (typeof value.requestId !== 'string' || value.requestId.length === 0) return false
  if (value.type === 'result') return 'rows' in value && Array.isArray(value.rows)
  if (
    value.type !== 'error' ||
    !('error' in value) ||
    !value.error ||
    typeof value.error !== 'object'
  ) {
    return false
  }
  return 'message' in value.error && typeof value.error.message === 'string'
}

/**
 * A bounded, one-at-a-time proxy for read-only search-index queries.
 *
 * Cancellation is intentionally parent-owned: an active native query cannot be
 * interrupted through IPC, so its caller settles immediately while the slot
 * remains occupied until the worker reports completion or the client retires it.
 */
export class SearchIndexReadWorkerClient implements SearchIndexReadExecutor {
  private worker: Worker | null = null
  private active: PendingRead | null = null
  private readonly queued: PendingRead[] = []
  private timeout: NodeJS.Timeout | null = null
  private closePromise: Promise<void> | null = null
  private closed = false
  private consecutiveFailures = 0
  private cooldownUntil = 0
  private sequence = 0
  private readonly workerPath: string
  private readonly timeoutMs: number
  private readonly maxQueueDepth: number

  constructor(
    private readonly databasePath: string,
    options: SearchIndexReadWorkerClientOptions = {}
  ) {
    this.workerPath = options.workerPath ?? resolveSearchIndexReadWorkerPath()
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_QUERY_TIMEOUT_MS)
    this.maxQueueDepth = positiveInteger(options.maxQueueDepth, DEFAULT_MAX_QUEUE_DEPTH)
  }

  all<T>(query: SQL, signal?: AbortSignal): Promise<T[]> {
    if (this.closed) {
      return Promise.reject(new SearchIndexReadWorkerUnavailableError('closed'))
    }
    if (this.worker === null && Date.now() < this.cooldownUntil) {
      return Promise.reject(
        new SearchIndexReadWorkerUnavailableError('reader is cooling down after repeated failures')
      )
    }
    if (signal?.aborted) {
      return Promise.reject(new SearchIndexReadWorkerCancelledError())
    }
    if ((this.active ? 1 : 0) + this.queued.length >= this.maxQueueDepth) {
      return Promise.reject(new SearchIndexReadWorkerQueueFullError(this.maxQueueDepth))
    }

    let compiled: { sql: string; params: unknown[] }
    try {
      compiled = sqliteDialect.sqlToQuery(query)
    } catch (error) {
      return Promise.reject(asError(error))
    }

    return new Promise<T[]>((resolve, reject) => {
      const pending: PendingRead = {
        request: {
          type: 'query',
          requestId: `search-index-read-${++this.sequence}`,
          sql: compiled.sql,
          args: compiled.params
        },
        resolve: (rows) => resolve(rows as T[]),
        reject,
        signal,
        settled: false
      }
      pending.onAbort = () => this.cancelPending(pending)
      this.queued.push(pending)
      signal?.addEventListener('abort', pending.onAbort, { once: true })
      if (signal?.aborted) {
        this.cancelPending(pending)
        return
      }
      this.dispatchNext()
    })
  }

  async close(): Promise<void> {
    if (this.closePromise) return await this.closePromise

    this.closed = true
    const error = new SearchIndexReadWorkerUnavailableError('closed')
    this.clearOperationTimeout()
    const active = this.active
    this.active = null
    if (active) this.settlePending(active, error)
    this.rejectQueued(error)

    const worker = this.worker
    this.worker = null
    this.retireWorker(worker)
    this.closePromise = Promise.resolve()
    return await this.closePromise
  }

  private dispatchNext(): void {
    if (this.closed || this.active || this.queued.length === 0) return
    const pending = this.queued.shift()
    if (!pending) return

    let worker: Worker
    try {
      worker = this.ensureWorker()
      this.active = pending
      worker.postMessage(pending.request)
      this.timeout = setTimeout(() => {
        if (this.active !== pending) return
        this.failWorker(
          worker,
          new SearchIndexReadWorkerTimeoutError(pending.request.requestId, this.timeoutMs)
        )
      }, this.timeoutMs)
      this.timeout.unref?.()
    } catch (error) {
      this.active = pending
      this.failWorker(this.worker, asError(error))
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(this.workerPath, {
      workerData: { databasePath: this.databasePath },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4
      }
    })
    worker.on('message', (message: unknown) => this.handleMessage(worker, message))
    worker.on('error', (error) => this.failWorker(worker, error))
    worker.on('exit', (code) => {
      if (this.worker === worker) {
        this.failWorker(worker, new SearchIndexReadWorkerUnavailableError(`exited:${String(code)}`))
      }
    })
    this.worker = worker
    return worker
  }

  private handleMessage(worker: Worker, message: unknown): void {
    if (this.worker !== worker || !isWorkerResponse(message)) return
    const active = this.active
    if (!active || active.request.requestId !== message.requestId) return

    this.clearOperationTimeout()
    this.active = null
    if (message.type === 'result') {
      this.consecutiveFailures = 0
      this.cooldownUntil = 0
      this.settlePending(active, undefined, message.rows)
    } else {
      this.settlePending(active, deserializeSearchIndexWorkerError(message.error))
    }
    this.dispatchNext()
  }

  private cancelPending(pending: PendingRead): void {
    const error = new SearchIndexReadWorkerCancelledError()
    if (this.active === pending) {
      // Do not clear `active` here. The worker may still be inside synchronous
      // native SQLite, and dispatching another request would reintroduce overlap.
      this.settlePending(pending, error)
      return
    }

    const index = this.queued.indexOf(pending)
    if (index < 0) return
    this.queued.splice(index, 1)
    this.settlePending(pending, error)
  }

  private settlePending(pending: PendingRead, error?: Error, rows?: unknown[]): void {
    if (pending.settled) return
    pending.settled = true
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    pending.onAbort = undefined
    if (error) pending.reject(error)
    else pending.resolve(rows ?? [])
  }

  private rejectQueued(error: Error): void {
    for (const pending of this.queued.splice(0)) this.settlePending(pending, error)
  }

  private failWorker(worker: Worker | null, error: Error): void {
    if (worker && this.worker !== worker) return
    // Only an explicit `close()` is terminal. A failed worker is retired here and rebuilt by the
    // next `all()`, which is the whole point: latching `closed` on failure is what made one bad
    // query permanent.
    if (this.closed) return

    this.clearOperationTimeout()
    const active = this.active
    this.active = null
    if (active) this.settlePending(active, error)
    this.rejectQueued(error)

    const activeWorker = this.worker
    this.worker = null
    this.retireWorker(activeWorker)

    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= FAILURE_COOLDOWN_THRESHOLD) {
      this.cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
    }
    // Log the first failure and the one that trips the cooldown. A reader that died silently and
    // stayed dead is why the original failure could not be traced back from the session log.
    if (this.consecutiveFailures === 1 || this.consecutiveFailures === FAILURE_COOLDOWN_THRESHOLD) {
      readWorkerLog.warn('Search index read worker retired', {
        error,
        meta: {
          consecutiveFailures: this.consecutiveFailures,
          willRebuild: this.consecutiveFailures < FAILURE_COOLDOWN_THRESHOLD,
          cooldownMs:
            this.consecutiveFailures >= FAILURE_COOLDOWN_THRESHOLD ? FAILURE_COOLDOWN_MS : 0
        }
      })
    }
  }

  private retireWorker(worker: Worker | null): void {
    if (!worker) return

    // `worker.terminate()` while libSQL has a query in flight makes the native client abort the
    // whole process (neon asserts on the pending exception, surfacing as SIGABRT), which is why a
    // reader that may be inside one is asked to close its connection and leave instead. It is
    // unref'd so a query that never returns cannot hold the app open, and its error handler is
    // replaced because a listener-less `error` event would crash the process it was retired from.
    worker.unref()
    worker.removeAllListeners('message')
    worker.removeAllListeners('error')
    worker.on('error', () => undefined)
    try {
      worker.postMessage({ type: 'shutdown' })
    } catch {
      // Already gone; nothing is left to close.
    }
  }

  private clearOperationTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
  }
}
