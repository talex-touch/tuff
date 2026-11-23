import type { WorkerOptions } from 'node:worker_threads'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SEARCH_KERNEL_TASKS,
  SEARCH_KERNEL_UTILITY_PROCESS_ENV,
  SearchKernelClient,
  createSearchKernelRuntime,
  getSharedSearchKernelClient,
  resetSharedSearchKernelClient,
  type SearchKernelChildProcess,
  type SearchKernelManagedWorker,
  type SearchKernelParentPort
} from '../kernel'
import {
  SearchIndexReadWorkerCancelledError,
  SearchIndexReadWorkerClient,
  SearchIndexReadWorkerQueueFullError,
  SearchIndexReadWorkerTimeoutError,
  SearchIndexReadWorkerUnavailableError
} from './search-index-read-worker-client'
import { SearchIndexWorkerClient } from './search-index-worker-client'

type ChildListener = (...args: never[]) => void
type WorkerListener = (...args: never[]) => void

class FakeReaderWorker implements SearchKernelManagedWorker {
  readonly messages: unknown[] = []
  terminateCalls = 0
  unrefCalls = 0
  autoExitOnShutdown = true
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  constructor(readonly workerOptions?: WorkerOptions) {}

  on(event: 'message' | 'error' | 'exit', listener: WorkerListener): this {
    const bucket = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
    bucket.add(listener as (...args: unknown[]) => void)
    this.listeners.set(event, bucket)
    return this
  }

  off(event: 'message' | 'error' | 'exit', listener: WorkerListener): this {
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
      this.autoExitOnShutdown &&
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'shutdown'
    ) {
      queueMicrotask(() => this.emit('exit', 0))
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

interface WiredReaderKernelHarness {
  kernelClient: SearchKernelClient
  children: Array<{
    pid: number
    child: SearchKernelChildProcess & { emit(event: string, ...args: unknown[]): void }
    readerWorkers: FakeReaderWorker[]
    postedToKernel: unknown[]
  }>
}

function createWiredReaderKernelHarness(): WiredReaderKernelHarness {
  const children: WiredReaderKernelHarness['children'] = []

  const kernelClient = new SearchKernelClient({
    resolveEntryPath: () => '/virtual/out/main/search-kernel-process.js',
    registerBeforeQuit: () => () => {},
    autoRestart: false,
    fork: () => {
      const pid = 9500 + children.length
      const childListeners = new Map<string, Set<(...args: unknown[]) => void>>()
      const portListeners = new Set<(event: { data: unknown }) => void>()
      const postedToKernel: unknown[] = []
      const readerWorkers: FakeReaderWorker[] = []

      const emit = (event: string, ...args: unknown[]): void => {
        for (const listener of Array.from(childListeners.get(event) ?? [])) {
          listener(...args)
        }
      }

      const child: SearchKernelChildProcess & { emit(event: string, ...args: unknown[]): void } = {
        pid,
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on(event: string, listener: ChildListener) {
          const bucket = childListeners.get(event) ?? new Set<(...args: unknown[]) => void>()
          bucket.add(listener as (...args: unknown[]) => void)
          childListeners.set(event, bucket)
          return this
        },
        off(event: string, listener: ChildListener) {
          childListeners.get(event)?.delete(listener as (...args: unknown[]) => void)
          return this
        },
        postMessage(message: unknown) {
          postedToKernel.push(message)
          queueMicrotask(() => {
            for (const listener of Array.from(portListeners)) {
              listener({ data: message })
            }
          })
        },
        kill() {
          queueMicrotask(() => emit('exit', 1))
          return true
        },
        emit
      }

      const parentPort: SearchKernelParentPort = {
        on(_event, listener) {
          portListeners.add(listener)
        },
        off(_event, listener) {
          portListeners.delete(listener)
        },
        postMessage(message) {
          queueMicrotask(() => emit('message', message))
        }
      }

      createSearchKernelRuntime({
        port: parentPort,
        pid,
        exit: (code) => queueMicrotask(() => emit('exit', code)),
        scheduleExit: (cb) => queueMicrotask(cb),
        workerHandlersOptions: {
          resolveWriterWorkerPath: () => '/virtual/out/main/search-index-worker.js',
          resolveReaderWorkerPath: () => '/virtual/out/main/search-index-read-worker.js',
          createReaderWorker: (_workerPath, workerOptions) => {
            const worker = new FakeReaderWorker(workerOptions)
            readerWorkers.push(worker)
            return worker
          }
        }
      })

      children.push({ pid, child, readerWorkers, postedToKernel })
      return child
    }
  })

  return { kernelClient, children }
}

function requestIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('requestId' in message)) {
    throw new Error('reader message has no requestId')
  }
  return String(message.requestId)
}

afterEach(async () => {
  vi.useRealTimers()
  delete process.env[SEARCH_KERNEL_UTILITY_PROCESS_ENV]
  await resetSharedSearchKernelClient()
})

describe('SearchIndexReadWorkerClient — utilityProcess kernel bridge', () => {
  it('enforces FIFO one-at-a-time ordering, maxQueueDepth, and query-level error deserialization', async () => {
    const harness = createWiredReaderKernelHarness()
    const client = new SearchIndexReadWorkerClient('/tmp/search-index.db', {
      kernelClient: harness.kernelClient,
      maxQueueDepth: 2,
      timeoutMs: 10_000
    })

    const first = client.all<{ itemId: string }>(sql`SELECT 'one' AS itemId`)
    const second = client.all<{ itemId: string }>(sql`SELECT 'two' AS itemId`)
    // Third exceeds maxQueueDepth=2 immediately
    await expect(client.all(sql`SELECT 'overflow'`)).rejects.toBeInstanceOf(
      SearchIndexReadWorkerQueueFullError
    )

    await vi.waitFor(() => expect(harness.children[0]?.readerWorkers).toHaveLength(1))
    const reader = harness.children[0].readerWorkers[0]
    // Strictly one-at-a-time FIFO: only the first query has reached the reader worker.
    expect(reader.messages).toHaveLength(1)

    reader.emit('message', {
      type: 'result',
      requestId: requestIdOf(reader.messages[0]),
      rows: [{ itemId: 'one' }]
    })
    await expect(first).resolves.toEqual([{ itemId: 'one' }])

    // Second query dispatches after first completes, and returns a structured query-level error.
    await vi.waitFor(() => expect(reader.messages).toHaveLength(2))
    reader.emit('message', {
      type: 'error',
      requestId: requestIdOf(reader.messages[1]),
      error: {
        name: 'SqliteError',
        message: 'no such table: missing_tbl',
        code: 'SQLITE_ERROR',
        rawCode: 1
      }
    })
    const queryErr = await second.catch((error: unknown) => error)
    expect(queryErr).toMatchObject({
      name: 'SqliteError',
      message: 'no such table: missing_tbl',
      code: 'SQLITE_ERROR',
      rawCode: 1
    })

    // Query-level error must NOT retire the reader worker.
    expect(reader.messages.some((m) => (m as { type?: string }).type === 'shutdown')).toBe(false)

    // Explicit shutdown()/close() sends READER_RETIRE without killing the shared kernel.
    await client.shutdown()
    await vi.waitFor(() => expect(reader.messages.at(-1)).toEqual({ type: 'shutdown' }))
    expect(reader.terminateCalls).toBe(0)
    expect(harness.kernelClient.getState()).toBe('ready')
    await harness.kernelClient.shutdown()
  })

  it('triggers READER_CANCEL flipping real Atomics on AbortSignal without retiring the lane', async () => {
    const harness = createWiredReaderKernelHarness()
    const client = new SearchIndexReadWorkerClient('/tmp/search-index.db', {
      kernelClient: harness.kernelClient,
      timeoutMs: 10_000
    })

    const abortController = new AbortController()
    const semantic = client.semanticSearch([0.1, 0.2, 0.3], 'bge-small', 5, abortController.signal)
    const queued = client.all<{ itemId: string }>(sql`SELECT 'after-cancel' AS itemId`)

    await vi.waitFor(() => expect(harness.children[0]?.readerWorkers).toHaveLength(1))
    const reader = harness.children[0].readerWorkers[0]
    expect(reader.messages).toHaveLength(1)

    // Verify NO SharedArrayBuffer crossed main->kernel IPC; kernel allocated its own locally.
    const ipcTask = harness.children[0].postedToKernel.find(
      (msg) =>
        msg &&
        typeof msg === 'object' &&
        (msg as { taskType?: string }).taskType === SEARCH_KERNEL_TASKS.READER_SEMANTIC_SEARCH
    ) as { payload: Record<string, unknown> }
    expect(ipcTask).toBeDefined()
    expect(ipcTask.payload.cancelFlag).toBeUndefined()

    const workerSemanticMsg = reader.messages[0] as {
      type: string
      requestId: string
      cancelFlag: SharedArrayBuffer
    }
    expect(workerSemanticMsg.cancelFlag).toBeInstanceOf(SharedArrayBuffer)
    const cancelView = new Int32Array(workerSemanticMsg.cancelFlag)
    expect(Atomics.load(cancelView, 0)).toBe(0)

    // Abort caller signal -> rejects with CancelledError AND flips real Atomics inside kernel!
    abortController.abort()
    await expect(semantic).rejects.toBeInstanceOf(SearchIndexReadWorkerCancelledError)
    await vi.waitFor(() => expect(Atomics.load(cancelView, 0)).toBe(1))

    // Queued query dispatches on the SAME healthy reader worker!
    await vi.waitFor(() => expect(reader.messages).toHaveLength(2))
    reader.emit('message', {
      type: 'result',
      requestId: requestIdOf(reader.messages[1]),
      rows: [{ itemId: 'after-cancel' }]
    })
    await expect(queued).resolves.toEqual([{ itemId: 'after-cancel' }])
    expect(harness.children[0].readerWorkers).toHaveLength(1)

    await client.close()
    await harness.kernelClient.shutdown()
  })

  it('fires READER_CANCEL and READER_RETIRE on semantic timeout, isolates lanes, and trips cooldown after 3 failures', async () => {
    vi.useFakeTimers()
    const harness = createWiredReaderKernelHarness()
    const deferred = new SearchIndexReadWorkerClient('/tmp/search-index.db', {
      kernelClient: harness.kernelClient,
      timeoutMs: 10_000
    })
    const fast = new SearchIndexReadWorkerClient('/tmp/search-index.db', {
      kernelClient: harness.kernelClient,
      lane: 'fast',
      timeoutMs: 50
    })

    const deferredRead = deferred.all<{ itemId: string }>(sql`SELECT 'slow-file' AS itemId`)
    const fastSemantic = fast.semanticSearch([1, 0], 'bge', 3)
    const fastRejection = expect(fastSemantic).rejects.toBeInstanceOf(
      SearchIndexReadWorkerTimeoutError
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(harness.children[0].readerWorkers).toHaveLength(2)
    const deferredWorker = harness.children[0].readerWorkers[0]
    const fastWorker = harness.children[0].readerWorkers[1]
    const fastFlag = new Int32Array(
      (fastWorker.messages[0] as { cancelFlag: SharedArrayBuffer }).cancelFlag
    )

    // Fast lane times out at 50ms -> flips cancelFlag + retires ONLY fast worker!
    await vi.advanceTimersByTimeAsync(50)
    await fastRejection
    await vi.advanceTimersByTimeAsync(0)

    expect(Atomics.load(fastFlag, 0)).toBe(1)
    expect(fastWorker.messages.at(-1)).toEqual({ type: 'shutdown' })
    expect(fastWorker.terminateCalls).toBe(0)
    // Deferred lane was never disturbed.
    expect(deferredWorker.messages).toHaveLength(1)

    deferredWorker.emit('message', {
      type: 'result',
      requestId: requestIdOf(deferredWorker.messages[0]),
      rows: [{ itemId: 'slow-file' }]
    })
    await expect(deferredRead).resolves.toEqual([{ itemId: 'slow-file' }])

    // 2 more fast timeouts -> hits threshold 3 -> 30s cooldown trips.
    for (let i = 0; i < 2; i += 1) {
      const next = fast.all(sql`SELECT 'hang'`)
      const nextRej = expect(next).rejects.toBeInstanceOf(SearchIndexReadWorkerTimeoutError)
      await vi.advanceTimersByTimeAsync(50)
      await nextRej
      await vi.advanceTimersByTimeAsync(0)
    }

    await expect(fast.all(sql`SELECT 'cooling'`)).rejects.toThrow('cooling down')
    await expect(fast.all(sql`SELECT 'cooling'`)).rejects.toBeInstanceOf(
      SearchIndexReadWorkerUnavailableError
    )

    // After 30s cooldown, fast lane rebuilds and succeeds.
    await vi.advanceTimersByTimeAsync(30_000)
    const recovered = fast.all<{ itemId: string }>(sql`SELECT 'recovered' AS itemId`)
    await vi.advanceTimersByTimeAsync(0)
    const rebuiltFast = harness.children[0].readerWorkers.at(-1)!
    rebuiltFast.emit('message', {
      type: 'result',
      requestId: requestIdOf(rebuiltFast.messages[0]),
      rows: [{ itemId: 'recovered' }]
    })
    await expect(recovered).resolves.toEqual([{ itemId: 'recovered' }])

    await Promise.all([deferred.close(), fast.close()])
    await harness.kernelClient.shutdown()
  })

  it('recovers after kernel crash and shares one SearchKernelClient between writer and readers when env flag is 1', async () => {
    const harness = createWiredReaderKernelHarness()
    const readerClient = new SearchIndexReadWorkerClient('/tmp/search-index.db', {
      kernelClient: harness.kernelClient
    })

    const first = readerClient.all<{ itemId: string }>(sql`SELECT 'before-crash'`)
    await vi.waitFor(() => expect(harness.children[0]?.readerWorkers).toHaveLength(1))

    // Crash kernel child #0 mid-query
    harness.children[0].child.emit('exit', 139)
    await expect(first).rejects.toBeInstanceOf(SearchIndexReadWorkerUnavailableError)

    // Next query spawns kernel child #1 and fresh reader worker
    const second = readerClient.all<{ itemId: string }>(sql`SELECT 'after-crash'`)
    await vi.waitFor(() => expect(harness.children[1]?.readerWorkers).toHaveLength(1))
    const rebuilt = harness.children[1].readerWorkers[0]
    rebuilt.emit('message', {
      type: 'result',
      requestId: requestIdOf(rebuilt.messages[0]),
      rows: [{ itemId: 'after-crash' }]
    })
    await expect(second).resolves.toEqual([{ itemId: 'after-crash' }])
    await readerClient.close()
    await harness.kernelClient.shutdown()

    // Env flag auto-wires writer + both reader lanes to the SAME shared singleton.
    process.env[SEARCH_KERNEL_UTILITY_PROCESS_ENV] = '1'
    const shared = getSharedSearchKernelClient({
      resolveEntryPath: () => '/virtual/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {}
    })
    const writer = new SearchIndexWorkerClient()
    const deferredReader = new SearchIndexReadWorkerClient('/tmp/search-index.db')
    const fastReader = new SearchIndexReadWorkerClient('/tmp/search-index.db', { lane: 'fast' })

    expect((writer as unknown as { kernelClient: SearchKernelClient | null }).kernelClient).toBe(
      shared
    )
    expect(
      (deferredReader as unknown as { kernelClient: SearchKernelClient | null }).kernelClient
    ).toBe(shared)
    expect(
      (fastReader as unknown as { kernelClient: SearchKernelClient | null }).kernelClient
    ).toBe(shared)

    await Promise.all([writer.shutdown(), deferredReader.close(), fastReader.close()])
  })
})
