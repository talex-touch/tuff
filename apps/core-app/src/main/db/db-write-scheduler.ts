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
  /** If true, this task can be dropped when queue wait time exceeds the threshold. */
  droppable?: boolean
}

export interface ScheduleOptions {
  /**
   * Mark this task as droppable under queue pressure.
   * When a droppable task has waited longer than DROPPABLE_TIMEOUT_MS,
   * it will be rejected with a timeout error instead of executed.
   */
  droppable?: boolean
}

/** Tasks marked as droppable are rejected after waiting this long in the queue. */
const DROPPABLE_TIMEOUT_MS = 10_000

export class DbWriteScheduler {
  private queue: DbWriteTask<unknown>[] = []
  private processing = false
  private currentTaskLabel: string | null = null
  private drainResolvers: Array<() => void> = []
  private capacityResolvers: Array<{ maxQueued: number; resolve: () => void }> = []

  private enqueue<T>(task: DbWriteTask<T>): void {
    this.queue.push(task as DbWriteTask<unknown>)
  }

  async schedule<T>(
    label: string,
    operation: () => Promise<T>,
    options?: ScheduleOptions
  ): Promise<T> {
    if (taskContext.getStore()) {
      return operation()
    }

    return new Promise<T>((resolve, reject) => {
      this.enqueue({
        label,
        operation,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        droppable: options?.droppable
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

  /**
   * Wait until the queue depth drops below `maxQueued`.
   * Use this to apply backpressure on producers that generate DB tasks
   * faster than they can be consumed (e.g. fullScan fire-and-forget chains).
   */
  async waitForCapacity(maxQueued: number): Promise<void> {
    if (this.queue.length < maxQueued) return

    await new Promise<void>((resolve) => {
      this.capacityResolvers.push({ maxQueued, resolve })
    })
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

  private notifyCapacityWaiters(): void {
    if (this.capacityResolvers.length === 0) return

    const remaining: typeof this.capacityResolvers = []
    for (const waiter of this.capacityResolvers) {
      if (this.queue.length < waiter.maxQueued) {
        waiter.resolve()
      } else {
        remaining.push(waiter)
      }
    }
    this.capacityResolvers = remaining
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return

    this.processing = true

    let taskCount = 0
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      const waitedMs = Date.now() - task.enqueuedAt
      this.currentTaskLabel = task.label

      if (waitedMs > 2000) {
        // Rate-limit slow-wait warnings: only log every 20th occurrence
        // during heavy indexing to avoid flooding the log with 11K+ entries.
        taskCount++
        if (taskCount <= 3 || taskCount % 20 === 0) {
          log.warn(
            `DB write task waited ${waitedMs}ms: ${task.label}` +
              (taskCount > 3 ? ` (${taskCount} slow tasks so far)` : '')
          )
        }
      }

      // Drop droppable tasks that have waited too long (queue pressure relief)
      if (task.droppable && waitedMs > DROPPABLE_TIMEOUT_MS) {
        log.warn(`Dropping stale droppable task after ${waitedMs}ms: ${task.label}`)
        task.reject(
          new Error(`DB write task dropped after ${waitedMs}ms queue wait: ${task.label}`)
        )
        this.currentTaskLabel = null
        this.notifyCapacityWaiters()
        continue
      }

      try {
        const result = await taskContext.run(true, task.operation)
        task.resolve(result)
      } catch (error) {
        task.reject(error)
      } finally {
        this.currentTaskLabel = null
      }

      // Notify capacity waiters after completing a task
      this.notifyCapacityWaiters()

      // Yield to event loop after every task to prevent blocking.
      // SQLite operations are synchronous at the driver level — even a single
      // INSERT can block for 50-200ms, so yielding every 3 tasks is not enough.
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    this.processing = false

    // Final capacity notification when queue is empty
    this.notifyCapacityWaiters()

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
