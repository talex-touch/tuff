import type { PluginStorageErrorCode } from '@talex-touch/utils/transport/events/types'
import type {
  PluginSqliteExecuteResult,
  PluginSqliteQueryResult,
  PluginSqliteTransactionResult,
  PluginSqliteWorkerOperation,
  PluginSqliteWorkerResponse,
  PluginSqliteWorkerResult
} from './plugin-sqlite-worker-protocol'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import {
  PLUGIN_SQLITE_MAX_QUEUE_DEPTH,
  PLUGIN_SQLITE_QUERY_TIMEOUT_MS,
  PLUGIN_SQLITE_WRITE_TIMEOUT_MS
} from './plugin-sqlite-worker-protocol'

export class PluginSqliteWorkerError extends Error {
  constructor(
    readonly code: PluginStorageErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PluginSqliteWorkerError'
  }
}

interface PendingOperation {
  requestId: string
  operation: PluginSqliteWorkerOperation
  resolve: (result: PluginSqliteWorkerResult) => void
  reject: (error: PluginSqliteWorkerError) => void
}

export interface PluginSqliteWorkerClientOptions {
  maxQueueDepth?: number
  timeoutMs?: number
  queryTimeoutMs?: number
  writeTimeoutMs?: number
  workerPath?: string
  readOnly?: boolean
}

const WORKER_UNAVAILABLE_MESSAGE = 'Plugin SQLite worker is unavailable.'

export class PluginSqliteWorkerClient {
  private worker: Worker | null = null
  private active: PendingOperation | null = null
  private readonly queued: PendingOperation[] = []
  private timeout: ReturnType<typeof setTimeout> | null = null
  private termination: Promise<void> | null = null
  private sequence = 0
  private closed = false
  private readonly maxQueueDepth: number
  private readonly queryTimeoutMs: number
  private readonly writeTimeoutMs: number
  private readonly workerPath: string
  private readonly readOnly: boolean

  constructor(
    private readonly databasePath: string,
    options: PluginSqliteWorkerClientOptions = {}
  ) {
    this.maxQueueDepth = options.maxQueueDepth ?? PLUGIN_SQLITE_MAX_QUEUE_DEPTH
    this.queryTimeoutMs =
      options.timeoutMs ?? options.queryTimeoutMs ?? PLUGIN_SQLITE_QUERY_TIMEOUT_MS
    this.writeTimeoutMs =
      options.timeoutMs ?? options.writeTimeoutMs ?? PLUGIN_SQLITE_WRITE_TIMEOUT_MS
    this.workerPath = options.workerPath ?? path.join(__dirname, 'plugin-sqlite-worker.js')
    this.readOnly = options.readOnly === true
  }

  get isClosed(): boolean {
    return this.closed
  }

  execute(sql: string, params: unknown[]): Promise<PluginSqliteExecuteResult> {
    return this.enqueue({ type: 'execute', sql, params }) as Promise<PluginSqliteExecuteResult>
  }

  query(sql: string, params: unknown[]): Promise<PluginSqliteQueryResult> {
    return this.enqueue({ type: 'query', sql, params }) as Promise<PluginSqliteQueryResult>
  }

  transaction(
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<PluginSqliteTransactionResult> {
    return this.enqueue({
      type: 'transaction',
      statements
    }) as Promise<PluginSqliteTransactionResult>
  }

  async close(): Promise<void> {
    if (this.closed) {
      await this.terminateWorker()
      return
    }
    this.closed = true
    this.clearOperationTimeout()
    const active = this.active
    this.active = null
    this.rejectQueued(
      new PluginSqliteWorkerError(
        PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
        WORKER_UNAVAILABLE_MESSAGE
      )
    )
    await this.terminateWorker()
    active?.reject(
      new PluginSqliteWorkerError(
        PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
        WORKER_UNAVAILABLE_MESSAGE
      )
    )
  }

  private enqueue(operation: PluginSqliteWorkerOperation): Promise<PluginSqliteWorkerResult> {
    if (this.closed) {
      return Promise.reject(
        new PluginSqliteWorkerError(
          PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
          WORKER_UNAVAILABLE_MESSAGE
        )
      )
    }
    if ((this.active ? 1 : 0) + this.queued.length >= this.maxQueueDepth) {
      return Promise.reject(
        new PluginSqliteWorkerError(
          PLUGIN_STORAGE_ERROR_CODES.CONCURRENCY_LIMIT,
          'Plugin SQLite queue limit exceeded.'
        )
      )
    }

    return new Promise((resolve, reject) => {
      this.queued.push({
        requestId: `plugin-sqlite-${++this.sequence}`,
        operation,
        resolve,
        reject
      })
      this.dispatchNext()
    })
  }

  private dispatchNext(): void {
    if (this.closed || this.active || this.queued.length === 0) return
    const pending = this.queued.shift()
    if (!pending) return

    try {
      const worker = this.ensureWorker()
      this.active = pending
      worker.postMessage({ requestId: pending.requestId, operation: pending.operation })
      const timeoutMs =
        pending.operation.type === 'query' ? this.queryTimeoutMs : this.writeTimeoutMs
      this.timeout = setTimeout(() => {
        if (this.active?.requestId !== pending.requestId) return
        this.active = null
        this.closed = true
        this.rejectQueued(
          new PluginSqliteWorkerError(
            PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
            WORKER_UNAVAILABLE_MESSAGE
          )
        )
        void this.terminateWorker().then(() => {
          pending.reject(
            new PluginSqliteWorkerError(
              PLUGIN_STORAGE_ERROR_CODES.TIMEOUT,
              'Plugin SQLite operation timed out.'
            )
          )
        })
      }, timeoutMs)
    } catch {
      this.active = null
      this.closed = true
      this.rejectQueued(
        new PluginSqliteWorkerError(
          PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
          WORKER_UNAVAILABLE_MESSAGE
        )
      )
      void this.terminateWorker().then(() => {
        pending.reject(
          new PluginSqliteWorkerError(
            PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
            WORKER_UNAVAILABLE_MESSAGE
          )
        )
      })
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(this.workerPath, {
      workerData: { databasePath: this.databasePath, readOnly: this.readOnly },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4
      }
    })
    worker.on('message', (message: PluginSqliteWorkerResponse) => this.handleMessage(message))
    worker.on('error', () => this.handleWorkerFailure())
    worker.on('exit', (code) => {
      if (!this.closed && this.worker === worker && code !== 0) this.handleWorkerFailure()
    })
    this.worker = worker
    return worker
  }

  private handleMessage(message: PluginSqliteWorkerResponse): void {
    const active = this.active
    if (!active || message.requestId !== active.requestId) return
    this.clearOperationTimeout()
    this.active = null

    if (message.type === 'result') {
      active.resolve(message.result)
    } else {
      active.reject(new PluginSqliteWorkerError(message.code, message.error))
    }
    this.dispatchNext()
  }

  private handleWorkerFailure(): void {
    if (this.closed) return
    this.clearOperationTimeout()
    this.closed = true
    const active = this.active
    this.active = null
    const error = new PluginSqliteWorkerError(
      PLUGIN_STORAGE_ERROR_CODES.WORKER_UNAVAILABLE,
      WORKER_UNAVAILABLE_MESSAGE
    )
    this.rejectQueued(error)
    void this.terminateWorker().then(() => active?.reject(error))
  }

  private terminateWorker(): Promise<void> {
    if (this.termination) return this.termination
    const worker = this.worker
    this.worker = null
    if (!worker) return Promise.resolve()
    this.termination = worker.terminate().then(
      () => undefined,
      () => undefined
    )
    return this.termination
  }

  private rejectQueued(error: PluginSqliteWorkerError): void {
    for (const pending of this.queued.splice(0)) pending.reject(error)
  }

  private clearOperationTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
  }
}
