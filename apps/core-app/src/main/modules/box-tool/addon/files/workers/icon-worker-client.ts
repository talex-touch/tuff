import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileProviderLog } from '../../../../../utils/logger'

type PendingIcon = {
  resolve: (value: Buffer | null) => void
  reject: (error: Error) => void
}

type WorkerMessage =
  | { type: 'done'; taskId: string; buffer: Buffer | null }
  | { type: 'error'; taskId: string; error: string }

export class IconWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingIcon>()

  async extract(filePath: string): Promise<Buffer | null> {
    const taskId = `icon-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const worker = this.ensureWorker()

    return new Promise<Buffer | null>((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject })

      worker.postMessage({
        type: 'extract',
        taskId,
        filePath,
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
    return worker
  }

  private handleMessage(message: WorkerMessage): void {
    const pending = this.pending.get(message.taskId)
    if (!pending) {
      return
    }

    if (message.type === 'done') {
      this.pending.delete(message.taskId)
      pending.resolve(message.buffer ?? null)
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
    fileProviderLog.warn('[IconWorker] Worker failed, will restart on demand', {
      error,
    })
  }
}
