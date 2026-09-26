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

interface PendingIcon {
  resolve: (value: string | null) => void
  reject: (error: Error) => void
  startedAt: number
  outputPath: string
}

interface PendingMetrics {
  resolve: (value: WorkerMetricsPayload | null) => void
  timeout: NodeJS.Timeout
}

type WorkerMessage =
  | { type: 'done'; taskId: string; path: string | null }
  | { type: 'error'; taskId: string; error: string }
  | WorkerMetricsResponse

const fileProviderLog = getLogger('file-provider')

export class IconWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingIcon>()
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

  /**
   * Extracts the platform icon for `filePath` into `outputPath` inside the worker and resolves with
   * the written path (or null when no icon is available). Image bytes never cross this boundary.
   */
  async extractToFile(filePath: string, outputPath: string, size?: number): Promise<string | null> {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new TypeError('IconWorkerClient.extractToFile requires a filePath')
    }
    if (typeof outputPath !== 'string' || outputPath.length === 0) {
      throw new TypeError('IconWorkerClient.extractToFile requires an outputPath')
    }

    const taskId = `icon-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const startedAt = Date.now()
    const worker = this.ensureWorker()
    const { promise, resolve, reject } = Promise.withResolvers<string | null>()

    this.pending.set(taskId, { resolve, reject, startedAt, outputPath })
    worker.postMessage({
      type: 'extract',
      taskId,
      filePath,
      outputPath,
      size
    })

    return promise
  }

  async getStatus(): Promise<WorkerStatusSnapshot> {
    const worker = this.worker
    const pendingCount = this.pending.size
    const metrics = worker ? await this.requestMetrics() : null
    this.scheduleIdleShutdown()
    return {
      name: 'icon',
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
    this.terminateWorker()
  }

  private ensureWorker(): Worker {
    this.idleShutdown.cancel()
    if (this.worker) {
      return this.worker
    }

    const workerPath = path.join(__dirname, 'icon-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (this.worker === worker && code !== 0) {
        this.handleWorkerError(new Error(`IconWorker exited with code ${code}`))
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

    if (message.type === 'done') {
      this.pending.delete(message.taskId)
      const returnedPath =
        typeof message.path === 'string' && message.path.length > 0 ? message.path : null

      if (returnedPath && path.resolve(returnedPath) !== path.resolve(pending.outputPath)) {
        const error = new Error('IconWorker returned an unexpected output path')
        this.lastError = error.message
        this.lastTask = {
          id: message.taskId,
          startedAt: new Date(pending.startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - pending.startedAt,
          error: error.message
        }
        pending.reject(error)
        this.scheduleIdleShutdown()
        return
      }

      pending.resolve(returnedPath)
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: null
      }
      this.scheduleIdleShutdown()
      return
    }

    if (message.type === 'error') {
      this.pending.delete(message.taskId)
      this.lastError = message.error
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: message.error
      }
      pending.reject(new Error(message.error))
      this.scheduleIdleShutdown()
    }
  }

  private handleWorkerError(error: Error): void {
    this.settlePending(error)
    this.terminateWorker()
    this.lastError = error.message
    fileProviderLog.warn('[IconWorker] Worker failed, will restart on demand', {
      error
    })
  }

  /** Every in-flight request settles, whether the worker failed, exited or was shut down. */
  private settlePending(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error)
    }
    this.pending.clear()

    for (const [, pending] of this.metricsPending) {
      clearTimeout(pending.timeout)
      pending.resolve(null)
    }
    this.metricsPending.clear()
  }

  private async requestMetrics(): Promise<WorkerMetricsPayload | null> {
    const worker = this.worker
    if (!worker) {
      return null
    }
    const requestId = `metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const { promise, resolve } = Promise.withResolvers<WorkerMetricsPayload | null>()
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
    return promise
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
    const worker = this.worker
    this.worker = null
    this.workerStartedAt = null
    this.lastMetricsSample = null

    if (worker) {
      void worker.terminate()
    }

    this.settlePending(new Error('IconWorker terminated'))
  }
}
