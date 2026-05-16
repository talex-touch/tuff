import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReconcileDiskFile, ReconcileResult } from './file-reconcile-worker-client'

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

import { FileReconcileWorkerClient } from './file-reconcile-worker-client'

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

function createDiskFile(name: string): ReconcileDiskFile {
  return {
    path: `/tmp/${name}`,
    name,
    extension: '.txt',
    size: 10,
    mtime: 1,
    ctime: 1
  }
}

describe('FileReconcileWorkerClient idle shutdown', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the idle worker after reconciliation and restarts on next batch', async () => {
    vi.useFakeTimers()
    const client = new FileReconcileWorkerClient()
    const firstResult: ReconcileResult = {
      filesToAdd: [createDiskFile('a.txt')],
      filesToUpdate: [],
      deletedIds: []
    }
    const firstReconcile = client.reconcile([createDiskFile('a.txt')], [], ['/tmp'])
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'reconcile',
      diskFiles: [expect.objectContaining({ name: 'a.txt' })],
      dbFiles: [],
      reconciliationPaths: ['/tmp']
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      result: firstResult
    })
    await expect(firstReconcile).resolves.toEqual(firstResult)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondResult: ReconcileResult = {
      filesToAdd: [],
      filesToUpdate: [],
      deletedIds: [1]
    }
    const secondReconcile = client.reconcile(
      [],
      [{ id: 1, path: '/tmp/a.txt', mtime: 1 }],
      ['/tmp']
    )
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'reconcile',
      dbFiles: [expect.objectContaining({ id: 1, path: '/tmp/a.txt' })]
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      result: secondResult
    })

    await expect(secondReconcile).resolves.toEqual(secondResult)
  })

  it('keeps the worker alive while status metrics are pending', async () => {
    vi.useFakeTimers()
    const client = new FileReconcileWorkerClient()
    const result: ReconcileResult = {
      filesToAdd: [createDiskFile('a.txt')],
      filesToUpdate: [],
      deletedIds: []
    }
    const reconcile = client.reconcile([createDiskFile('a.txt')], [], ['/tmp'])
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      result
    })
    await expect(reconcile).resolves.toEqual(result)

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'file-reconcile',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })
})
