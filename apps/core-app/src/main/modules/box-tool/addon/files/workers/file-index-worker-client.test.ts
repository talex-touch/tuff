import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IndexWorkerFile } from './file-index-worker-client'

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
    warn: vi.fn()
  })
}))

import { FileIndexWorkerClient } from './file-index-worker-client'

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

function createFile(id: number, name: string): IndexWorkerFile {
  return {
    id,
    path: `/tmp/${name}`,
    name,
    extension: '.txt',
    size: 10,
    mtime: 1,
    ctime: 1
  }
}

describe('FileIndexWorkerClient idle shutdown', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the idle worker after indexing and restarts on next batch', async () => {
    vi.useFakeTimers()
    const client = new FileIndexWorkerClient()
    const firstBatch = client.indexFiles('/tmp/search.db', 'local', 'file', [
      createFile(1, 'a.txt')
    ])
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'index',
      dbPath: '/tmp/search.db',
      providerId: 'local',
      providerType: 'file',
      files: [expect.objectContaining({ id: 1, name: 'a.txt' })]
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      processed: 1,
      failed: 0
    })
    await expect(firstBatch).resolves.toEqual({ processed: 1, failed: 0 })

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondBatch = client.indexFiles('/tmp/search.db', 'local', 'file', [
      createFile(2, 'b.txt')
    ])
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'index',
      files: [expect.objectContaining({ id: 2, name: 'b.txt' })]
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      processed: 1,
      failed: 0
    })

    await expect(secondBatch).resolves.toEqual({ processed: 1, failed: 0 })
  })

  it('keeps the worker alive while status metrics are pending', async () => {
    vi.useFakeTimers()
    const client = new FileIndexWorkerClient()
    const batch = client.indexFiles('/tmp/search.db', 'local', 'file', [createFile(1, 'a.txt')])
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      processed: 1,
      failed: 0
    })
    await expect(batch).resolves.toEqual({ processed: 1, failed: 0 })

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'file-index',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })
})
