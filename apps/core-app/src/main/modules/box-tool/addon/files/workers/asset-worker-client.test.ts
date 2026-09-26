import path from 'node:path'
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

vi.mock('../../../../../service/temp-file.service', () => ({
  tempFileService: {
    registerNamespace: vi.fn(),
    startCleanup: vi.fn(),
    resolveNamespaceDir: vi.fn(() => '/tmp/tuff/file/thumbnails')
  }
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
    const firstExtract = client.extractToFile('/tmp/first.txt', '/tmp/cache/first.png', 48)
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'extract',
      filePath: '/tmp/first.txt',
      outputPath: '/tmp/cache/first.png',
      size: 48
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      path: '/tmp/cache/first.png'
    })
    await expect(firstExtract).resolves.toBe('/tmp/cache/first.png')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondExtract = client.extractToFile('/tmp/second.txt', '/tmp/cache/second.png')
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'extract',
      filePath: '/tmp/second.txt',
      outputPath: '/tmp/cache/second.png'
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      path: null
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
      thumbnail: {
        status: 'generated',
        kind: 'image',
        path: '/tmp/tuff/file/thumbnails/first.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5,
        durationMs: 1
      }
    })
    await expect(firstGenerate).resolves.toMatchObject({
      status: 'generated',
      path: '/tmp/tuff/file/thumbnails/first.jpg'
    })

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
      thumbnail: {
        status: 'failed',
        kind: 'image',
        reason: 'decode-failed',
        durationMs: 1
      }
    })

    await expect(secondGenerate).resolves.toMatchObject({
      status: 'failed',
      reason: 'decode-failed'
    })
  })

  it('defers idle retirement while a status metrics sample spans the idle deadline', async () => {
    vi.useFakeTimers()
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/icon.txt', '/tmp/cache/icon.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      path: '/tmp/cache/icon.png'
    })
    await expect(extract).resolves.toBe('/tmp/cache/icon.png')

    // Reach the last moment before the idle deadline, then start a sample that spans it.
    await vi.advanceTimersByTimeAsync(59_900)
    const statusPromise = client.getStatus()
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    // Cross the 60s deadline with metrics outstanding: the in-flight sample must keep it alive.
    await vi.advanceTimersByTimeAsync(100)
    expect(worker.terminateCalls).toBe(0)

    // The sample times out at +300ms and the worker retires promptly — not another 60s window.
    await vi.advanceTimersByTimeAsync(200)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'icon',
      state: 'idle',
      metrics: null
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(worker.terminateCalls).toBe(1)
  })

  it('defers thumbnail idle retirement while a status metrics sample spans the idle deadline', async () => {
    vi.useFakeTimers()
    const client = new ThumbnailWorkerClient()
    const generate = client.generate('/tmp/preview.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      thumbnail: {
        status: 'generated',
        kind: 'image',
        path: '/tmp/tuff/file/thumbnails/preview.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5,
        durationMs: 1
      }
    })
    await expect(generate).resolves.toMatchObject({
      status: 'generated',
      path: '/tmp/tuff/file/thumbnails/preview.jpg'
    })

    await vi.advanceTimersByTimeAsync(59_900)
    const statusPromise = client.getStatus()
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(100)
    expect(worker.terminateCalls).toBe(0)

    await vi.advanceTimersByTimeAsync(200)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'thumbnail',
      state: 'idle',
      metrics: null
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(worker.terminateCalls).toBe(1)
  })

  it('does not extend icon worker liveness when status is polled faster than the idle timeout', async () => {
    vi.useFakeTimers()
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/polled.txt', '/tmp/cache/polled.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      path: '/tmp/cache/polled.png'
    })
    await expect(extract).resolves.toBe('/tmp/cache/polled.png')

    // A diagnostics panel refreshing every 5s used to reset the whole 60s window on each
    // call, so a cold worker never died. Poll well past the deadline; it must still go.
    for (let elapsed = 0; elapsed < 75_000; elapsed += 5_000) {
      const status = client.getStatus()
      await vi.advanceTimersByTimeAsync(300)
      await status
      await vi.advanceTimersByTimeAsync(4_700)
    }

    expect(worker.terminateCalls).toBe(1)
    // Polling a dead worker reports cached offline status and must not respawn it.
    expect(workerMock.workers).toHaveLength(1)
    await expect(client.getStatus()).resolves.toMatchObject({ name: 'icon', state: 'offline' })
    expect(workerMock.workers).toHaveLength(1)
  })

  it('does not extend thumbnail worker liveness when status is polled faster than the idle timeout', async () => {
    vi.useFakeTimers()
    const client = new ThumbnailWorkerClient()
    const generate = client.generate('/tmp/polled.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      thumbnail: {
        status: 'generated',
        kind: 'image',
        path: '/tmp/tuff/file/thumbnails/polled.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5,
        durationMs: 1
      }
    })
    await expect(generate).resolves.toMatchObject({ status: 'generated' })

    for (let elapsed = 0; elapsed < 75_000; elapsed += 5_000) {
      const status = client.getStatus()
      await vi.advanceTimersByTimeAsync(300)
      await status
      await vi.advanceTimersByTimeAsync(4_700)
    }

    expect(worker.terminateCalls).toBe(1)
    expect(workerMock.workers).toHaveLength(1)
    await expect(client.getStatus()).resolves.toMatchObject({
      name: 'thumbnail',
      state: 'offline'
    })
    expect(workerMock.workers).toHaveLength(1)
  })
})

describe('icon worker extraction output path', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  it('resolves the path the worker wrote to', async () => {
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/source.txt', '/tmp/cache/source.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      path: '/tmp/cache/source.png'
    })

    await expect(extract).resolves.toBe('/tmp/cache/source.png')
  })

  it('refuses a result path that is not the requested output path', async () => {
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/source.txt', '/tmp/cache/source.png')
    const worker = workerMock.workers.at(-1)!

    // IconService reads and promotes whatever path comes back, so a worker answering with a
    // different file must not be able to steer that read.
    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      path: '/tmp/elsewhere/hijacked.png'
    })

    await expect(extract).rejects.toThrow(/unexpected output path/i)
  })

  it('accepts a normalized form of the requested output path', async () => {
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/source.txt', '/tmp/cache/nested/../source.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      path: '/tmp/cache/source.png'
    })

    const resolved = await extract
    expect(resolved).not.toBeNull()
    expect(path.resolve(resolved!)).toBe(path.resolve('/tmp/cache/source.png'))
  })

  it('settles in-flight extractions and retires the worker when it fails', async () => {
    const client = new IconWorkerClient()
    const extract = client.extractToFile('/tmp/broken.txt', '/tmp/cache/broken.png')
    const worker = workerMock.workers.at(-1)!

    worker.emit('error', new Error('icon worker exploded'))

    await expect(extract).rejects.toThrow('icon worker exploded')
    // A dead thread must be terminated, not just dereferenced, or every failure leaks one.
    expect(worker.terminateCalls).toBe(1)

    const next = client.extractToFile('/tmp/next.txt', '/tmp/cache/next.png')
    const nextWorker = workerMock.workers.at(-1)!
    expect(workerMock.workers).toHaveLength(2)

    nextWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(nextWorker.messages[0]),
      path: '/tmp/cache/next.png'
    })
    await expect(next).resolves.toBe('/tmp/cache/next.png')
  })
})
