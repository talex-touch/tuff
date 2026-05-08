import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  const workers: MockWorker[] = []

  class MockWorker {
    readonly threadId = 1
    readonly messages: unknown[] = []
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

describe('SearchIndexWorkerClient init gate', () => {
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
})
