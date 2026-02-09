import { AsyncLocalStorage } from 'node:async_hooks'
import { createLogger } from '../utils/logger'

const log = createLogger('DbWriteScheduler')

const taskContext = new AsyncLocalStorage<boolean>()

export interface DbWriteTask<T> {
  label: string
  operation: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  enqueuedAt: number
}

export class DbWriteScheduler {
  private queue: DbWriteTask<unknown>[] = []
  private processing = false
  private currentTaskLabel: string | null = null
  private drainResolvers: Array<() => void> = []

  private enqueue<T>(task: DbWriteTask<T>): void {
    this.queue.push(task as DbWriteTask<unknown>)
  }

  async schedule<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (taskContext.getStore()) {
      return operation()
    }

    return new Promise<T>((resolve, reject) => {
      this.enqueue({
        label,
        operation,
        resolve,
        reject,
        enqueuedAt: Date.now()
      })
      this.kick()
    })
  }

  getStats(): { queued: number; processing: boolean; currentTaskLabel: string | null } {
    return {
      queued: this.queue.length,
      processing: this.processing,
      currentTaskLabel: this.currentTaskLabel
    }
  }

  async drain(): Promise<void> {
    if (!this.processing && this.queue.length === 0) return

    await new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve)
      this.kick()
    })
  }

  private kick(): void {
    if (this.processing) return
    if (this.queue.length === 0) return

    void this.processLoop()
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return

    this.processing = true

    let taskCount = 0
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      const waitedMs = Date.now() - task.enqueuedAt
      this.currentTaskLabel = task.label

      if (waitedMs > 500) {
        log.warn(`DB write task waited ${waitedMs}ms: ${task.label}`)
      }

      try {
        const result = await taskContext.run(true, task.operation)
        task.resolve(result)
      } catch (error) {
        task.reject(error)
      } finally {
        this.currentTaskLabel = null
      }

      // Yield to event loop every 3 tasks to prevent starving other operations
      taskCount++
      if (taskCount % 3 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    this.processing = false

    if (this.queue.length === 0) {
      const resolvers = this.drainResolvers
      this.drainResolvers = []
      for (const resolve of resolvers) {
        resolve()
      }
    }
  }
}

export const dbWriteScheduler = new DbWriteScheduler()
