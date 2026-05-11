import { Buffer } from 'node:buffer'
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
    warn: vi.fn()
  })
}))

import { IconWorkerClient } from './icon-worker-client'
import { ThumbnailWorkerClient } from './thumbnail-worker-client'

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

describe('asset worker clients idle shutdown', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the idle icon worker after extraction and restarts on demand', async () => {
    vi.useFakeTimers()
    const client = new IconWorkerClient()
    const firstExtract = client.extract('/tmp/first.txt')
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'extract',
      filePath: '/tmp/first.txt'
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      buffer: Buffer.from('first-icon')
    })
    await expect(firstExtract).resolves.toEqual(Buffer.from('first-icon'))

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondExtract = client.extract('/tmp/second.txt')
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'extract',
      filePath: '/tmp/second.txt'
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      buffer: null
    })

    await expect(secondExtract).resolves.toBeNull()
  })

  it('terminates the idle thumbnail worker after generation and restarts on demand', async () => {
    vi.useFakeTimers()
    const client = new ThumbnailWorkerClient()
    const firstGenerate = client.generate('/tmp/first.png')
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'thumbnail',
      filePath: '/tmp/first.png'
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      thumbnail: 'data:image/png;base64,first'
    })
    await expect(firstGenerate).resolves.toBe('data:image/png;base64,first')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondGenerate = client.generate('/tmp/second.png')
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'thumbnail',
      filePath: '/tmp/second.png'
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      thumbnail: null
    })

    await expect(secondGenerate).resolves.toBeNull()
  })

  it('keeps the icon worker alive while status metrics are pending', async () => {
    vi.useFakeTimers()
    const client = new IconWorkerClient()
    const extract = client.extract('/tmp/icon.txt')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      buffer: Buffer.from('icon')
    })
    await expect(extract).resolves.toEqual(Buffer.from('icon'))

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'icon',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })

  it('keeps the thumbnail worker alive while status metrics are pending', async () => {
    vi.useFakeTimers()
    const client = new ThumbnailWorkerClient()
    const generate = client.generate('/tmp/preview.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      thumbnail: 'data:image/png;base64,preview'
    })
    await expect(generate).resolves.toBe('data:image/png;base64,preview')

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'thumbnail',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })
})
