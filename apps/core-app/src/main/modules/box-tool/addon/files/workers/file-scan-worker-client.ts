import type { ScannedFileInfo } from '../types'
import type {
  WorkerMetricsPayload,
  WorkerMetricsResponse,
  WorkerStatusSnapshot,
  WorkerTaskSnapshot
} from './worker-status'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { getLogger } from '@talex-touch/utils/common/logger'
import { FILE_WORKER_IDLE_SHUTDOWN_MS, IdleWorkerShutdownController } from './idle-worker-shutdown'

interface PendingScan {
  batches: Array<{ sequence: number; batch: ScannedFileInfo[] }>
  done: boolean
  error: Error | null
  wake: (() => void) | null
  startedAt: number
}

interface PendingMetrics {
  resolve: (value: WorkerMetricsPayload | null) => void
  timeout: ReturnType<typeof setTimeout>
}

type WorkerMessage =
  | { type: 'batch'; taskId: string; sequence: number; batch: ScannedFileInfo[] }
  | { type: 'done'; taskId: string; scannedCount: number }
  | { type: 'error'; taskId: string; error: string }
  | WorkerMetricsResponse

const fileProviderLog = getLogger('file-provider')

export class FileScanWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingScan>()
  private metricsPending = new Map<string, PendingMetrics>()
  private lastError: string | null = null
  private lastTask: WorkerTaskSnapshot | null = null
  private workerStartedAt: number | null = null
  private lastMetricsSample: { at: number; cpuUsage: WorkerMetricsPayload['cpuUsage'] } | null =
    null
  private readonly idleShutdown = new IdleWorkerShutdownController({
    timeoutMs: FILE_WORKER_IDLE_SHUTDOWN_MS,
    shouldShutdown: () => this.pending.size === 0 && this.metricsPending.size === 0,
    shutdown: () => this.terminateWorker()
  })

  async scan(
    paths: string[],
    excludePaths?: Set<string>,
    batchSize?: number,
    signal?: AbortSignal
  ): Promise<ScannedFileInfo[]> {
    const results: ScannedFileInfo[] = []
    for await (const batch of this.scanBatches(paths, excludePaths, batchSize, signal)) {
      results.push(...batch)
    }
    return results
  }

  async *scanBatches(
    paths: string[],
    excludePaths?: Set<string>,
    batchSize?: number,
    signal?: AbortSignal
  ): AsyncIterable<ScannedFileInfo[]> {
    const taskId = `scan-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const worker = this.ensureWorker()
    const pending: PendingScan = {
      batches: [],
      done: false,
      error: null,
      wake: null,
      startedAt: Date.now()
    }
    const abort = () => {
      const reason = signal?.reason
      pending.error = reason instanceof Error ? reason : new Error('FILE_SCAN_ABORTED')
      pending.done = true
      worker.postMessage({ type: 'cancel', taskId })
      pending.wake?.()
    }

    this.pending.set(taskId, pending)
    signal?.addEventListener('abort', abort, { once: true })
    worker.postMessage({
      type: 'scan',
      taskId,
      paths,
      excludePaths: excludePaths ? Array.from(excludePaths) : undefined,
      batchSize
    })

    try {
      if (signal?.aborted) abort()
      while (true) {
        const next = pending.batches.shift()
        if (next) {
          yield next.batch
          worker.postMessage({ type: 'batchAck', taskId, sequence: next.sequence })
          continue
        }
        if (pending.error) throw pending.error
        if (pending.done) return
        await new Promise<void>((resolve) => {
          pending.wake = resolve
        })
        pending.wake = null
      }
    } finally {
      signal?.removeEventListener('abort', abort)
      if (!pending.done) worker.postMessage({ type: 'cancel', taskId })
      this.pending.delete(taskId)
      this.scheduleIdleShutdown()
    }
  }

  async getStatus(): Promise<WorkerStatusSnapshot> {
    this.idleShutdown.cancel()
    const worker = this.worker
    const pendingCount = this.pending.size
    const metrics = worker ? await this.requestMetrics() : null
    this.scheduleIdleShutdown()
    return {
      name: 'file-scan',
      threadId: worker?.threadId ?? null,
      state: !worker ? 'offline' : pendingCount > 0 ? 'busy' : 'idle',
      pending: pendingCount,
      lastTask: this.lastTask,
      lastError: this.lastError,
      uptimeMs: worker && this.workerStartedAt ? Date.now() - this.workerStartedAt : null,
      metrics: this.toStatusMetrics(metrics)
    }
  }

  shutdown(): void {
    this.failPendingScans(new Error('FILE_SCAN_WORKER_CLOSED'))
    this.terminateWorker()
  }

  private ensureWorker(): Worker {
    this.idleShutdown.cancel()
    if (this.worker) {
      return this.worker
    }

    const workerPath = path.join(__dirname, 'file-scan-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (this.worker === worker && code !== 0) {
        this.handleWorkerError(new Error(`FileScanWorker exited with code ${code}`))
      }
    })

    this.worker = worker
    this.workerStartedAt = Date.now()
    return worker
  }

  private handleMessage(message: WorkerMessage): void {
    if (message.type === 'metrics') {
      const pending = this.metricsPending.get(message.requestId)
      if (!pending) {
        return
      }
      clearTimeout(pending.timeout)
      pending.resolve(message.metrics)
      this.metricsPending.delete(message.requestId)
      this.scheduleIdleShutdown()
      return
    }

    const pending = this.pending.get(message.taskId)
    if (!pending) {
      return
    }

    if (message.type === 'batch') {
      pending.batches.push({ sequence: message.sequence, batch: message.batch })
      pending.wake?.()
      return
    }

    if (message.type === 'done') {
      pending.done = true
      pending.wake?.()
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: null
      }
      return
    }

    if (message.type === 'error') {
      const error = new Error(message.error)
      pending.error = error
      pending.done = true
      pending.wake?.()
      this.lastError = message.error
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: message.error
      }
    }
  }

  private handleWorkerError(error: Error): void {
    this.failPendingScans(error)
    for (const pending of this.metricsPending.values()) {
      clearTimeout(pending.timeout)
      pending.resolve(null)
    }
    this.metricsPending.clear()
    this.terminateWorker()
    this.lastError = error.message
    fileProviderLog.warn('[FileScanWorker] Worker failed, will restart on demand', { error })
  }

  private failPendingScans(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.error = error
      pending.done = true
      pending.wake?.()
    }
  }

  private async requestMetrics(): Promise<WorkerMetricsPayload | null> {
    const worker = this.worker
    if (!worker) {
      return null
    }
    const requestId = `metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.metricsPending.delete(requestId)
        resolve(null)
        this.scheduleIdleShutdown()
      }, 300)
      this.metricsPending.set(requestId, { resolve, timeout })
      worker.postMessage({
        type: 'metrics',
        requestId
      })
    })
  }

  private toStatusMetrics(metrics: WorkerMetricsPayload | null): WorkerStatusSnapshot['metrics'] {
    if (!metrics) {
      return null
    }
    const percent = this.computeCpuPercent(metrics)
    return {
      capturedAt: metrics.timestamp,
      memory: metrics.memory,
      cpu: {
        user: metrics.cpuUsage.user,
        system: metrics.cpuUsage.system,
        percent
      },
      eventLoop: metrics.eventLoop
    }
  }

  private computeCpuPercent(metrics: WorkerMetricsPayload): number | null {
    if (!this.lastMetricsSample) {
      this.lastMetricsSample = { at: metrics.timestamp, cpuUsage: metrics.cpuUsage }
      return null
    }
    const elapsedMs = metrics.timestamp - this.lastMetricsSample.at
    const deltaUser = metrics.cpuUsage.user - this.lastMetricsSample.cpuUsage.user
    const deltaSystem = metrics.cpuUsage.system - this.lastMetricsSample.cpuUsage.system
    this.lastMetricsSample = { at: metrics.timestamp, cpuUsage: metrics.cpuUsage }
    if (elapsedMs <= 0) {
      return null
    }
    const deltaMs = (deltaUser + deltaSystem) / 1000
    const percent = (deltaMs / elapsedMs) * 100
    return Number.isFinite(percent) ? Math.max(0, percent) : null
  }

  private scheduleIdleShutdown(): void {
    if (!this.worker || this.pending.size > 0 || this.metricsPending.size > 0) {
      return
    }

    this.idleShutdown.schedule()
  }

  private terminateWorker(): void {
    this.idleShutdown.cancel()
    this.worker?.terminate()
    this.worker = null
    this.workerStartedAt = null
    this.lastMetricsSample = null
  }
}
