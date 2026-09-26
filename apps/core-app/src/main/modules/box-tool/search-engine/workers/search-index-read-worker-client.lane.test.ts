import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void
  class MockWorker {
    readonly messages: unknown[] = []
    private readonly handlers = new Map<string, Handler[]>()

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    removeAllListeners(event?: string): this {
      if (event) this.handlers.delete(event)
      else this.handlers.clear()
      return this
    }

    unref(): this {
      return this
    }

    postMessage(message: unknown): void {
      this.messages.push(message)
    }

    emit(event: string, payload: unknown): void {
      for (const handler of this.handlers.get(event) ?? []) handler(payload)
    }

    terminate(): Promise<number> {
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

const readWorkerLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

vi.mock('node:worker_threads', () => ({ Worker: workerMock.MockWorker }))
vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({ child: () => readWorkerLog })
}))

import { sql } from 'drizzle-orm'
import { SearchIndexReadWorkerClient } from './search-index-read-worker-client'

function requestIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('requestId' in message)) {
    throw new Error('query message has no request id')
  }
  return String(message.requestId)
}

/**
 * Two lanes read the same file through the same worker script, so the only way to tell a stuck
 * fast-lane read from a slow deferred one in a session log is the lane name on the request.
 */
describe('SearchIndexReadWorkerClient lanes', () => {
  it('names requests after the lane and defaults to the deferred lane', async () => {
    const deferred = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
      workerPath: '/fixture/search-index-read-worker.js'
    })
    const fast = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
      workerPath: '/fixture/search-index-read-worker.js',
      lane: 'fast'
    })

    const deferredRead = deferred.all(sql`SELECT 1`)
    const deferredWorker = workerMock.workers.at(-1)!
    const fastRead = fast.all(sql`SELECT 2`)
    const fastWorker = workerMock.workers.at(-1)!

    expect(fastWorker).not.toBe(deferredWorker)
    expect(deferred.lane).toBe('deferred')
    expect(fast.lane).toBe('fast')
    expect(requestIdOf(deferredWorker.messages[0])).toMatch(/^search-index-read-deferred-\d+$/)
    expect(requestIdOf(fastWorker.messages[0])).toMatch(/^search-index-read-fast-\d+$/)

    deferredWorker.emit('message', {
      type: 'result',
      requestId: requestIdOf(deferredWorker.messages[0]),
      rows: []
    })
    fastWorker.emit('message', {
      type: 'result',
      requestId: requestIdOf(fastWorker.messages[0]),
      rows: []
    })
    await expect(deferredRead).resolves.toEqual([])
    await expect(fastRead).resolves.toEqual([])
    await Promise.all([deferred.close(), fast.close()])
  })

  it('keeps a fast-lane read moving while the deferred lane is occupied', async () => {
    const deferred = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
      workerPath: '/fixture/search-index-read-worker.js'
    })
    const fast = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
      workerPath: '/fixture/search-index-read-worker.js',
      lane: 'fast'
    })

    // The deferred worker never answers: a 700ms file FTS in flight.
    void deferred.all(sql`SELECT 'slow file query'`).catch(() => undefined)
    const fastRead = fast.all<{ itemId: string }>(sql`SELECT 'app'`)
    const fastWorker = workerMock.workers.at(-1)!
    expect(fastWorker.messages).toHaveLength(1)
    fastWorker.emit('message', {
      type: 'result',
      requestId: requestIdOf(fastWorker.messages[0]),
      rows: [{ itemId: 'app' }]
    })
    await expect(fastRead).resolves.toEqual([{ itemId: 'app' }])
    await Promise.all([deferred.close(), fast.close()])
  })

  /**
   * The fast lane gives up at the gather's 3s provider budget while the deferred lane keeps its
   * 15s. A fast timeout retires only its own worker, names its lane in the error and the retire
   * log, and the next fast read builds a fresh worker; the deferred read is never disturbed.
   */
  it('retires only the fast lane when its budget expires and rebuilds it on the next read', async () => {
    vi.useFakeTimers()
    try {
      const deferred = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js'
      })
      const fast = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js',
        lane: 'fast',
        timeoutMs: 3000
      })

      const deferredRead = deferred.all<{ itemId: string }>(sql`SELECT 'slow file query'`)
      const deferredWorker = workerMock.workers.at(-1)!
      const fastRead = fast.all(sql`SELECT 'app'`)
      const fastWorker = workerMock.workers.at(-1)!
      const fastRejection = expect(fastRead).rejects.toThrow(
        /^SEARCH_INDEX_READ_TIMEOUT:search-index-read-fast-1:3000$/
      )

      await vi.advanceTimersByTimeAsync(3000)
      await fastRejection

      expect(fastWorker.messages.at(-1)).toEqual({ type: 'shutdown' })
      expect(readWorkerLog.warn).toHaveBeenCalledWith(
        'Search index read worker retired',
        expect.objectContaining({ meta: expect.objectContaining({ lane: 'fast' }) })
      )
      // The deferred lane still has its one query in flight: no timeout, no shutdown.
      expect(deferredWorker.messages).toHaveLength(1)

      const afterTimeout = fast.all<{ itemId: string }>(sql`SELECT 'app again'`)
      const rebuilt = workerMock.workers.at(-1)!
      expect(rebuilt).not.toBe(fastWorker)
      expect(rebuilt).not.toBe(deferredWorker)
      rebuilt.emit('message', {
        type: 'result',
        requestId: requestIdOf(rebuilt.messages[0]),
        rows: [{ itemId: 'app' }]
      })
      await expect(afterTimeout).resolves.toEqual([{ itemId: 'app' }])

      deferredWorker.emit('message', {
        type: 'result',
        requestId: requestIdOf(deferredWorker.messages[0]),
        rows: [{ itemId: 'file' }]
      })
      await expect(deferredRead).resolves.toEqual([{ itemId: 'file' }])
      await Promise.all([deferred.close(), fast.close()])
    } finally {
      vi.useRealTimers()
    }
  })
})
