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

import { FileScanWorkerClient } from './file-scan-worker-client'

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

/** Runs one scan to completion so the client is idle with its shutdown window armed. */
async function scanOnceAndSettle(client: FileScanWorkerClient) {
  const scan = client.scan(['/tmp'])
  const worker = workerMock.workers.at(-1)!
  worker.emit('message', {
    type: 'done',
    taskId: taskIdOf(worker.messages[0]),
    scannedCount: 0
  })
  await expect(scan).resolves.toEqual([])
  return worker
}

describe('FileScanWorkerClient idle shutdown', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the idle worker after scan completion and restarts on next scan', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const firstScan = client.scan(['/tmp'])
    const firstWorker = workerMock.workers.at(-1)!

    expect(firstWorker.messages[0]).toMatchObject({
      type: 'scan',
      paths: ['/tmp']
    })

    firstWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstWorker.messages[0]),
      scannedCount: 0
    })
    await expect(firstScan).resolves.toEqual([])

    await vi.advanceTimersByTimeAsync(60_000)
    expect(firstWorker.terminateCalls).toBe(1)

    const secondScan = client.scan(['/var'])
    const secondWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(secondWorker.messages[0]).toMatchObject({
      type: 'scan',
      paths: ['/var']
    })

    secondWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondWorker.messages[0]),
      scannedCount: 0
    })

    await expect(secondScan).resolves.toEqual([])
  })

  it('keeps the worker alive while status metrics are pending', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const worker = await scanOnceAndSettle(client)

    // Poll late enough that the metrics request is still in flight when the idle deadline
    // arrives, which is the only moment the deferral actually matters.
    await vi.advanceTimersByTimeAsync(59_900)
    const statusPromise = client.getStatus()
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.messages).toHaveLength(2)
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    // The deadline lands here, with metrics still outstanding.
    await vi.advanceTimersByTimeAsync(100)
    expect(worker.terminateCalls).toBe(0)

    // Metrics time out at +300ms from the request, which re-arms the window.
    await vi.advanceTimersByTimeAsync(200)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'file-scan',
      state: 'idle',
      metrics: null
    })
    expect(worker.terminateCalls).toBe(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(1)
  })

  it('does not extend worker liveness when polled faster than the idle timeout', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const worker = await scanOnceAndSettle(client)

    // A diagnostics panel refreshing every 5s used to reset the whole 60s window on each
    // call, so the worker never died no matter how long it sat unused. Poll well past the
    // deadline; the worker must still go.
    for (let elapsed = 0; elapsed < 75_000; elapsed += 5_000) {
      const status = client.getStatus()
      await vi.advanceTimersByTimeAsync(300)
      await status
      await vi.advanceTimersByTimeAsync(4_700)
    }

    expect(worker.terminateCalls).toBe(1)
  })

  it('reports a cached offline status without spawning a worker', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const worker = await scanOnceAndSettle(client)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(1)
    expect(workerMock.workers).toHaveLength(1)

    await expect(client.getStatus()).resolves.toMatchObject({
      state: 'offline',
      threadId: null,
      uptimeMs: null,
      metrics: null
    })
    expect(workerMock.workers).toHaveLength(1)
  })

  it('holds the worker while a scan is active and only then starts the idle window', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const scan = client.scan(['/tmp'])
    const worker = workerMock.workers.at(-1)!

    await vi.advanceTimersByTimeAsync(600_000)
    expect(worker.terminateCalls).toBe(0)

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[0]),
      scannedCount: 0
    })
    await expect(scan).resolves.toEqual([])

    await vi.advanceTimersByTimeAsync(59_999)
    expect(worker.terminateCalls).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(worker.terminateCalls).toBe(1)
  })

  it('settles an in-flight status request on shutdown and refuses to respawn', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const worker = await scanOnceAndSettle(client)

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    client.shutdown()

    // Without settling metricsPending this would stay unresolved until the 300ms timer,
    // which fires against a worker that no longer exists.
    await expect(statusPromise).resolves.toMatchObject({ metrics: null })
    expect(worker.terminateCalls).toBe(1)

    await expect(client.scan(['/var'])).rejects.toThrow('FILE_SCAN_WORKER_CLOSED')
    expect(workerMock.workers).toHaveLength(1)

    // Repeated shutdown is a no-op rather than a second terminate or a throw.
    client.shutdown()
    client.shutdown()
    expect(worker.terminateCalls).toBe(1)

    await vi.advanceTimersByTimeAsync(600_000)
    expect(worker.terminateCalls).toBe(1)
  })

  it('fails in-flight scans on shutdown', async () => {
    vi.useFakeTimers()
    const client = new FileScanWorkerClient()
    const scan = client.scan(['/tmp'])
    const worker = workerMock.workers.at(-1)!
    await vi.waitFor(() => expect(worker.messages).toHaveLength(1))

    client.shutdown()

    await expect(scan).rejects.toThrow('FILE_SCAN_WORKER_CLOSED')
    expect(worker.terminateCalls).toBe(1)
  })
})
