import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  const workers: MockWorker[] = []

  class MockWorker {
    readonly threadId = 1
    readonly messages: unknown[] = []
    terminateCalls = 0
    private readonly handlers = new Map<string, Handler[]>()

    constructor(readonly workerPath: string) {
      workers.push(this)
    }

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
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload)
      }
    }

    terminate(): Promise<number> {
      this.terminateCalls += 1
      return Promise.resolve(0)
    }
  }

  return { MockWorker, workers }
})

vi.mock('node:worker_threads', () => ({
  Worker: workerMock.MockWorker
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn()
  })
}))

import { SearchIndexWorkerClient } from './search-index-worker-client'

function taskIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('taskId' in message)) {
    throw new Error('message has no taskId')
  }
  return String((message as { taskId: unknown }).taskId)
}

function messageTypeOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    throw new Error('message has no type')
  }
  return String((message as { type: unknown }).type)
}

describe('SearchIndexWorkerClient init gate', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for init before dispatching write operations', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]).toMatchObject({ type: 'init' })

    const removePromise = client.removeItems(['file:/tmp/demo.txt'])
    await Promise.resolve()

    expect(worker.messages).toHaveLength(1)

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(worker.messages[1]).toMatchObject({
      type: 'removeItems',
      itemIds: ['file:/tmp/demo.txt']
    })
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })

    await expect(removePromise).resolves.toBeUndefined()
  })

  it('rejects pending writes on init failure and allows init retry', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!
    const removePromise = client.removeItems(['file:/tmp/demo.txt'])

    const initRejection = expect(initPromise).rejects.toThrow('init failed')
    const removeRejection = expect(removePromise).rejects.toThrow('init failed')

    worker.emit('message', {
      type: 'error',
      taskId: taskIdOf(worker.messages[0]),
      error: 'init failed'
    })

    await initRejection
    await removeRejection

    const retryPromise = client.init('/tmp/search-index.db')
    expect(worker.messages).toHaveLength(2)
    expect(worker.messages[1]).toMatchObject({ type: 'init' })

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })

    await expect(retryPromise).resolves.toBeUndefined()
  })

  it('restarts and reinitializes on demand after idle shutdown', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(1)

    const removePromise = client.removeItems(['file:/tmp/demo.txt'])
    const restartedWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(restartedWorker.messages).toHaveLength(1)
    expect(restartedWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })

    restartedWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(restartedWorker.messages[0])
    })
    await vi.waitFor(() => expect(restartedWorker.messages).toHaveLength(2))
    expect(restartedWorker.messages[1]).toMatchObject({
      type: 'removeItems',
      itemIds: ['file:/tmp/demo.txt']
    })

    restartedWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(restartedWorker.messages[1])
    })

    await expect(removePromise).resolves.toBeUndefined()
  })

  it('does not terminate during status metrics sampling and restarts the idle window after timeout', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'search-index',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })

  it('reports pending work while a worker task is in flight', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const removePromise = client.removeItems(['file:/tmp/demo.txt'])
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(client.hasPendingWork()).toBe(true)

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })
    await removePromise

    expect(client.hasPendingWork()).toBe(false)
  })
})
