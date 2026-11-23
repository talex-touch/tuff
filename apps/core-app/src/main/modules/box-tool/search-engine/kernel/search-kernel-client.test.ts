import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForkOptions } from 'electron'
import {
  SEARCH_KERNEL_ENTRY_FILENAME,
  SEARCH_KERNEL_ERROR_CODES,
  SEARCH_KERNEL_PROTOCOL_VERSION,
  SEARCH_KERNEL_SERVICE_NAME,
  type SearchKernelEvent
} from './search-kernel-protocol'
import {
  createSearchKernelRuntime,
  type SearchKernelParentPort,
  type SearchKernelTaskHandler
} from './search-kernel-process'
import {
  SEARCH_KERNEL_UTILITY_PROCESS_ENV,
  SearchKernelClient,
  SearchKernelClientError,
  getSharedSearchKernelClient,
  isSearchKernelUtilityProcessEnabled,
  resetSharedSearchKernelClient,
  resolveSearchKernelEntryPath,
  type SearchKernelChildProcess
} from './search-kernel-client'

type ChildListener = (...args: never[]) => void

interface FakeUtilityProcess extends SearchKernelChildProcess {
  emit(event: string, ...args: unknown[]): void
  postedMessages: unknown[]
  killMock: ReturnType<typeof vi.fn<() => boolean>>
  stdoutListeners: number
  stderrListeners: number
}

function createFakeUtilityProcess(pid = 5000): FakeUtilityProcess {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const postedMessages: unknown[] = []
  let stdoutListeners = 0
  let stderrListeners = 0

  const add = (event: string, listener: ChildListener): void => {
    const bucket = listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
    bucket.add(listener as (...args: unknown[]) => void)
    listeners.set(event, bucket)
  }

  const remove = (event: string, listener: ChildListener): void => {
    listeners.get(event)?.delete(listener as (...args: unknown[]) => void)
  }

  const killMock = vi.fn<() => boolean>(() => true)

  return {
    pid,
    postedMessages,
    killMock,
    get stdoutListeners() {
      return stdoutListeners
    },
    get stderrListeners() {
      return stderrListeners
    },
    stdout: {
      on(_event, _listener) {
        stdoutListeners += 1
      }
    },
    stderr: {
      on(_event, _listener) {
        stderrListeners += 1
      }
    },
    on(event: string, listener: ChildListener) {
      add(event, listener)
      return this
    },
    off(event: string, listener: ChildListener) {
      remove(event, listener)
      return this
    },
    postMessage(message: unknown) {
      postedMessages.push(message)
    },
    kill() {
      return killMock()
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of Array.from(listeners.get(event) ?? [])) {
        listener(...args)
      }
    }
  }
}

/**
 * Wires a real `createSearchKernelRuntime` directly onto a `FakeUtilityProcess` over an in-memory
 * message bridge so client/process roundtrips run deterministically without spawning Electron.
 */
function createWiredChild(
  pid: number,
  options: {
    handlers?: Record<string, SearchKernelTaskHandler>
    registerDefaultWorkerHandlers?: boolean
    now?: () => number
    autoExitOnShutdown?: boolean
  } = {}
): FakeUtilityProcess {
  const child = createFakeUtilityProcess(pid)
  const portListeners = new Set<(event: { data: unknown }) => void>()
  const parentPort: SearchKernelParentPort = {
    on(_event, listener) {
      portListeners.add(listener)
    },
    off(_event, listener) {
      portListeners.delete(listener)
    },
    postMessage(message) {
      // Deliver child -> host asynchronously, matching IPC turn boundaries.
      queueMicrotask(() => {
        child.emit('message', message)
      })
    }
  }

  const origPost = child.postMessage.bind(child)
  child.postMessage = (message: unknown) => {
    origPost(message)
    queueMicrotask(() => {
      for (const listener of Array.from(portListeners)) {
        listener({ data: message })
      }
    })
  }

  createSearchKernelRuntime({
    port: parentPort,
    pid,
    now: options.now,
    registerDefaultWorkerHandlers: options.registerDefaultWorkerHandlers ?? false,
    handlers: options.handlers,
    exit: (code) => {
      if (options.autoExitOnShutdown !== false) {
        queueMicrotask(() => child.emit('exit', code))
      }
    },
    scheduleExit: (cb) => {
      queueMicrotask(cb)
    }
  })

  return child
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('isSearchKernelUtilityProcessEnabled & resolveSearchKernelEntryPath', () => {
  it('enables utilityProcess host strictly when TUFF_SEARCH_KERNEL_UTILITY_PROCESS=1', () => {
    expect(isSearchKernelUtilityProcessEnabled({})).toBe(false)
    expect(isSearchKernelUtilityProcessEnabled({ [SEARCH_KERNEL_UTILITY_PROCESS_ENV]: '0' })).toBe(
      false
    )
    expect(
      isSearchKernelUtilityProcessEnabled({ [SEARCH_KERNEL_UTILITY_PROCESS_ENV]: 'true' })
    ).toBe(false)
    expect(isSearchKernelUtilityProcessEnabled({ [SEARCH_KERNEL_UTILITY_PROCESS_ENV]: '1' })).toBe(
      true
    )
    expect(
      isSearchKernelUtilityProcessEnabled({ [SEARCH_KERNEL_UTILITY_PROCESS_ENV]: ' 1 ' })
    ).toBe(true)
  })

  it('resolves entry path across __dirname, app.asar.unpacked, app.asar, and cwd', () => {
    const unpacked = path.join(
      '/Applications/Tuff.app/Contents/Resources',
      'app.asar.unpacked',
      'out',
      'main',
      SEARCH_KERNEL_ENTRY_FILENAME
    )
    const foundUnpacked = resolveSearchKernelEntryPath({
      dirname: '/nonexistent/dir',
      resourcesPath: '/Applications/Tuff.app/Contents/Resources',
      cwd: '/workspace',
      exists: (candidate) => candidate === unpacked
    })
    expect(foundUnpacked).toBe(unpacked)

    const cwdPath = path.resolve('/workspace', 'out', 'main', SEARCH_KERNEL_ENTRY_FILENAME)
    const foundCwd = resolveSearchKernelEntryPath({
      dirname: '/nonexistent/dir',
      resourcesPath: '',
      cwd: '/workspace',
      exists: (candidate) => candidate === cwdPath
    })
    expect(foundCwd).toBe(cwdPath)

    expect(() =>
      resolveSearchKernelEntryPath({
        dirname: '/missing',
        resourcesPath: '/missing/resources',
        cwd: '/missing/cwd',
        exists: () => false
      })
    ).toThrow(SearchKernelClientError)
  })
})

describe('SearchKernelClient startup, roundtrips, and lifecycle', () => {
  it('performs lazy single-flight spawn and full ping/health/memory/task roundtrips', async () => {
    let clock = 10_000
    const forkedCalls: Array<{ entryPath: string; args: string[]; options: ForkOptions }> = []
    const children: FakeUtilityProcess[] = []
    const events: SearchKernelEvent[] = []

    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      now: () => clock,
      onEvent: (evt) => events.push(evt),
      fork: (entryPath, args, options) => {
        forkedCalls.push({ entryPath, args, options })
        const child = createWiredChild(8801, {
          now: () => clock,
          handlers: {
            'search.query': async (payload) => {
              const { term } = payload as { term: string }
              return { hits: [`match:${term}`] }
            },
            'search.fail': () => {
              throw Object.assign(new Error('Index busy'), {
                code: 'SQLITE_BUSY',
                retryable: true
              })
            }
          }
        })
        children.push(child)
        return child
      }
    })

    expect(client.getState()).toBe('idle')
    expect(forkedCalls).toHaveLength(0)

    // Concurrent startup calls coalesce into a single fork.
    await Promise.all([client.ensureStarted(), client.ensureStarted(), client.ensureStarted()])
    expect(forkedCalls).toHaveLength(1)
    expect(forkedCalls[0]).toEqual({
      entryPath: '/app/out/main/search-kernel-process.js',
      args: [],
      options: {
        serviceName: SEARCH_KERNEL_SERVICE_NAME,
        stdio: 'pipe'
      }
    })
    expect(children[0].stdoutListeners).toBe(1)
    expect(children[0].stderrListeners).toBe(1)
    expect(client.getState()).toBe('ready')
    expect(client.getPid()).toBe(8801)
    expect(client.getCapabilities()).toEqual(['search.fail', 'search.query'])
    expect(events[0]).toMatchObject({ event: 'kernel.ready', pid: 8801 })

    clock = 10_250
    const ping = await client.ping()
    expect(ping).toEqual({
      ok: true,
      pid: 8801,
      uptimeMs: 250,
      version: SEARCH_KERNEL_PROTOCOL_VERSION
    })

    const health = await client.health()
    expect(health).toMatchObject({
      ok: true,
      state: 'ready',
      pid: 8801,
      uptimeMs: 250,
      capabilities: ['search.fail', 'search.query'],
      activeRequests: 0
    })

    const memory = await client.memory()
    expect(memory.pid).toBe(8801)
    expect(memory.rssBytes).toBeGreaterThan(0)
    expect(memory.capturedAt).toBe(10_250)

    const taskResult = await client.invokeTask<{ hits: string[] }>('search.query', {
      term: 'tuff'
    })
    expect(taskResult).toEqual({ hits: ['match:tuff'] })

    await expect(client.invokeTask('search.fail')).rejects.toMatchObject({
      name: 'SearchKernelClientError',
      code: 'SQLITE_BUSY',
      message: 'Index busy',
      retryable: true
    })

    const ack = await client.shutdown({ reason: 'test-complete' })
    expect(ack).toEqual({ ok: true, pid: 8801, drainedRequests: 0 })
    expect(children[0].killMock).not.toHaveBeenCalled()
    expect(client.getState()).toBe('stopped')
  })

  it('enforces per-request timeouts and AbortSignal cancellation', async () => {
    vi.useFakeTimers()
    const child = createFakeUtilityProcess(9100)
    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      defaultRequestTimeoutMs: 5_000,
      fork: () => child
    })

    const startPromise = client.ensureStarted()
    child.emit('message', {
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.ready',
      pid: 9100,
      version: SEARCH_KERNEL_PROTOCOL_VERSION,
      capabilities: [],
      startedAt: 0
    })
    await startPromise

    // 1. Already-aborted signal rejects immediately without posting to child.
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(client.ping({ signal: preAborted.signal })).rejects.toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.ABORTED,
      retryable: false
    })
    expect(child.postedMessages).toHaveLength(0)

    // 2. Request timeout rejects cleanly without killing the shared kernel process.
    const timedOutPing = client.ping({ timeoutMs: 200 })
    const timedOutOutcome = timedOutPing.catch((error: unknown) => error)
    await flushMicrotasks()
    expect(client.getPendingRequestCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(200)
    const timeoutErr = await timedOutOutcome
    expect(timeoutErr).toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.TIMEOUT,
      retryable: true
    })
    expect(client.getPendingRequestCount()).toBe(0)
    expect(child.killMock).not.toHaveBeenCalled()

    // 3. Mid-flight AbortSignal rejects immediately and frees pending correlation entry.
    const inflightController = new AbortController()
    const abortedTask = client.invokeTask('slow.op', {}, { signal: inflightController.signal })
    const abortedOutcome = abortedTask.catch((error: unknown) => error)
    await flushMicrotasks()
    expect(client.getPendingRequestCount()).toBe(1)

    inflightController.abort()
    const abortErr = await abortedOutcome
    expect(abortErr).toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.ABORTED,
      retryable: false
    })
    expect(client.getPendingRequestCount()).toBe(0)

    // Child remains ready after individual request timeout/abort.
    expect(client.getState()).toBe('ready')
  })

  it('rejects startup with KERNEL_TIMEOUT and kills a child that never sends kernel.ready', async () => {
    vi.useFakeTimers()
    const child = createFakeUtilityProcess(9200)
    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      readyTimeoutMs: 1_000,
      fork: () => child
    })

    const startOutcome = client.ensureStarted().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1_000)

    const error = await startOutcome
    expect(error).toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.TIMEOUT,
      retryable: true
    })
    expect(child.killMock).toHaveBeenCalledTimes(1)
    expect(client.getState()).toBe('stopped')
  })

  it('rejects in-flight requests on crash, applies exponential backoff, and trips degraded circuit breaker', async () => {
    vi.useFakeTimers()
    let clock = 100_000
    const children: FakeUtilityProcess[] = []
    const states: string[] = []

    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      now: () => clock,
      maxRestartsInWindow: 3,
      restartWindowMs: 60_000,
      restartBaseDelayMs: 250,
      restartMaxDelayMs: 5_000,
      onStateChange: (next) => states.push(next),
      fork: () => {
        const child = createFakeUtilityProcess(6000 + children.length)
        children.push(child)
        return child
      }
    })

    const emitReady = (child: FakeUtilityProcess): void => {
      child.emit('message', {
        kind: 'event',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        event: 'kernel.ready',
        pid: child.pid ?? 6000,
        version: SEARCH_KERNEL_PROTOCOL_VERSION,
        capabilities: [],
        startedAt: clock
      })
    }

    // Boot #1
    const firstStart = client.ensureStarted()
    emitReady(children[0])
    await firstStart

    // Start an in-flight request, then crash child #1.
    const inflightOutcome = client.ping().catch((error: unknown) => error)
    await flushMicrotasks()
    expect(client.getPendingRequestCount()).toBe(1)

    // Crash #1 -> schedules restart #1 after 250ms.
    children[0].emit('exit', 139)
    const crashErr = await inflightOutcome
    expect(crashErr).toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.EXITED,
      retryable: true
    })
    expect(client.getPendingRequestCount()).toBe(0)
    expect(client.isDegraded()).toBe(false)
    expect(client.getRestartStats()).toMatchObject({
      restartsInWindow: 1,
      degraded: false,
      nextRestartAt: clock + 250
    })

    // Advance 249ms -> no restart yet.
    clock += 249
    await vi.advanceTimersByTimeAsync(249)
    expect(children).toHaveLength(1)

    // Advance 1ms -> restart #1 fires (250ms).
    clock += 1
    await vi.advanceTimersByTimeAsync(1)
    expect(children).toHaveLength(2)
    emitReady(children[1])

    // Crash #2 -> schedules restart #2 after 500ms.
    children[1].emit('exit', 1)
    expect(client.getRestartStats()).toMatchObject({
      restartsInWindow: 2,
      degraded: false,
      nextRestartAt: clock + 500
    })

    clock += 500
    await vi.advanceTimersByTimeAsync(500)
    expect(children).toHaveLength(3)
    emitReady(children[2])

    // Crash #3 -> schedules restart #3 after 1000ms.
    children[2].emit('exit', 1)
    expect(client.getRestartStats()).toMatchObject({
      restartsInWindow: 3,
      degraded: false,
      nextRestartAt: clock + 1_000
    })

    clock += 1_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(children).toHaveLength(4)
    emitReady(children[3])

    // Crash #4 within 60s window -> budget exhausted, transitions to degraded, no more spawns.
    children[3].emit('exit', 1)
    expect(client.isDegraded()).toBe(true)
    expect(client.getState()).toBe('degraded')
    expect(states.at(-1)).toBe('degraded')

    clock += 10_000
    await vi.advanceTimersByTimeAsync(10_000)
    expect(children).toHaveLength(4)

    await expect(client.ensureStarted()).rejects.toMatchObject({
      code: SEARCH_KERNEL_ERROR_CODES.DEGRADED,
      retryable: false
    })

    // Manual recovery clears degraded circuit breaker and allows clean boot.
    client.resetDegradedState()
    expect(client.getState()).toBe('idle')
    const recoveredStart = client.ensureStarted()
    expect(children).toHaveLength(5)
    emitReady(children[4])
    await recoveredStart
    expect(client.getState()).toBe('ready')
  })

  it('hooks before-quit for graceful shutdown and falls back to child.kill on shutdown timeout', async () => {
    vi.useFakeTimers()
    let quitListener: (() => void) | null = null
    const unregisterSpy = vi.fn(() => {
      quitListener = null
    })

    const child = createFakeUtilityProcess(7700)
    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      shutdownTimeoutMs: 400,
      registerBeforeQuit: (listener) => {
        quitListener = listener
        return unregisterSpy
      },
      fork: () => child
    })

    const startPromise = client.ensureStarted()
    child.emit('message', {
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.ready',
      pid: 7700,
      version: SEARCH_KERNEL_PROTOCOL_VERSION,
      capabilities: [],
      startedAt: 0
    })
    await startPromise
    expect(quitListener).not.toBeNull()

    // Trigger before-quit against an unresponsive child -> sends kernel.shutdown, then kills at 400ms.
    quitListener!()
    await flushMicrotasks()

    expect(child.postedMessages).toHaveLength(1)
    expect(child.postedMessages[0]).toMatchObject({
      kind: 'request',
      op: 'kernel.shutdown',
      reason: 'app-before-quit'
    })
    expect(child.killMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    await flushMicrotasks()

    expect(child.killMock).toHaveBeenCalledTimes(1)
    expect(client.getState()).toBe('stopped')
    expect(unregisterSpy).toHaveBeenCalledTimes(1)
  })

  it('cleans up exitWaiters after a timed-out shutdown and increments spawnGeneration on reuse', async () => {
    vi.useFakeTimers()
    const children: FakeUtilityProcess[] = []
    const client = new SearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      shutdownTimeoutMs: 200,
      fork: () => {
        const child = createFakeUtilityProcess(7800 + children.length)
        children.push(child)
        return child
      }
    })

    const emitReady = (child: FakeUtilityProcess): void => {
      child.emit('message', {
        kind: 'event',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        event: 'kernel.ready',
        pid: child.pid ?? 7800,
        version: SEARCH_KERNEL_PROTOCOL_VERSION,
        capabilities: [],
        startedAt: 0
      })
    }

    const firstStart = client.ensureStarted()
    emitReady(children[0])
    await firstStart
    expect(client.getSpawnGeneration()).toBe(1)

    // Timed-out shutdown kills child #0 without it emitting 'exit'; exitWaiters must be cleaned.
    const shutdownPromise = client.shutdown({ reason: 'timeout-reuse' })
    await vi.advanceTimersByTimeAsync(200)
    await shutdownPromise
    expect(children[0].killMock).toHaveBeenCalledTimes(1)
    expect((client as unknown as { exitWaiters: Set<unknown> }).exitWaiters.size).toBe(0)

    // Reusing the client spawns generation 2 cleanly.
    const secondStart = client.ensureStarted()
    emitReady(children[1])
    await secondStart
    expect(client.getSpawnGeneration()).toBe(2)
    expect(client.getState()).toBe('ready')
  })

  it('shares a singleton via getSharedSearchKernelClient and disposes via resetSharedSearchKernelClient', async () => {
    await resetSharedSearchKernelClient()
    const child = createWiredChild(8900)
    const first = getSharedSearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      fork: () => child
    })
    const second = getSharedSearchKernelClient()
    expect(second).toBe(first)

    await first.ensureStarted()
    expect(first.getState()).toBe('ready')

    await resetSharedSearchKernelClient()
    expect(first.getState()).toBe('stopped')

    const third = getSharedSearchKernelClient({
      resolveEntryPath: () => '/app/out/main/search-kernel-process.js',
      registerBeforeQuit: () => () => {},
      fork: () => createWiredChild(8901)
    })
    expect(third).not.toBe(first)
    await resetSharedSearchKernelClient()
  })
})
