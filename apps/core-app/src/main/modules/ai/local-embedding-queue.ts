import { AsyncLocalStorage } from 'node:async_hooks'

export type EmbeddingPriority = 'interactive' | 'background'

/** Separate depths so an indexing backlog can never fill the lane a user query waits in. */
export const EMBEDDING_QUEUE_LIMITS: Readonly<Record<EmbeddingPriority, number>> = {
  interactive: 8,
  background: 64
}

/** Longest a search query waits for the helper slot; the running job is never interrupted. */
export const INTERACTIVE_QUEUE_WAIT_MS = 2_500

const priorityScope = new AsyncLocalStorage<EmbeddingPriority>()

/** Everything awaited inside `run`, including the SDK hop to the runtime, queues at this priority. */
export function runWithEmbeddingPriority<T>(priority: EmbeddingPriority, run: () => T): T {
  return priorityScope.run(priority, run)
}

export function currentEmbeddingPriority(): EmbeddingPriority {
  return priorityScope.getStore() ?? 'background'
}

interface Waiter {
  readonly grant: () => void
  readonly fail: (error: unknown) => void
}

/** One running slot; waiters are served interactive first, then in arrival order. */
export class EmbeddingJobQueue {
  private running = false
  private readonly waiting: Record<EmbeddingPriority, Waiter[]> = {
    interactive: [],
    background: []
  }

  constructor(private readonly cancelled: () => Error) {}

  /** Resolves with the single-use release of the running slot. */
  acquire(priority: EmbeddingPriority, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(this.cancelled())
    if (!this.running) {
      this.running = true
      return Promise.resolve(this.slot())
    }
    const lane = this.waiting[priority]
    if (lane.length >= EMBEDDING_QUEUE_LIMITS[priority]) {
      return Promise.reject(
        new Error(`Local EmbeddingGemma ${priority} queue is full (${lane.length} waiting)`)
      )
    }
    return new Promise<() => void>((resolve, reject) => {
      let onAbort: () => void = () => undefined
      let timer: NodeJS.Timeout | undefined
      // Whichever of grant, fail, abort and timeout comes first ends the other three.
      const settle = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const waiter: Waiter = {
        grant: () => {
          settle()
          resolve(this.slot())
        },
        fail: (error) => {
          settle()
          reject(error)
        }
      }
      const leaveLane = () => lane.splice(lane.indexOf(waiter), 1)
      onAbort = () => {
        settle()
        leaveLane()
        reject(this.cancelled())
      }
      lane.push(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (priority === 'interactive') {
        timer = setTimeout(() => {
          settle()
          leaveLane()
          reject(new Error('Local EmbeddingGemma runtime is busy'))
        }, INTERACTIVE_QUEUE_WAIT_MS)
        timer.unref()
      }
    })
  }

  /** Rejects every waiter; the running job keeps its slot until it releases it. */
  close(error: Error): void {
    for (const waiter of [
      ...this.waiting.interactive.splice(0),
      ...this.waiting.background.splice(0)
    ]) {
      waiter.fail(error)
    }
  }

  private slot(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.interactive.shift() ?? this.waiting.background.shift()
      if (next) next.grant()
      else this.running = false
    }
  }
}
