import path from 'node:path'
import type { WorkerOptions } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_KERNEL_PROTOCOL_VERSION } from './search-kernel-protocol'
import { createSearchKernelRuntime, type SearchKernelParentPort } from './search-kernel-process'
import {
  SEARCH_INDEX_READER_WORKER_FILENAME,
  SEARCH_INDEX_WRITER_WORKER_FILENAME,
  SEARCH_KERNEL_READER_RESOURCE_LIMITS,
  SEARCH_KERNEL_TASKS,
  createSearchKernelWorkerHandlers,
  resolveSearchKernelReaderWorkerPath,
  resolveSearchKernelWriterWorkerPath,
  type SearchKernelManagedWorker
} from './search-kernel-worker-handlers'

type WorkerEventListener = (...args: never[]) => void

class FakeManagedWorker implements SearchKernelManagedWorker {
  readonly threadId: number
  readonly messages: unknown[] = []
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  terminateCalls = 0
  unrefCalls = 0
  autoAckShutdown = true
  autoExitOnShutdown = true

  constructor(
    readonly workerPath: string,
    readonly workerOptions?: WorkerOptions,
    threadId = 1
  ) {
    this.threadId = threadId
  }

  on(event: 'message' | 'error' | 'exit', listener: WorkerEventListener): this {
    const bucket = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
    bucket.add(listener as (...args: unknown[]) => void)
    this.listeners.set(event, bucket)
    return this
  }

  off(event: 'message' | 'error' | 'exit', listener: WorkerEventListener): this {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void)
    return this
  }

  unref(): this {
    this.unrefCalls += 1
    return this
  }

  postMessage(message: unknown): void {
    this.messages.push(message)
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'shutdown'
    ) {
      if ('taskId' in message && this.autoAckShutdown) {
        const taskId = message.taskId
        queueMicrotask(() => this.emit('message', { type: 'result', taskId }))
      } else if (!('taskId' in message) && this.autoExitOnShutdown) {
        queueMicrotask(() => this.emit('exit', 0))
      }
    }
  }

  emit(event: 'message' | 'error' | 'exit', payload: unknown): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) {
      listener(payload)
    }
  }

  terminate(): Promise<number> {
    this.terminateCalls += 1
    return Promise.resolve(0)
  }
}

function createMockParentPort(): SearchKernelParentPort & {
  posted: unknown[]
  emitMessage(data: unknown): void
} {
  const listeners = new Set<(event: { data: unknown }) => void>()
  const posted: unknown[] = []
  return {
    posted,
    on(_event, listener) {
      listeners.add(listener)
    },
    off(_event, listener) {
      listeners.delete(listener)
    },
    postMessage(message) {
      posted.push(message)
    },
    emitMessage(data) {
      for (const listener of Array.from(listeners)) {
        listener({ data })
      }
    }
  }
}

function createTaskContext(taskType: string, requestId = 'req-1') {
  const controller = new AbortController()
  return {
    context: {
      requestId,
      taskType,
      signal: controller.signal
    },
    controller
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('search-kernel sibling worker path resolution', () => {
  it('resolves sibling writer and reader worker scripts from __dirname, asar.unpacked, and cwd', () => {
    const siblingWriter = path.join('/app/out/main', SEARCH_INDEX_WRITER_WORKER_FILENAME)
    expect(
      resolveSearchKernelWriterWorkerPath({
        dirname: '/app/out/main',
        resourcesPath: '',
        cwd: '/workspace',
        exists: (candidate) => candidate === siblingWriter
      })
    ).toBe(siblingWriter)

    const unpackedReader = path.join(
      '/Applications/Tuff.app/Contents/Resources',
      'app.asar.unpacked',
      'out',
      'main',
      SEARCH_INDEX_READER_WORKER_FILENAME
    )
    expect(
      resolveSearchKernelReaderWorkerPath({
        dirname: '/missing',
        resourcesPath: '/Applications/Tuff.app/Contents/Resources',
        cwd: '/missing',
        exists: (candidate) => candidate === unpackedReader
      })
    ).toBe(unpackedReader)

    expect(() =>
      resolveSearchKernelWriterWorkerPath({
        dirname: '/missing',
        resourcesPath: '',
        cwd: '/missing',
        exists: () => false
      })
    ).toThrow('Search kernel sibling worker not found')
  })
})

describe('createSearchKernelWorkerHandlers — writer handlers', () => {
  it('lazily spawns writer worker, correlates taskId & metrics requestId, and preserves structured errors', async () => {
    const writerWorkers: FakeManagedWorker[] = []
    const bundle = createSearchKernelWorkerHandlers({
      resolveWriterWorkerPath: () => '/virtual/out/main/search-index-worker.js',
      createWriterWorker: (workerPath) => {
        const worker = new FakeManagedWorker(workerPath, undefined, writerWorkers.length + 10)
        writerWorkers.push(worker)
        return worker
      }
    })

    // Metrics before writer is spawned returns null without lazily creating a writer worker.
    const coldMetrics = await bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'metrics', requestId: 'metrics-cold' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST).context
    )
    expect(coldMetrics).toEqual({ type: 'metrics', requestId: 'metrics-cold', metrics: null })
    expect(writerWorkers).toHaveLength(0)

    // Init request lazily spawns writer worker and correlates by taskId.
    const initPromise = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'init', taskId: 'init-1', dbPath: '/tmp/search-index.db' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST, 'req-init').context
    )
    expect(writerWorkers).toHaveLength(1)
    expect(writerWorkers[0].workerPath).toBe('/virtual/out/main/search-index-worker.js')
    expect(writerWorkers[0].messages[0]).toEqual({
      type: 'init',
      taskId: 'init-1',
      dbPath: '/tmp/search-index.db'
    })
    writerWorkers[0].emit('message', { type: 'result', taskId: 'init-1' })
    await expect(initPromise).resolves.toEqual({ type: 'result', taskId: 'init-1' })

    // Structured error response is returned verbatim so nested SQLite cause/code/rawCode survive IPC.
    const errorPromise = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      {
        message: {
          type: 'removeProviderItems',
          taskId: 'rm-1',
          providerId: 'file-provider',
          itemIds: ['a']
        }
      },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST, 'req-rm').context
    )
    const structuredError = {
      type: 'error',
      taskId: 'rm-1',
      error: {
        name: 'DrizzleQueryError',
        message: 'Failed query',
        code: 'DRIZZLE_ERROR',
        cause: {
          name: 'LibsqlError',
          message: 'database is locked',
          code: 'SQLITE_BUSY',
          rawCode: 5
        }
      }
    }
    writerWorkers[0].emit('message', structuredError)
    await expect(errorPromise).resolves.toEqual(structuredError)

    // Metrics while writer is active correlates by requestId.
    const metricsPromise = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'metrics', requestId: 'metrics-1' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST, 'req-metrics').context
    )
    const metricsReply = {
      type: 'metrics',
      requestId: 'metrics-1',
      metrics: {
        timestamp: 1234,
        memory: { rss: 100, heapUsed: 40, heapTotal: 80, external: 5, arrayBuffers: 2 },
        cpuUsage: { user: 10, system: 5 },
        eventLoop: null
      }
    }
    writerWorkers[0].emit('message', metricsReply)
    await expect(metricsPromise).resolves.toEqual(metricsReply)

    // Graceful close sends shutdown, awaits ack, then terminates.
    const closeResult = await bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_CLOSE](
      { graceful: true, timeoutMs: 500 },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_CLOSE, 'req-close').context
    )
    expect(closeResult).toEqual({ closed: true, gracefulAck: true, terminated: true })
    expect(writerWorkers[0].terminateCalls).toBe(1)
    expect(writerWorkers[0].unrefCalls).toBe(1)
    expect(writerWorkers[0].messages.at(-1)).toMatchObject({ type: 'shutdown' })
    expect(bundle.hasActiveWriterWorker()).toBe(false)

    // Closing when no writer is active is a clean no-op.
    const secondClose = await bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_CLOSE](
      {},
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_CLOSE, 'req-close-2').context
    )
    expect(secondClose).toEqual({ closed: false, gracefulAck: false, terminated: false })
  })

  it('bounds graceful writer close timeout and still terminates, and recovers after writer crash', async () => {
    vi.useFakeTimers()
    const writerWorkers: FakeManagedWorker[] = []
    const bundle = createSearchKernelWorkerHandlers({
      resolveWriterWorkerPath: () => '/virtual/out/main/search-index-worker.js',
      createWriterWorker: (workerPath) => {
        const worker = new FakeManagedWorker(workerPath, undefined, writerWorkers.length + 1)
        writerWorkers.push(worker)
        return worker
      }
    })

    const init1 = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'init', taskId: 'init-1', dbPath: '/tmp/a.db' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST).context
    )
    writerWorkers[0].emit('message', { type: 'result', taskId: 'init-1' })
    await init1

    // Hang shutdown ack -> bounded timeout triggers terminate().
    writerWorkers[0].autoAckShutdown = false
    const closePromise = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_CLOSE](
      { graceful: true, timeoutMs: 250 },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_CLOSE).context
    )
    await vi.advanceTimersByTimeAsync(250)
    await expect(closePromise).resolves.toEqual({
      closed: true,
      gracefulAck: false,
      terminated: true
    })
    expect(writerWorkers[0].terminateCalls).toBe(1)

    // Next request spawns a fresh writer; crashing it rejects in-flight request with retryable code.
    const req2 = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'init', taskId: 'init-2', dbPath: '/tmp/a.db' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST).context
    )
    expect(writerWorkers).toHaveLength(2)
    writerWorkers[1].emit('exit', 139)
    await expect(req2).rejects.toMatchObject({
      code: 'SEARCH_INDEX_WRITER_EXITED',
      retryable: true
    })
    expect(bundle.hasActiveWriterWorker()).toBe(false)
  })
})

describe('createSearchKernelWorkerHandlers — reader handlers & semantic cancel', () => {
  it('manages per-lane reader workers with workerData/resourceLimits, queries, and structured errors', async () => {
    const readerWorkers: FakeManagedWorker[] = []
    const bundle = createSearchKernelWorkerHandlers({
      resolveReaderWorkerPath: () => '/virtual/out/main/search-index-read-worker.js',
      createReaderWorker: (workerPath, options) => {
        const worker = new FakeManagedWorker(workerPath, options, readerWorkers.length + 100)
        readerWorkers.push(worker)
        return worker
      }
    })

    const deferredQuery = bundle.handlers[SEARCH_KERNEL_TASKS.READER_QUERY](
      {
        lane: 'deferred',
        databasePath: '/tmp/search-index.db',
        requestId: 'r-def-1',
        sql: 'SELECT 1 AS ok',
        args: []
      },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_QUERY, 'k-1').context
    )
    const fastQuery = bundle.handlers[SEARCH_KERNEL_TASKS.READER_QUERY](
      {
        lane: 'fast',
        databasePath: '/tmp/search-index.db',
        requestId: 'r-fast-1',
        sql: 'SELECT 2 AS ok',
        args: ['x']
      },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_QUERY, 'k-2').context
    )

    expect(readerWorkers).toHaveLength(2)
    expect(bundle.getActiveReaderLaneCount()).toBe(2)
    expect(readerWorkers[0].workerOptions).toEqual({
      workerData: { databasePath: '/tmp/search-index.db' },
      resourceLimits: SEARCH_KERNEL_READER_RESOURCE_LIMITS
    })
    expect(readerWorkers[1].workerOptions).toEqual({
      workerData: { databasePath: '/tmp/search-index.db' },
      resourceLimits: SEARCH_KERNEL_READER_RESOURCE_LIMITS
    })

    readerWorkers[0].emit('message', {
      type: 'result',
      requestId: 'r-def-1',
      rows: [{ ok: 1 }]
    })
    readerWorkers[1].emit('message', {
      type: 'error',
      requestId: 'r-fast-1',
      error: { name: 'SqliteError', message: 'no such table', code: 'SQLITE_ERROR' }
    })

    await expect(deferredQuery).resolves.toEqual({ rows: [{ ok: 1 }] })
    await expect(fastQuery).resolves.toEqual({
      error: { name: 'SqliteError', message: 'no such table', code: 'SQLITE_ERROR' }
    })

    // Retiring only fast lane sends shutdown without calling terminate(), leaving deferred active.
    const retireFast = await bundle.handlers[SEARCH_KERNEL_TASKS.READER_RETIRE](
      { lane: 'fast' },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_RETIRE, 'k-3').context
    )
    expect(retireFast).toEqual({ retiredCount: 1, lanes: ['fast'] })
    expect(readerWorkers[1].messages.at(-1)).toEqual({ type: 'shutdown' })
    expect(readerWorkers[1].terminateCalls).toBe(0)
    expect(readerWorkers[0].messages).toHaveLength(1)
    expect(bundle.getActiveReaderLaneCount()).toBe(1)

    await bundle.cleanup()
    expect(readerWorkers[0].messages.at(-1)).toEqual({ type: 'shutdown' })
    expect(readerWorkers[0].terminateCalls).toBe(0)
    expect(bundle.getActiveReaderLaneCount()).toBe(0)
  })

  it('allocates local SharedArrayBuffer for semantic search and flips Atomics on READER_CANCEL', async () => {
    const readerWorkers: FakeManagedWorker[] = []
    const bundle = createSearchKernelWorkerHandlers({
      resolveReaderWorkerPath: () => '/virtual/out/main/search-index-read-worker.js',
      createReaderWorker: (workerPath, options) => {
        const worker = new FakeManagedWorker(workerPath, options)
        readerWorkers.push(worker)
        return worker
      }
    })

    const semanticPromise = bundle.handlers[SEARCH_KERNEL_TASKS.READER_SEMANTIC_SEARCH](
      {
        lane: 'deferred',
        databasePath: '/tmp/search-index.db',
        requestId: 'sem-1',
        vector: [0.5, 0.5, 0.5],
        model: 'bge-small',
        limit: 10
      },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_SEMANTIC_SEARCH, 'k-sem').context
    )

    expect(readerWorkers).toHaveLength(1)
    expect(bundle.getActiveSemanticCancelCount()).toBe(1)
    const sent = readerWorkers[0].messages[0] as {
      type: string
      requestId: string
      cancelFlag: SharedArrayBuffer
    }
    expect(sent.type).toBe('semantic-search')
    expect(sent.requestId).toBe('sem-1')
    expect(sent.cancelFlag).toBeInstanceOf(SharedArrayBuffer)
    const flagView = new Int32Array(sent.cancelFlag)
    expect(Atomics.load(flagView, 0)).toBe(0)

    // READER_CANCEL flips the real SharedArrayBuffer via Atomics.store immediately!
    const cancelResult = await bundle.handlers[SEARCH_KERNEL_TASKS.READER_CANCEL](
      { lane: 'deferred', requestId: 'sem-1' },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_CANCEL, 'k-cancel').context
    )
    expect(cancelResult).toEqual({ cancelled: true })
    expect(Atomics.load(flagView, 0)).toBe(1)

    // Worker observes cancelFlag === 1 and returns empty rows; finally cleans active-cancel map.
    readerWorkers[0].emit('message', {
      type: 'result',
      requestId: 'sem-1',
      rows: []
    })
    await expect(semanticPromise).resolves.toEqual({ rows: [] })
    expect(bundle.getActiveSemanticCancelCount()).toBe(0)

    // Cancelling after completion returns { cancelled: false }.
    const lateCancel = await bundle.handlers[SEARCH_KERNEL_TASKS.READER_CANCEL](
      { lane: 'deferred', requestId: 'sem-1' },
      createTaskContext(SEARCH_KERNEL_TASKS.READER_CANCEL, 'k-cancel-late').context
    )
    expect(lateCancel).toEqual({ cancelled: false })

    await bundle.cleanup()
  })

  it('closes writer and retires all readers during kernel.shutdown lifecycle', async () => {
    const port = createMockParentPort()
    const writerWorkers: FakeManagedWorker[] = []
    const readerWorkers: FakeManagedWorker[] = []
    const exitSpy = vi.fn()

    createSearchKernelRuntime({
      port,
      pid: 6200,
      exit: exitSpy,
      scheduleExit: (cb) => cb(),
      workerHandlersOptions: {
        resolveWriterWorkerPath: () => '/virtual/search-index-worker.js',
        resolveReaderWorkerPath: () => '/virtual/search-index-read-worker.js',
        createWriterWorker: (workerPath) => {
          const worker = new FakeManagedWorker(workerPath)
          writerWorkers.push(worker)
          return worker
        },
        createReaderWorker: (workerPath, options) => {
          const worker = new FakeManagedWorker(workerPath, options)
          readerWorkers.push(worker)
          return worker
        }
      }
    })

    // Boot both writer and reader inside the kernel runtime.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'w-1',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.WRITER_REQUEST,
      payload: { message: { type: 'init', taskId: 'init-1', dbPath: '/tmp/db.sqlite' } }
    })
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'r-1',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.READER_QUERY,
      payload: {
        lane: 'deferred',
        databasePath: '/tmp/db.sqlite',
        requestId: 'q-1',
        sql: 'SELECT 1',
        args: []
      }
    })

    expect(writerWorkers).toHaveLength(1)
    expect(readerWorkers).toHaveLength(1)

    writerWorkers[0].emit('message', { type: 'result', taskId: 'init-1' })
    readerWorkers[0].emit('message', { type: 'result', requestId: 'q-1', rows: [{ ok: 1 }] })
    await Promise.resolve()
    await Promise.resolve()

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shut-1',
      op: 'kernel.shutdown',
      reason: 'test-cleanup'
    })

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0))
    expect(writerWorkers[0].messages.at(-1)).toMatchObject({ type: 'shutdown' })
    expect(writerWorkers[0].terminateCalls).toBe(1)
    expect(readerWorkers[0].messages.at(-1)).toEqual({ type: 'shutdown' })
    expect(readerWorkers[0].terminateCalls).toBe(0)
  })

  it('keeps an error listener attached during graceful writer close and settles immediately on worker error', async () => {
    const writerWorkers: FakeManagedWorker[] = []
    const bundle = createSearchKernelWorkerHandlers({
      resolveWriterWorkerPath: () => '/virtual/search-index-worker.js',
      createWriterWorker: (workerPath) => {
        const worker = new FakeManagedWorker(workerPath)
        worker.autoAckShutdown = false
        writerWorkers.push(worker)
        return worker
      }
    })

    const init = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_REQUEST](
      { message: { type: 'init', taskId: 'init-err', dbPath: '/tmp/db.sqlite' } },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_REQUEST).context
    )
    writerWorkers[0].emit('message', { type: 'result', taskId: 'init-err' })
    await init

    const closePromise = bundle.handlers[SEARCH_KERNEL_TASKS.WRITER_CLOSE](
      { graceful: true, timeoutMs: 5_000 },
      createTaskContext(SEARCH_KERNEL_TASKS.WRITER_CLOSE).context
    )
    // Error listener MUST remain attached during graceful close so emitting error does not crash.
    expect(writerWorkers[0].listeners.get('error')?.size ?? 0).toBeGreaterThan(0)
    writerWorkers[0].emit('error', new Error('writer threw during close'))

    await expect(closePromise).resolves.toEqual({
      closed: true,
      gracefulAck: false,
      terminated: true
    })
    expect(writerWorkers[0].terminateCalls).toBe(1)
  })

  it('joins already-detached in-progress writer close and reader retirement during kernel.shutdown', async () => {
    const port = createMockParentPort()
    const writerWorkers: FakeManagedWorker[] = []
    const readerWorkers: FakeManagedWorker[] = []
    const exitSpy = vi.fn()
    let resolveWriterTerminate!: (code: number) => void

    createSearchKernelRuntime({
      port,
      pid: 6201,
      drainTimeoutMs: 5,
      cleanupTimeoutMs: 5_000,
      exit: exitSpy,
      scheduleExit: (cb) => cb(),
      workerHandlersOptions: {
        resolveWriterWorkerPath: () => '/virtual/search-index-worker.js',
        resolveReaderWorkerPath: () => '/virtual/search-index-read-worker.js',
        createWriterWorker: (workerPath) => {
          const worker = new FakeManagedWorker(workerPath)
          worker.terminate = () => {
            worker.terminateCalls += 1
            return new Promise<number>((resolve) => {
              resolveWriterTerminate = resolve
            })
          }
          writerWorkers.push(worker)
          return worker
        },
        createReaderWorker: (workerPath, options) => {
          const worker = new FakeManagedWorker(workerPath, options)
          worker.autoExitOnShutdown = false
          readerWorkers.push(worker)
          return worker
        }
      }
    })

    // Spawn writer & reader, finish their initial tasks.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'init-w',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.WRITER_REQUEST,
      payload: { message: { type: 'init', taskId: 'init-w', dbPath: '/tmp/join.sqlite' } }
    })
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'q-r',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.READER_QUERY,
      payload: {
        lane: 'deferred',
        databasePath: '/tmp/join.sqlite',
        requestId: 'q-r',
        sql: 'SELECT 1',
        args: []
      }
    })
    writerWorkers[0].emit('message', { type: 'result', taskId: 'init-w' })
    readerWorkers[0].emit('message', { type: 'result', requestId: 'q-r', rows: [] })
    await Promise.resolve()
    await Promise.resolve()

    // Start explicit WRITER_CLOSE and READER_RETIRE so both are detached from active maps
    // while still waiting for terminate() / exit!
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'close-w',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.WRITER_CLOSE,
      payload: { graceful: true, timeoutMs: 200 }
    })
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'retire-r',
      op: 'kernel.task',
      taskType: SEARCH_KERNEL_TASKS.READER_RETIRE,
      payload: { lane: 'deferred', timeoutMs: 5_000 }
    })
    await vi.waitFor(() => expect(writerWorkers[0].terminateCalls).toBe(1))
    expect(readerWorkers[0].messages.at(-1)).toEqual({ type: 'shutdown' })

    // Now request kernel.shutdown while drainTimeoutMs (5ms) expires before teardown finishes.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shut-join',
      op: 'kernel.shutdown'
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    // Kernel must NOT have exited yet because detached close/retire are still running!
    expect(exitSpy).not.toHaveBeenCalled()

    // Finish both detached teardowns -> kernel.shutdown immediately completes and exits.
    resolveWriterTerminate(0)
    readerWorkers[0].emit('exit', 0)
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0))
  })
})
