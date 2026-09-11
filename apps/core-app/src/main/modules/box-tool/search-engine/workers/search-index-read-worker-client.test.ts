import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  class MockWorker {
    readonly messages: unknown[] = []
    terminateCalls = 0
    private readonly handlers = new Map<string, Handler[]>()

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    postMessage(message: unknown): void {
      this.messages.push(message)
    }

    emit(event: string, payload: unknown): void {
      for (const handler of this.handlers.get(event) ?? []) handler(payload)
    }

    terminate(): Promise<number> {
      this.terminateCalls += 1
      return Promise.resolve(0)
    }
  }

  const workers: MockWorker[] = []
  return {
    MockWorker: class extends MockWorker {
      constructor(...args: ConstructorParameters<typeof MockWorker>) {
        super(...args)
        workers.push(this)
      }
    },
    workers
  }
})

vi.mock('node:worker_threads', () => ({ Worker: workerMock.MockWorker }))

import { sql } from 'drizzle-orm'
import {
  SearchIndexReadWorkerCancelledError,
  SearchIndexReadWorkerClient,
  SearchIndexReadWorkerTimeoutError,
  SearchIndexReadWorkerUnavailableError
} from './search-index-read-worker-client'

function requestIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('requestId' in message)) {
    throw new Error('query message has no request id')
  }
  return String(message.requestId)
}

function createClient(): SearchIndexReadWorkerClient {
  return new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
    workerPath: '/fixture/search-index-read-worker.js',
    timeoutMs: 10_000,
    maxQueueDepth: 4
  })
}

describe('SearchIndexReadWorkerClient lifecycle', () => {
  it('fences an active cancelled query until its worker result arrives, then starts the next query', async () => {
    const client = createClient()
    const activeAbort = new AbortController()
    const active = client.all<{ itemId: string }>(sql`SELECT 'stale' AS itemId`, activeAbort.signal)
    const worker = workerMock.workers.at(-1)!
    const queued = client.all<{ itemId: string }>(sql`SELECT 'fresh' AS itemId`)

    activeAbort.abort()
    await expect(active).rejects.toBeInstanceOf(SearchIndexReadWorkerCancelledError)
    expect(worker.messages).toHaveLength(1)

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[0]),
      rows: [{ itemId: 'stale' }]
    })
    expect(worker.messages).toHaveLength(2)

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[1]),
      rows: [{ itemId: 'fresh' }]
    })
    await expect(queued).resolves.toEqual([{ itemId: 'fresh' }])
    await client.close()
  })

  it('removes an aborted queued query instead of dispatching it after the active read', async () => {
    const client = createClient()
    const active = client.all<{ itemId: string }>(sql`SELECT 'first' AS itemId`)
    const worker = workerMock.workers.at(-1)!
    const queuedAbort = new AbortController()
    const queued = client.all<{ itemId: string }>(
      sql`SELECT 'cancelled' AS itemId`,
      queuedAbort.signal
    )
    const later = client.all<{ itemId: string }>(sql`SELECT 'later' AS itemId`)

    queuedAbort.abort()
    await expect(queued).rejects.toBeInstanceOf(SearchIndexReadWorkerCancelledError)

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[0]),
      rows: [{ itemId: 'first' }]
    })
    await expect(active).resolves.toEqual([{ itemId: 'first' }])
    expect(worker.messages).toHaveLength(2)

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[1]),
      rows: [{ itemId: 'later' }]
    })
    await expect(later).resolves.toEqual([{ itemId: 'later' }])
    await client.close()
  })

  it('times out one active read, settles its queue, and never dispatches queued work afterward', async () => {
    vi.useFakeTimers()
    try {
      const client = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js',
        timeoutMs: 5,
        maxQueueDepth: 4
      })
      const active = client.all(sql`SELECT 'active'`)
      const worker = workerMock.workers.at(-1)!
      const queued = client.all(sql`SELECT 'queued'`)
      const activeRejection = expect(active).rejects.toBeInstanceOf(
        SearchIndexReadWorkerTimeoutError
      )
      const queuedRejection = expect(queued).rejects.toBeInstanceOf(
        SearchIndexReadWorkerTimeoutError
      )

      await vi.advanceTimersByTimeAsync(5)

      await activeRejection
      await queuedRejection
      expect(worker.terminateCalls).toBe(1)
      expect(worker.messages).toHaveLength(1)
      await expect(client.all(sql`SELECT 'after timeout'`)).rejects.toBeInstanceOf(
        SearchIndexReadWorkerUnavailableError
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles active and queued callers when the worker fails, without retrying reads on the parent', async () => {
    const client = createClient()
    const active = client.all(sql`SELECT 'active'`)
    const worker = workerMock.workers.at(-1)!
    const queued = client.all(sql`SELECT 'queued'`)

    worker.emit('error', new Error('worker lost'))

    await expect(active).rejects.toThrow('worker lost')
    await expect(queued).rejects.toThrow('worker lost')
    await expect(client.all(sql`SELECT 'after failure'`)).rejects.toBeInstanceOf(
      SearchIndexReadWorkerUnavailableError
    )
    expect(worker.terminateCalls).toBe(1)
  })

  it('settles active and queued callers when close races an in-flight read', async () => {
    const client = createClient()
    const active = client.all(sql`SELECT 'active'`)
    const worker = workerMock.workers.at(-1)!
    const queued = client.all(sql`SELECT 'queued'`)

    await client.close()

    await expect(active).rejects.toBeInstanceOf(SearchIndexReadWorkerUnavailableError)
    await expect(queued).rejects.toBeInstanceOf(SearchIndexReadWorkerUnavailableError)
    expect(worker.terminateCalls).toBe(1)
  })
})
