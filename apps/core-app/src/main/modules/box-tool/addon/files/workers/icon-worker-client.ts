import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileProviderLog } from '../../../../../utils/logger'
import type { WorkerMetricsPayload, WorkerMetricsResponse, WorkerStatusSnapshot, WorkerTaskSnapshot } from './worker-status'

type PendingIcon = {
  resolve: (value: Buffer | null) => void
  reject: (error: Error) => void
  startedAt: number
}

type PendingMetrics = {
  resolve: (value: WorkerMetricsPayload | null) => void
  timeout: ReturnType<typeof setTimeout>
}

type WorkerMessage =
  | { type: 'done'; taskId: string; buffer: Buffer | null }
  | { type: 'error'; taskId: string; error: string }
  | WorkerMetricsResponse

export class IconWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingIcon>()
  private metricsPending = new Map<string, PendingMetrics>()
  private lastError: string | null = null
  private lastTask: WorkerTaskSnapshot | null = null
  private workerStartedAt: number | null = null
  private lastMetricsSample: { at: number; cpuUsage: WorkerMetricsPayload['cpuUsage'] } | null = null

  async extract(filePath: string): Promise<Buffer | null> {
    const taskId = `icon-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const startedAt = Date.now()
    const worker = this.ensureWorker()

    return new Promise<Buffer | null>((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject, startedAt })

      worker.postMessage({
        type: 'extract',
        taskId,
        filePath,
      })
    })
  }

  async getStatus(): Promise<WorkerStatusSnapshot> {
    const worker = this.worker
    const pendingCount = this.pending.size
    const metrics = worker ? await this.requestMetrics() : null
    return {
      name: 'icon',
      threadId: worker?.threadId ?? null,
      state: !worker ? 'offline' : pendingCount > 0 ? 'busy' : 'idle',
      pending: pendingCount,
      lastTask: this.lastTask,
      lastError: this.lastError,
      uptimeMs: worker && this.workerStartedAt ? Date.now() - this.workerStartedAt : null,
      metrics: this.toStatusMetrics(metrics),
    }
  }

  shutdown(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerStartedAt = null
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    const workerPath = path.join(__dirname, 'icon-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (code !== 0) {
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
      return
    }

    const pending = this.pending.get(message.taskId)
    if (!pending) {
      return
    }

    if (message.type === 'done') {
      this.pending.delete(message.taskId)
      pending.resolve(message.buffer ?? null)
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: null,
      }
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
        error: message.error,
      }
      pending.reject(new Error(message.error))
    }
  }

  private handleWorkerError(error: Error): void {
    if (this.pending.size > 0) {
      for (const [, pending] of this.pending) {
        pending.reject(error)
      }
      this.pending.clear()
    }
    if (this.metricsPending.size > 0) {
      for (const [, pending] of this.metricsPending) {
        clearTimeout(pending.timeout)
        pending.resolve(null)
      }
      this.metricsPending.clear()
    }
    this.worker?.terminate()
    this.worker = null
    this.workerStartedAt = null
    this.lastError = error.message
    fileProviderLog.warn('[IconWorker] Worker failed, will restart on demand', {
      error,
    })
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
      }, 300)
      this.metricsPending.set(requestId, { resolve, timeout })
      worker.postMessage({
        type: 'metrics',
        requestId,
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
        percent,
      },
      eventLoop: metrics.eventLoop,
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
}
