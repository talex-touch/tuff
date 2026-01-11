import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileProviderLog } from '../../../../../utils/logger'

export type ReconcileDiskFile = {
  path: string
  name: string
  extension: string
  size: number
  mtime: number
  ctime: number
}

export type ReconcileDbFile = {
  id: number
  path: string
  mtime: number
}

export type ReconcileResult = {
  filesToAdd: ReconcileDiskFile[]
  filesToUpdate: Array<ReconcileDiskFile & { id: number }>
  deletedIds: number[]
}

type PendingReconcile = {
  resolve: (value: ReconcileResult) => void
  reject: (error: Error) => void
}

type WorkerMessage =
  | { type: 'done'; taskId: string; result: ReconcileResult }
  | { type: 'error'; taskId: string; error: string }

export class FileReconcileWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingReconcile>()

  async reconcile(
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[],
  ): Promise<ReconcileResult> {
    const taskId = `reconcile-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const worker = this.ensureWorker()

    return new Promise<ReconcileResult>((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject })

      worker.postMessage({
        type: 'reconcile',
        taskId,
        diskFiles,
        dbFiles,
        reconciliationPaths,
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

    const workerPath = path.join(__dirname, 'file-reconcile-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerError(error))
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerError(new Error(`FileReconcileWorker exited with code ${code}`))
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
      pending.resolve(message.result)
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
    fileProviderLog.warn('[FileReconcileWorker] Worker failed, will restart on demand', {
      error,
    })
  }
}
