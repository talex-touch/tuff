import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  class MockWorker {
    readonly messages: unknown[] = []
    terminateCalls = 0
    unrefCalls = 0
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
      this.unrefCalls += 1
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

interface RetirableWorker {
  terminateCalls: number
  unrefCalls: number
  messages: unknown[]
}

/**
 * Terminating a reader that may be inside a native query aborts the entire process (libSQL's neon
 * binding asserts on the pending exception), so a retired reader is asked to close its connection
 * and leave, never killed.
 */
function expectRetiredWithoutTermination(worker: RetirableWorker): void {
  expect(worker.terminateCalls).toBe(0)
  expect(worker.unrefCalls).toBe(1)
  expect(worker.messages.at(-1)).toEqual({ type: 'shutdown' })
}

/**
 * Drives one worker-level failure (a query timeout) to completion under fake timers, so a caller can
 * build up the consecutive-failure count the way a real session does.
 */
async function failNextReadByTimeout(
  client: SearchIndexReadWorkerClient,
  timeoutMs: number
): Promise<void> {
  const read = client.all(sql`SELECT 'timed out'`)
  const rejection = expect(read).rejects.toBeInstanceOf(SearchIndexReadWorkerTimeoutError)
  await vi.advanceTimersByTimeAsync(timeoutMs)
  await rejection
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

  it('times out one active read, settles its queue, then rebuilds a worker for the next query', async () => {
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
      expectRetiredWithoutTermination(worker)
      expect(worker.messages).toHaveLength(2)

      // The retired worker is not the client's tombstone: the next read builds a fresh one.
      const afterTimeout = client.all<{ itemId: string }>(sql`SELECT 'after timeout'`)
      const rebuilt = workerMock.workers.at(-1)!
      expect(rebuilt).not.toBe(worker)
      expect(rebuilt.messages).toHaveLength(1)

      rebuilt.emit('message', {
        type: 'result',
        requestId: requestIdOf(rebuilt.messages[0]),
        rows: [{ itemId: 'after timeout' }]
      })
      await expect(afterTimeout).resolves.toEqual([{ itemId: 'after timeout' }])
      expectRetiredWithoutTermination(worker)
      expect(rebuilt.terminateCalls).toBe(0)
      await client.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops rebuilding workers once three consecutive failures trip the cooldown', async () => {
    vi.useFakeTimers()
    try {
      const client = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js',
        timeoutMs: 5,
        maxQueueDepth: 4
      })

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await failNextReadByTimeout(client, 5)
      }

      // A reader failing for a permanent reason must not strand one thread per query.
      const workersBeforeCooldown = workerMock.workers.length
      await expect(client.all(sql`SELECT 'during cooldown'`)).rejects.toThrow('cooling down')
      await expect(client.all(sql`SELECT 'during cooldown'`)).rejects.toBeInstanceOf(
        SearchIndexReadWorkerUnavailableError
      )
      expect(workerMock.workers).toHaveLength(workersBeforeCooldown)

      // The cooldown quiets a broken reader; it never latches it shut for the session.
      await vi.advanceTimersByTimeAsync(30_000)
      const afterCooldown = client.all<{ itemId: string }>(sql`SELECT 'after cooldown'`)
      const rebuilt = workerMock.workers.at(-1)!
      expect(workerMock.workers).toHaveLength(workersBeforeCooldown + 1)

      rebuilt.emit('message', {
        type: 'result',
        requestId: requestIdOf(rebuilt.messages[0]),
        rows: [{ itemId: 'after cooldown' }]
      })
      await expect(afterCooldown).resolves.toEqual([{ itemId: 'after cooldown' }])
      await client.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the consecutive-failure budget after a successful read', async () => {
    vi.useFakeTimers()
    try {
      const client = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js',
        timeoutMs: 5,
        maxQueueDepth: 4
      })

      await failNextReadByTimeout(client, 5)
      await failNextReadByTimeout(client, 5)

      const recovered = client.all<{ itemId: string }>(sql`SELECT 'recovered'`)
      const recoveredWorker = workerMock.workers.at(-1)!
      recoveredWorker.emit('message', {
        type: 'result',
        requestId: requestIdOf(recoveredWorker.messages[0]),
        rows: [{ itemId: 'recovered' }]
      })
      await expect(recovered).resolves.toEqual([{ itemId: 'recovered' }])

      // Four failures in total, but only two since the last good read, so no cooldown.
      await failNextReadByTimeout(client, 5)
      await failNextReadByTimeout(client, 5)

      const stillReadable = client.all<{ itemId: string }>(sql`SELECT 'still readable'`)
      const rebuilt = workerMock.workers.at(-1)!
      expect(rebuilt).not.toBe(recoveredWorker)

      rebuilt.emit('message', {
        type: 'result',
        requestId: requestIdOf(rebuilt.messages[0]),
        rows: [{ itemId: 'still readable' }]
      })
      await expect(stillReadable).resolves.toEqual([{ itemId: 'still readable' }])
      await client.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the worker and the failure budget for query-level errors', async () => {
    vi.useFakeTimers()
    try {
      const client = new SearchIndexReadWorkerClient('/tmp/search-index.sqlite', {
        workerPath: '/fixture/search-index-read-worker.js',
        timeoutMs: 5,
        maxQueueDepth: 4
      })
      const firstRead = client.all(sql`SELECT 'broken'`)
      const worker = workerMock.workers.at(-1)!
      const rejectActiveStatement = (): void => {
        worker.emit('message', {
          type: 'error',
          requestId: requestIdOf(worker.messages.at(-1)),
          error: { name: 'SqliteError', message: 'no such table: broken', code: 'SQLITE_ERROR' }
        })
      }

      // A statement the reader rejects is the caller's problem, not a dying reader.
      const firstRejection = expect(firstRead).rejects.toThrow('no such table: broken')
      rejectActiveStatement()
      await firstRejection

      const secondRead = client.all(sql`SELECT 'broken'`)
      const secondRejection = expect(secondRead).rejects.toThrow('no such table: broken')
      rejectActiveStatement()
      await secondRejection

      expect(worker.unrefCalls).toBe(0)
      expect(worker.messages).toHaveLength(2)

      // Two real worker failures are still short of the three that trip the cooldown, and they
      // only stay short if the rejected statements above were not counted as failures.
      await failNextReadByTimeout(client, 5)
      await failNextReadByTimeout(client, 5)

      const stillReadable = client.all<{ itemId: string }>(sql`SELECT 'still readable'`)
      const rebuilt = workerMock.workers.at(-1)!
      expect(rebuilt).not.toBe(worker)
      rebuilt.emit('message', {
        type: 'result',
        requestId: requestIdOf(rebuilt.messages[0]),
        rows: [{ itemId: 'still readable' }]
      })
      await expect(stillReadable).resolves.toEqual([{ itemId: 'still readable' }])
      await client.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles active and queued callers when the worker fails, then rebuilds a worker for the next read', async () => {
    const client = createClient()
    const active = client.all(sql`SELECT 'active'`)
    const worker = workerMock.workers.at(-1)!
    const queued = client.all(sql`SELECT 'queued'`)

    worker.emit('error', new Error('worker lost'))

    await expect(active).rejects.toThrow('worker lost')
    await expect(queued).rejects.toThrow('worker lost')
    expectRetiredWithoutTermination(worker)

    const afterFailure = client.all<{ itemId: string }>(sql`SELECT 'after failure'`)
    const rebuilt = workerMock.workers.at(-1)!
    expect(rebuilt).not.toBe(worker)

    rebuilt.emit('message', {
      type: 'result',
      requestId: requestIdOf(rebuilt.messages[0]),
      rows: [{ itemId: 'after failure' }]
    })
    await expect(afterFailure).resolves.toEqual([{ itemId: 'after failure' }])
    expect(rebuilt.terminateCalls).toBe(0)
    await client.close()
  })

  it('settles active and queued callers when close races an in-flight read', async () => {
    const client = createClient()
    const active = client.all(sql`SELECT 'active'`)
    const worker = workerMock.workers.at(-1)!
    const queued = client.all(sql`SELECT 'queued'`)

    await client.close()

    await expect(active).rejects.toBeInstanceOf(SearchIndexReadWorkerUnavailableError)
    await expect(queued).rejects.toBeInstanceOf(SearchIndexReadWorkerUnavailableError)
    expectRetiredWithoutTermination(worker)
  })
})
