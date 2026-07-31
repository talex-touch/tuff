import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginSqliteWorkerClient } from './plugin-sqlite-worker-client'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void
  const workers: MockWorker[] = []

  class MockWorker {
    readonly messages: unknown[] = []
    terminateCalls = 0
    terminationResult: Promise<number> = Promise.resolve(0)
    private readonly handlers = new Map<string, Handler[]>()

    constructor(
      readonly workerPath: string,
      readonly options: { workerData?: unknown }
    ) {
      workers.push(this)
    }

    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
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
      return this.terminationResult
    }
  }

  return { MockWorker, workers }
})

vi.mock('node:worker_threads', () => ({ Worker: workerMock.MockWorker }))

function requestIdOf(message: unknown): string {
  return (message as { requestId: string }).requestId
}

describe('pluginSqliteWorkerClient', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes operations through one worker', async () => {
    const client = new PluginSqliteWorkerClient('/tmp/plugin.sqlite')
    const first = client.execute('CREATE TABLE notes(id TEXT)', [])
    const second = client.query('SELECT * FROM notes', [])
    const worker = workerMock.workers[0]

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]).toMatchObject({ operation: { type: 'execute' } })

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[0]),
      result: { rowsAffected: 0, lastInsertRowId: null }
    })
    await expect(first).resolves.toEqual({ rowsAffected: 0, lastInsertRowId: null })
    expect(worker.messages).toHaveLength(2)

    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[1]),
      result: { rows: [], columns: ['id'] }
    })
    await expect(second).resolves.toEqual({ rows: [], columns: ['id'] })
  })

  it('passes the purpose-built read-only mode to the worker', async () => {
    const client = new PluginSqliteWorkerClient('/tmp/browser-history.sqlite', {
      readOnly: true
    })
    const pending = client.query('SELECT url FROM urls', [])
    const worker = workerMock.workers[0]

    expect(worker.options.workerData).toEqual({
      databasePath: '/tmp/browser-history.sqlite',
      readOnly: true
    })
    worker.emit('message', {
      type: 'result',
      requestId: requestIdOf(worker.messages[0]),
      result: { rows: [], columns: ['url'] }
    })
    await expect(pending).resolves.toEqual({ rows: [], columns: ['url'] })
    await client.close()
  })

  it('fails closed when the queue limit is exceeded', async () => {
    const client = new PluginSqliteWorkerClient('/tmp/plugin.sqlite', {
      maxQueueDepth: 2
    })
    const first = client.execute('DELETE FROM notes', [])
    const second = client.execute('DELETE FROM notes', [])
    const rejected = client.execute('DELETE FROM notes', [])

    await expect(rejected).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_CONCURRENCY_LIMIT'
    })
    const firstFailure = expect(first).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_WORKER_UNAVAILABLE'
    })
    const secondFailure = expect(second).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_WORKER_UNAVAILABLE'
    })
    await client.close()
    await firstFailure
    await secondFailure
  })

  it('terminates the worker and rejects all operations on timeout', async () => {
    const client = new PluginSqliteWorkerClient('/tmp/plugin.sqlite', { timeoutMs: 25 })
    const first = client.query('SELECT * FROM notes', [])
    const second = client.execute('DELETE FROM notes', [])
    const worker = workerMock.workers[0]

    const firstFailure = expect(first).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_TIMEOUT' })
    const secondFailure = expect(second).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_WORKER_UNAVAILABLE'
    })
    await vi.advanceTimersByTimeAsync(25)

    await firstFailure
    await secondFailure
    expect(worker.terminateCalls).toBe(1)
  })

  it('keeps the active promise pending until delayed termination completes', async () => {
    let releaseTermination: (() => void) | undefined
    const client = new PluginSqliteWorkerClient('/tmp/plugin.sqlite', { timeoutMs: 25 })
    const first = client.query('SELECT * FROM notes', [])
    const worker = workerMock.workers[0]
    worker.terminationResult = new Promise<number>((resolve) => {
      releaseTermination = () => resolve(0)
    })
    let settled = false
    const failure = first.catch((error: unknown) => {
      settled = true
      return error
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(worker.terminateCalls).toBe(1)
    expect(settled).toBe(false)

    releaseTermination?.()
    await expect(failure).resolves.toMatchObject({ code: 'PLUGIN_SQLITE_TIMEOUT' })
    expect(settled).toBe(true)
  })

  it('preserves stable worker error codes without exposing native errors', async () => {
    const client = new PluginSqliteWorkerClient('/tmp/plugin.sqlite')
    const pending = client.execute('DELETE FROM notes', [])
    const worker = workerMock.workers[0]

    worker.emit('message', {
      type: 'error',
      requestId: requestIdOf(worker.messages[0]),
      code: 'PLUGIN_SQLITE_DISK_QUOTA',
      error: 'Plugin SQLite database quota exceeded.'
    })

    await expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_DISK_QUOTA',
      message: 'Plugin SQLite database quota exceeded.'
    })
  })
})
