import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSqliteBusyError } from '../../../../db/sqlite-retry'
import { FILE_WORKER_IDLE_SHUTDOWN_MS } from '../../addon/files/workers/idle-worker-shutdown'
import {
  SEARCH_KERNEL_UTILITY_PROCESS_ENV,
  SearchKernelClient,
  createSearchKernelRuntime,
  getSharedSearchKernelClient,
  resetSharedSearchKernelClient,
  type SearchKernelChildProcess,
  type SearchKernelManagedWorker,
  type SearchKernelParentPort
} from '../kernel'
import { SearchIndexWorkerClient } from './search-index-worker-client'

type ChildListener = (...args: never[]) => void
type WorkerListener = (...args: never[]) => void

class FakeWriterWorker implements SearchKernelManagedWorker {
  readonly messages: unknown[] = []
  terminateCalls = 0
  unrefCalls = 0
  ackShutdown = true
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()

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
      this.ackShutdown &&
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'shutdown' &&
      'taskId' in message
    ) {
      const taskId = message.taskId
      queueMicrotask(() => this.emit('message', { type: 'result', taskId }))
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

interface WiredKernelHarness {
  kernelClient: SearchKernelClient
  children: Array<{
    pid: number
    child: SearchKernelChildProcess & { emit(event: string, ...args: unknown[]): void }
    writerWorkers: FakeWriterWorker[]
    postedToKernel: unknown[]
  }>
}

function createWiredKernelHarness(options: { autoRestart?: boolean } = {}): WiredKernelHarness {
  const children: WiredKernelHarness['children'] = []

  const kernelClient = new SearchKernelClient({
    resolveEntryPath: () => '/virtual/out/main/search-kernel-process.js',
    registerBeforeQuit: () => () => {},
    autoRestart: options.autoRestart ?? false,
    fork: () => {
      const pid = 9000 + children.length
      const childListeners = new Map<string, Set<(...args: unknown[]) => void>>()
      const portListeners = new Set<(event: { data: unknown }) => void>()
      const postedToKernel: unknown[] = []
      const writerWorkers: FakeWriterWorker[] = []

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
        exit: (code) => {
          queueMicrotask(() => emit('exit', code))
        },
        scheduleExit: (cb) => queueMicrotask(cb),
        workerHandlersOptions: {
          resolveWriterWorkerPath: () => '/virtual/out/main/search-index-worker.js',
          resolveReaderWorkerPath: () => '/virtual/out/main/search-index-read-worker.js',
          createWriterWorker: () => {
            const worker = new FakeWriterWorker()
            writerWorkers.push(worker)
            return worker
          }
        }
      })

      children.push({ pid, child, writerWorkers, postedToKernel })
      return child
    }
  })

  return { kernelClient, children }
}

function taskIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('taskId' in message)) {
    throw new Error('message has no taskId')
  }
  return String(message.taskId)
}

function requestIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('requestId' in message)) {
    throw new Error('message has no requestId')
  }
  return String(message.requestId)
}

afterEach(async () => {
  vi.useRealTimers()
  delete process.env[SEARCH_KERNEL_UTILITY_PROCESS_ENV]
  await resetSharedSearchKernelClient()
})

describe('SearchIndexWorkerClient — utilityProcess kernel bridge', () => {
  it('routes init, applyProviderItems, persistAndApplyProviderItems, and structured errors through SearchKernelClient', async () => {
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({ kernelClient: harness.kernelClient })

    const initPromise = client.init('/tmp/search-index.db')
    await vi.waitFor(() => expect(harness.children[0]?.writerWorkers).toHaveLength(1))
    const writer = harness.children[0].writerWorkers[0]
    expect(writer.messages[0]).toMatchObject({ type: 'init', dbPath: '/tmp/search-index.db' })
    writer.emit('message', { type: 'result', taskId: taskIdOf(writer.messages[0]) })
    await initPromise

    // 1. applyProviderItems
    const applyPromise = client.applyProviderItems(
      'file-provider',
      [{ itemId: 'file:/a.txt', providerId: 'file-provider', type: 'file', name: 'a.txt' }],
      ['file:/old.txt']
    )
    await vi.waitFor(() => expect(writer.messages).toHaveLength(2))
    expect(writer.messages[1]).toMatchObject({
      type: 'applyProviderItems',
      providerId: 'file-provider',
      legacyItemIds: ['file:/old.txt']
    })
    writer.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer.messages[1]),
      result: { removedItems: 1, indexedItems: 1 }
    })
    await expect(applyPromise).resolves.toEqual({ removedItems: 1, indexedItems: 1 })

    // 2. persistAndApplyProviderItems attaches roundTripDurationMs when metrics present
    const persistPromise = client.persistAndApplyProviderItems(
      [],
      'file-provider',
      [{ itemId: 'file:/b.txt', providerId: 'file-provider', type: 'file', name: 'b.txt' }],
      []
    )
    await vi.waitFor(() => expect(writer.messages).toHaveLength(3))
    writer.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer.messages[2]),
      result: {
        persistedCount: 1,
        summary: { removedItems: 0, indexedItems: 1 },
        metrics: {
          requestedRows: 1,
          persistedRows: 1,
          indexedItems: 1,
          removedItems: 0,
          legacyItemIds: 0,
          workerDurationMs: 5,
          persistDurationMs: 2,
          applyDurationMs: 3
        }
      }
    })
    const persistResult = await persistPromise
    expect(persistResult.persistedCount).toBe(1)
    expect(persistResult.metrics?.roundTripDurationMs).toBeGreaterThanOrEqual(0)

    // 3. Nested SQLite busy cause/code/rawCode is reconstructed faithfully across kernel IPC
    const failPromise = client.removeProviderItems('file-provider', ['file:/busy.txt'])
    await vi.waitFor(() => expect(writer.messages).toHaveLength(4))
    writer.emit('message', {
      type: 'error',
      taskId: taskIdOf(writer.messages[3]),
      error: {
        name: 'DrizzleQueryError',
        message: 'Failed query: DELETE',
        code: 'DRIZZLE_ERROR',
        cause: {
          name: 'LibsqlError',
          message: 'database is locked',
          code: 'SQLITE_BUSY',
          rawCode: 5
        }
      }
    })
    const reconstructed = await failPromise.catch((error: unknown) => error)
    expect(reconstructed).toMatchObject({
      name: 'DrizzleQueryError',
      code: 'DRIZZLE_ERROR',
      cause: expect.objectContaining({ code: 'SQLITE_BUSY', rawCode: 5 })
    })
    expect(isSqliteBusyError(reconstructed)).toBe(true)

    // 4. Cancellable writer requests never attach SharedArrayBuffer across OS process IPC
    const controller = new AbortController()
    const deletePromise = client.removeFileRecords(
      'file-provider',
      [
        {
          id: 1,
          path: '/a.txt',
          mtime: 100,
          ctime: 100,
          size: 64,
          lastIndexedAt: 100,
          itemId: 'file:/a.txt'
        }
      ],
      { signal: controller.signal }
    )
    await vi.waitFor(() => expect(writer.messages).toHaveLength(5))
    expect((writer.messages[4] as { cancellation?: unknown }).cancellation).toBeUndefined()
    writer.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer.messages[4]),
      result: { deletedRecords: [], removedIndexedItems: 1, commitId: 'c1', deferred: false }
    })
    await expect(deletePromise).resolves.toMatchObject({ removedIndexedItems: 1, commitId: 'c1' })

    await client.shutdown()
    // Closing the writer client must NOT shut down the shared kernel process!
    expect(harness.kernelClient.getState()).toBe('ready')
    await harness.kernelClient.shutdown()
  })

  it('reports utility-process executionMode, kernelState, metrics, and kernel memory fallback in getStatus()', async () => {
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({ kernelClient: harness.kernelClient })

    // Offline before init
    await expect(client.getStatus()).resolves.toMatchObject({
      name: 'search-index',
      state: 'offline',
      executionMode: 'utility-process',
      kernelState: 'idle',
      kernelPid: null
    })

    const initPromise = client.init('/tmp/search-index.db')
    await vi.waitFor(() => expect(harness.children[0]?.writerWorkers).toHaveLength(1))
    const writer = harness.children[0].writerWorkers[0]
    writer.emit('message', { type: 'result', taskId: taskIdOf(writer.messages[0]) })
    await initPromise

    // getMetrics() returns live metrics payload
    const metricsPromise = client.getMetrics()
    await vi.waitFor(() => expect(writer.messages).toHaveLength(2))
    writer.emit('message', {
      type: 'metrics',
      requestId: requestIdOf(writer.messages[1]),
      metrics: {
        timestamp: Date.now(),
        memory: {
          rss: 50_000_000,
          heapUsed: 12_000_000,
          heapTotal: 20_000_000,
          external: 100,
          arrayBuffers: 50
        },
        cpuUsage: { user: 1000, system: 500 },
        eventLoop: null
      }
    })
    const rawMetrics = await metricsPromise
    expect(rawMetrics?.memory.rss).toBe(50_000_000)

    // getStatus() reports online + utility-process metadata + live metrics
    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(writer.messages).toHaveLength(3))
    writer.emit('message', {
      type: 'metrics',
      requestId: requestIdOf(writer.messages[2]),
      metrics: {
        timestamp: Date.now() + 100,
        memory: {
          rss: 52_000_000,
          heapUsed: 13_000_000,
          heapTotal: 20_000_000,
          external: 100,
          arrayBuffers: 50
        },
        cpuUsage: { user: 2000, system: 600 },
        eventLoop: null
      }
    })
    await expect(statusPromise).resolves.toMatchObject({
      name: 'search-index',
      state: 'idle',
      executionMode: 'utility-process',
      kernelState: 'ready',
      kernelPid: 9000,
      metrics: expect.objectContaining({
        memory: expect.objectContaining({ rss: 52_000_000 })
      })
    })

    await client.shutdown()
    await harness.kernelClient.shutdown()
  })

  it('sends WRITER_CLOSE on idle timeout without killing shared kernel, and re-inits on next write', async () => {
    vi.useFakeTimers()
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({ kernelClient: harness.kernelClient })

    const initPromise = client.init('/tmp/search-index.db')
    await vi.advanceTimersByTimeAsync(0)
    const firstWriter = harness.children[0].writerWorkers[0]
    firstWriter.emit('message', { type: 'result', taskId: taskIdOf(firstWriter.messages[0]) })
    await initPromise

    // Advance past 60s idle timeout -> WRITER_CLOSE terminates writer inside kernel, kernel stays ready!
    await vi.advanceTimersByTimeAsync(FILE_WORKER_IDLE_SHUTDOWN_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(firstWriter.terminateCalls).toBe(1)
    expect(harness.kernelClient.getState()).toBe('ready')
    expect(harness.children).toHaveLength(1)

    // Next write spawns writer #2 inside the SAME kernel process and sends init first!
    const writePromise = client.countByProvider('file-provider')
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.children).toHaveLength(1)
    expect(harness.children[0].writerWorkers).toHaveLength(2)
    const secondWriter = harness.children[0].writerWorkers[1]
    expect(secondWriter.messages[0]).toMatchObject({ type: 'init', dbPath: '/tmp/search-index.db' })
    secondWriter.emit('message', { type: 'result', taskId: taskIdOf(secondWriter.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)

    expect(secondWriter.messages[1]).toMatchObject({
      type: 'countByProvider',
      providerId: 'file-provider'
    })
    secondWriter.emit('message', {
      type: 'result',
      taskId: taskIdOf(secondWriter.messages[1]),
      result: 42
    })
    await expect(writePromise).resolves.toBe(42)

    await client.shutdown()
    await harness.kernelClient.shutdown()
  })

  it('re-sends init automatically when kernel process crashes and restarts, and recovers durable commits', async () => {
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({ kernelClient: harness.kernelClient })

    const initPromise = client.init('/tmp/search-index.db')
    await vi.waitFor(() => expect(harness.children[0]?.writerWorkers).toHaveLength(1))
    const writer1 = harness.children[0].writerWorkers[0]
    writer1.emit('message', { type: 'result', taskId: taskIdOf(writer1.messages[0]) })
    await initPromise

    // Start commitProviderReplacement, then crash the kernel OS process mid-flight!
    const commitPromise = client.commitProviderReplacement('file-provider', 'repl-crash-recover')
    await vi.waitFor(() => expect(writer1.messages).toHaveLength(2))
    expect(writer1.messages[1]).toMatchObject({ type: 'commitProviderReplacement' })

    harness.children[0].child.emit('exit', 139)

    // Recovery loop restarts kernel child #2, re-sends init(dbPath), then queries outcome!
    await vi.waitFor(() => expect(harness.children[1]?.writerWorkers).toHaveLength(1))
    const writer2 = harness.children[1].writerWorkers[0]
    expect(writer2.messages[0]).toMatchObject({ type: 'init', dbPath: '/tmp/search-index.db' })
    writer2.emit('message', { type: 'result', taskId: taskIdOf(writer2.messages[0]) })

    await vi.waitFor(() => expect(writer2.messages).toHaveLength(2))
    expect(writer2.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      providerId: 'file-provider',
      replacementId: 'repl-crash-recover'
    })
    writer2.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer2.messages[1]),
      result: { removedItems: 3, indexedItems: 5 }
    })

    await expect(commitPromise).resolves.toEqual({ removedItems: 3, indexedItems: 5 })
    await expect(client.drain()).resolves.toBeUndefined()
    expect(harness.kernelClient.getSpawnGeneration()).toBe(2)

    await client.shutdown()
    await harness.kernelClient.shutdown()
  })

  it('tears down ambiguous timed-out writer via WRITER_CLOSE and recovers commit receipt on fresh writer', async () => {
    vi.useFakeTimers()
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({
      kernelClient: harness.kernelClient,
      commitResponseTimeoutMs: 50,
      outcomeLookupTimeoutMs: 200,
      outcomeLookupAttempts: 2
    })

    const initPromise = client.init('/tmp/search-index.db')
    await vi.advanceTimersByTimeAsync(0)
    const writer1 = harness.children[0].writerWorkers[0]
    writer1.emit('message', { type: 'result', taskId: taskIdOf(writer1.messages[0]) })
    await initPromise

    const commitPromise = client.commitProviderReplacement('file-provider', 'repl-timeout')
    await vi.advanceTimersByTimeAsync(0)
    expect(writer1.messages[1]).toMatchObject({ type: 'commitProviderReplacement' })

    // Timeout fires -> sends WRITER_CLOSE(graceful: false) -> spawns writer2 -> init -> outcome lookup
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(0)
    expect(writer1.terminateCalls).toBe(1)
    expect(harness.children[0].writerWorkers).toHaveLength(2)

    const writer2 = harness.children[0].writerWorkers[1]
    expect(writer2.messages[0]).toMatchObject({ type: 'init', dbPath: '/tmp/search-index.db' })
    writer2.emit('message', { type: 'result', taskId: taskIdOf(writer2.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)

    expect(writer2.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      replacementId: 'repl-timeout'
    })
    writer2.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer2.messages[1]),
      result: { removedItems: 1, indexedItems: 9 }
    })

    await expect(commitPromise).resolves.toEqual({ removedItems: 1, indexedItems: 9 })
    await client.shutdown()
    await harness.kernelClient.shutdown()
  })

  it('auto-selects shared SearchKernelClient when TUFF_SEARCH_KERNEL_UTILITY_PROCESS=1', async () => {
    const harness = createWiredKernelHarness()
    // Seed the shared singleton with our test harness fork so no Electron is needed.
    const shared = getSharedSearchKernelClient({
      resolveEntryPath: () => '/virtual/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      fork: (entryPath, args, opts) =>
        (
          harness.kernelClient as unknown as {
            forkProcess: (...a: unknown[]) => SearchKernelChildProcess
          }
        ).forkProcess(entryPath, args, opts)
    })

    process.env[SEARCH_KERNEL_UTILITY_PROCESS_ENV] = '1'
    const autoClient = new SearchIndexWorkerClient()
    const status = await autoClient.getStatus()
    expect(status.executionMode).toBe('utility-process')
    expect(
      (autoClient as unknown as { kernelClient: SearchKernelClient | null }).kernelClient
    ).toBe(shared)

    await autoClient.shutdown()
  })

  it('joins concurrent ensureInitialized calls into a single in-flight init while kernel startup is pending', async () => {
    const harness = createWiredKernelHarness()
    let releaseStart!: () => void
    const originalEnsureStarted = harness.kernelClient.ensureStarted.bind(harness.kernelClient)
    vi.spyOn(harness.kernelClient, 'ensureStarted').mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          releaseStart = () => {
            void originalEnsureStarted().then(resolve, reject)
          }
        })
    )

    const client = new SearchIndexWorkerClient({ kernelClient: harness.kernelClient })
    // Call init() and immediately issue countByProvider() while ensureStarted() is still pending.
    const initPromise = client.init('/tmp/concurrent-init.db')
    const countPromise = client.countByProvider('file-provider')

    await Promise.resolve()
    releaseStart()

    await vi.waitFor(() => expect(harness.children[0]?.writerWorkers).toHaveLength(1))
    const writer = harness.children[0].writerWorkers[0]
    await vi.waitFor(() => expect(writer.messages).toHaveLength(1))
    expect(writer.messages[0]).toMatchObject({ type: 'init', dbPath: '/tmp/concurrent-init.db' })

    writer.emit('message', { type: 'result', taskId: taskIdOf(writer.messages[0]) })
    await initPromise

    await vi.waitFor(() => expect(writer.messages).toHaveLength(2))
    // Exactly ONE init message followed by countByProvider (no duplicate init).
    expect(writer.messages.map((m) => (m as { type: string }).type)).toEqual([
      'init',
      'countByProvider'
    ])
    writer.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer.messages[1]),
      result: 7
    })
    await expect(countPromise).resolves.toBe(7)

    await client.shutdown()
    await harness.kernelClient.shutdown()
  })

  it('stays fail-closed during a slow WRITER_CLOSE past terminationTimeoutMs and recovers once confirmed', async () => {
    vi.useFakeTimers()
    const harness = createWiredKernelHarness()
    const client = new SearchIndexWorkerClient({
      kernelClient: harness.kernelClient,
      commitResponseTimeoutMs: 25,
      terminationTimeoutMs: 50,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 1
    })

    const initPromise = client.init('/tmp/slow-close.db')
    await vi.advanceTimersByTimeAsync(0)
    const writer1 = harness.children[0].writerWorkers[0]
    writer1.emit('message', { type: 'result', taskId: taskIdOf(writer1.messages[0]) })
    await initPromise

    // Hold writer1.terminate() past terminationTimeoutMs (50ms) so the caller deadline fires first.
    let resolveTerminate!: (code: number) => void
    writer1.terminate = () => {
      writer1.terminateCalls += 1
      return new Promise<number>((resolve) => {
        resolveTerminate = resolve
      })
    }

    const commitPromise = client.commitProviderReplacement('file-provider', 'repl-slow-close')
    const commitRejection = expect(commitPromise).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:timeout'
    )
    await vi.advanceTimersByTimeAsync(0)

    // 25ms commit timeout + 50ms terminationTimeoutMs -> caller sees timeout, barrier remains pending.
    await vi.advanceTimersByTimeAsync(25)
    await vi.advanceTimersByTimeAsync(50)
    await commitRejection

    // Writes remain blocked while termination is unconfirmed.
    await expect(client.countByProvider('file-provider')).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:pending'
    )

    // Late termination confirmation clears the barrier cleanly instead of latching permanent failure!
    resolveTerminate(0)
    await vi.advanceTimersByTimeAsync(0)

    const recoveredCount = client.countByProvider('file-provider')
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.children[0].writerWorkers).toHaveLength(2)
    const writer2 = harness.children[0].writerWorkers[1]
    writer2.emit('message', { type: 'result', taskId: taskIdOf(writer2.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)
    writer2.emit('message', {
      type: 'result',
      taskId: taskIdOf(writer2.messages[1]),
      result: 99
    })
    await expect(recoveredCount).resolves.toBe(99)

    await client.shutdown()
    await harness.kernelClient.shutdown()
  })
})
