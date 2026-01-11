import type { ScannedFileInfo } from '../types'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileProviderLog } from '../../../../../utils/logger'

type PendingScan = {
  results: ScannedFileInfo[]
  resolve: (value: ScannedFileInfo[]) => void
  reject: (error: Error) => void
}

type WorkerMessage =
  | { type: 'batch'; taskId: string; batch: ScannedFileInfo[] }
  | { type: 'done'; taskId: string; scannedCount: number }
  | { type: 'error'; taskId: string; error: string }

export class FileScanWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingScan>()

  async scan(
    paths: string[],
    excludePaths?: Set<string>,
    batchSize?: number,
  ): Promise<ScannedFileInfo[]> {
    const taskId = `scan-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const worker = this.ensureWorker()

    return new Promise<ScannedFileInfo[]>((resolve, reject) => {
      this.pending.set(taskId, { results: [], resolve, reject })

      worker.postMessage({
        type: 'scan',
        taskId,
        paths,
        excludePaths: excludePaths ? Array.from(excludePaths) : undefined,
        batchSize,
      })
    })
  }

  shutdown(): void {
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    const workerPath = path.join(__dirname, 'file-scan-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerError(new Error(`FileScanWorker exited with code ${code}`))
      }
    })

    this.worker = worker
    return worker
  }

  private handleMessage(message: WorkerMessage): void {
    const pending = this.pending.get(message.taskId)
    if (!pending) {
      return
    }

    if (message.type === 'batch') {
      pending.results.push(...message.batch)
      return
    }

    if (message.type === 'done') {
      this.pending.delete(message.taskId)
      pending.resolve(pending.results)
      return
    }

    if (message.type === 'error') {
      this.pending.delete(message.taskId)
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
    this.worker?.terminate()
    this.worker = null
    fileProviderLog.warn('[FileScanWorker] Worker failed, will restart on demand', {
      error,
    })
  }
}
