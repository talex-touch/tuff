import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileProviderLog } from '../../../../../utils/logger'

export type IndexWorkerFile = {
  id: number
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  mtime: number
  ctime: number
}

type PendingIndex = {
  resolve: (value: { processed: number, failed: number }) => void
  reject: (error: Error) => void
}

type WorkerMessage =
  | { type: 'done'; taskId: string; processed: number; failed: number }
  | { type: 'error'; taskId: string; error: string }

export class FileIndexWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingIndex>()

  async indexFiles(
    dbPath: string,
    providerId: string,
    providerType: string,
    files: IndexWorkerFile[],
  ): Promise<{ processed: number, failed: number }> {
    const taskId = `index-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const worker = this.ensureWorker()

    return new Promise<{ processed: number, failed: number }>((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject })

      worker.postMessage({
        type: 'index',
        taskId,
        dbPath,
        providerId,
        providerType,
        files,
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

    const workerPath = path.join(__dirname, 'file-index-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerError(new Error(`FileIndexWorker exited with code ${code}`))
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

    if (message.type === 'done') {
      this.pending.delete(message.taskId)
      pending.resolve({ processed: message.processed, failed: message.failed })
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
    fileProviderLog.warn('[FileIndexWorker] Worker failed, will restart on demand', {
      error,
    })
  }
}
