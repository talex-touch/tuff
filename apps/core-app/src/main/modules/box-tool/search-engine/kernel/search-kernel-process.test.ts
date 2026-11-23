import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SEARCH_KERNEL_ERROR_CODE_LENGTH,
  MAX_SEARCH_KERNEL_ERROR_MESSAGE_LENGTH,
  SEARCH_KERNEL_ERROR_CODES,
  SEARCH_KERNEL_PROTOCOL_VERSION,
  isSearchKernelEvent,
  isSearchKernelRequest,
  isSearchKernelResponse,
  serializeSearchKernelError
} from './search-kernel-protocol'
import { createSearchKernelRuntime, type SearchKernelParentPort } from './search-kernel-process'

interface MockParentPort extends SearchKernelParentPort {
  posted: unknown[]
  emitMessage(data: unknown): void
  listenerCount(): number
}

function createMockParentPort(): MockParentPort {
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
    },
    listenerCount() {
      return listeners.size
    }
  }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

function fixedMemoryUsage(): NodeJS.MemoryUsage {
  return {
    rss: 96_000_000,
    heapTotal: 40_000_000,
    heapUsed: 24_000_000,
    external: 2_000_000,
    arrayBuffers: 1_000_000
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('search-kernel-protocol guards and error serialization', () => {
  it('validates well-formed requests, responses, and events and rejects malformed frames', () => {
    expect(
      isSearchKernelRequest({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId: 'req-1',
        op: 'kernel.ping'
      })
    ).toBe(true)

    expect(
      isSearchKernelRequest({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId: 'req-2',
        op: 'kernel.task',
        taskType: 'index.write',
        payload: { count: 3 }
      })
    ).toBe(true)

    expect(
      isSearchKernelRequest({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId: 'req-3',
        op: 'kernel.task',
        taskType: ''
      })
    ).toBe(false)

    expect(isSearchKernelRequest(null)).toBe(false)
    expect(isSearchKernelRequest([])).toBe(false)
    expect(isSearchKernelResponse({ kind: 'response', ok: true })).toBe(false)
    expect(isSearchKernelEvent({ kind: 'event', event: 'kernel.ready', pid: -1 })).toBe(false)
  })

  it('bounds error code/message lengths and strips stack frames', () => {
    const err = Object.assign(
      new Error('Database busy\n    at internalFn (/secret/path/file.ts:42:11)\n    at next'),
      {
        code: `SQLITE_${'X'.repeat(120)}`,
        retryable: true
      }
    )

    const serialized = serializeSearchKernelError(err)
    expect(serialized.code.length).toBe(MAX_SEARCH_KERNEL_ERROR_CODE_LENGTH)
    expect(serialized.message).toBe('Database busy')
    expect(serialized.message).not.toContain('/secret/path')
    expect(serialized.retryable).toBe(true)

    const longMessage = serializeSearchKernelError(new Error('a'.repeat(1000)))
    expect(longMessage.message.length).toBe(MAX_SEARCH_KERNEL_ERROR_MESSAGE_LENGTH)
    expect(longMessage.code).toBe(SEARCH_KERNEL_ERROR_CODES.TASK_FAILED)
  })
})

describe('createSearchKernelRuntime', () => {
  it('emits kernel.ready on boot and handles ping, memory, and health requests', () => {
    let clock = 1_000
    const port = createMockParentPort()
    const runtime = createSearchKernelRuntime({
      port,
      pid: 4242,
      now: () => clock,
      memoryUsage: fixedMemoryUsage,
      handlers: {
        'index.write': () => ({ written: 1 }),
        'index.read': () => ({ rows: [] })
      }
    })

    expect(port.posted).toHaveLength(1)
    expect(isSearchKernelEvent(port.posted[0])).toBe(true)
    expect(port.posted[0]).toEqual({
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.ready',
      pid: 4242,
      version: SEARCH_KERNEL_PROTOCOL_VERSION,
      capabilities: ['index.read', 'index.write'],
      startedAt: 1_000
    })

    clock = 1_450
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'ping-1',
      op: 'kernel.ping'
    })

    expect(isSearchKernelResponse(port.posted[1])).toBe(true)
    expect(port.posted[1]).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'ping-1',
      op: 'kernel.ping',
      ok: true,
      result: {
        ok: true,
        pid: 4242,
        uptimeMs: 450,
        version: SEARCH_KERNEL_PROTOCOL_VERSION
      }
    })

    clock = 1_600
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'mem-1',
      op: 'kernel.memory'
    })

    expect(isSearchKernelResponse(port.posted[2])).toBe(true)
    expect(port.posted[2]).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'mem-1',
      op: 'kernel.memory',
      ok: true,
      result: {
        rssBytes: 96_000_000,
        heapUsedBytes: 24_000_000,
        heapTotalBytes: 40_000_000,
        externalBytes: 2_000_000,
        arrayBuffersBytes: 1_000_000,
        pid: 4242,
        capturedAt: 1_600
      }
    })

    clock = 1_800
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'health-1',
      op: 'kernel.health'
    })

    expect(isSearchKernelResponse(port.posted[3])).toBe(true)
    expect(port.posted[3]).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'health-1',
      op: 'kernel.health',
      ok: true,
      result: {
        ok: true,
        state: 'ready',
        pid: 4242,
        uptimeMs: 800,
        memory: {
          rssBytes: 96_000_000,
          heapUsedBytes: 24_000_000,
          heapTotalBytes: 40_000_000,
          externalBytes: 2_000_000,
          arrayBuffersBytes: 1_000_000,
          pid: 4242,
          capturedAt: 1_800
        },
        capabilities: ['index.read', 'index.write'],
        activeRequests: 0
      }
    })

    runtime.dispose()
    expect(port.listenerCount()).toBe(0)
  })

  it('executes registered custom task handlers and tracks activeRequests', async () => {
    const port = createMockParentPort()
    let releaseTask: ((value: { indexed: number }) => void) | null = null

    const runtime = createSearchKernelRuntime({
      port,
      pid: 777,
      memoryUsage: fixedMemoryUsage
    })

    runtime.registerTask<{ batchSize: number }, { indexed: number }>(
      'search-index.upsert',
      async (payload, ctx) => {
        expect(ctx.taskType).toBe('search-index.upsert')
        expect(ctx.requestId).toBe('task-1')
        expect(ctx.signal.aborted).toBe(false)
        return await new Promise<{ indexed: number }>((resolve) => {
          releaseTask = resolve
          expect(payload.batchSize).toBe(12)
        })
      }
    )

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'task-1',
      op: 'kernel.task',
      taskType: 'search-index.upsert',
      payload: { batchSize: 12 }
    })

    expect(runtime.getActiveRequestCount()).toBe(1)

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'health-inflight',
      op: 'kernel.health'
    })

    const healthMsg = port.posted.at(-1) as { result: { activeRequests: number } }
    expect(healthMsg.result.activeRequests).toBe(1)

    releaseTask!({ indexed: 12 })
    await flushMicrotasks()

    expect(runtime.getActiveRequestCount()).toBe(0)
    expect(port.posted.at(-1)).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'task-1',
      op: 'kernel.task',
      ok: true,
      result: { indexed: 12 }
    })

    expect(runtime.unregisterTask('search-index.upsert')).toBe(true)
    expect(runtime.getCapabilities()).toEqual([])
    runtime.dispose()
  })

  it('isolates task handler errors without leaking stack internals or hanging callers', async () => {
    const port = createMockParentPort()
    const runtime = createSearchKernelRuntime({
      port,
      pid: 900,
      handlers: {
        'boom.sync': () => {
          const err = new Error(
            'SQLite constraint failed\n    at secretFrame (/internal/db.ts:9:3)'
          )
          throw Object.assign(err, { code: 'SQLITE_CONSTRAINT', retryable: false })
        },
        'boom.async': async () => {
          throw Object.assign(new Error('Transient busy lock'), {
            code: 'SQLITE_BUSY',
            retryable: true
          })
        }
      }
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'err-sync',
      op: 'kernel.task',
      taskType: 'boom.sync'
    })
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'err-async',
      op: 'kernel.task',
      taskType: 'boom.async'
    })
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'err-missing',
      op: 'kernel.task',
      taskType: 'does.not.exist'
    })

    await flushMicrotasks()

    const responses = port.posted.slice(1)
    expect(responses).toHaveLength(3)
    const byId = new Map<string, unknown>()
    for (const msg of responses) {
      expect(isSearchKernelResponse(msg)).toBe(true)
      byId.set((msg as { requestId: string }).requestId, msg)
    }

    expect(runtime.getActiveRequestCount()).toBe(0)

    expect(byId.get('err-sync')).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'err-sync',
      op: 'kernel.task',
      ok: false,
      error: {
        code: 'SQLITE_CONSTRAINT',
        message: 'SQLite constraint failed',
        retryable: false
      }
    })

    expect(byId.get('err-async')).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'err-async',
      op: 'kernel.task',
      ok: false,
      error: {
        code: 'SQLITE_BUSY',
        message: 'Transient busy lock',
        retryable: true
      }
    })

    expect(byId.get('err-missing')).toMatchObject({
      kind: 'response',
      requestId: 'err-missing',
      op: 'kernel.task',
      ok: false,
      error: {
        code: SEARCH_KERNEL_ERROR_CODES.UNKNOWN_TASK,
        retryable: false
      }
    })

    // Runtime remains healthy after handler failures.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'ping-after-error',
      op: 'kernel.ping'
    })
    expect(port.posted.at(-1)).toMatchObject({
      requestId: 'ping-after-error',
      ok: true
    })

    runtime.dispose()
  })

  it('rejects unknown operations, bad protocol versions, and survives malformed frames', () => {
    const port = createMockParentPort()
    const runtime = createSearchKernelRuntime({ port, pid: 101 })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'bad-op',
      op: 'kernel.unsupported'
    })
    expect(port.posted.at(-1)).toMatchObject({
      kind: 'response',
      requestId: 'bad-op',
      op: 'unknown',
      ok: false,
      error: {
        code: SEARCH_KERNEL_ERROR_CODES.UNKNOWN_OPERATION,
        retryable: false
      }
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: 99,
      requestId: 'bad-version',
      op: 'kernel.ping'
    })
    expect(port.posted.at(-1)).toMatchObject({
      kind: 'response',
      requestId: 'bad-version',
      op: 'unknown',
      ok: false,
      error: {
        code: SEARCH_KERNEL_ERROR_CODES.PROTOCOL_ERROR,
        retryable: false
      }
    })

    // Completely malformed payloads emit kernel.error without throwing.
    port.emitMessage(null)
    port.emitMessage('not-an-object')
    port.emitMessage(['invalid'])

    const errorEvents = port.posted.slice(-3)
    expect(errorEvents).toHaveLength(3)
    for (const evt of errorEvents) {
      expect(isSearchKernelEvent(evt)).toBe(true)
      expect(evt).toMatchObject({
        kind: 'event',
        event: 'kernel.error',
        error: { code: SEARCH_KERNEL_ERROR_CODES.INVALID_MESSAGE }
      })
    }

    // Still responsive to valid ping.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'ping-ok',
      op: 'kernel.ping'
    })
    expect(port.posted.at(-1)).toMatchObject({ requestId: 'ping-ok', ok: true })
    runtime.dispose()
  })

  it('drains in-flight tasks on kernel.shutdown, rejects new tasks, acks, and schedules exit', async () => {
    const port = createMockParentPort()
    const exitSpy = vi.fn()
    const scheduledExits: Array<() => void> = []
    let finishTask: (() => void) | null = null

    const runtime = createSearchKernelRuntime({
      port,
      pid: 3030,
      exit: exitSpy,
      scheduleExit: (cb) => {
        scheduledExits.push(cb)
      },
      handlers: {
        'slow.job': async () => {
          await new Promise<void>((resolve) => {
            finishTask = resolve
          })
          return { done: true }
        }
      }
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'job-1',
      op: 'kernel.task',
      taskType: 'slow.job'
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shutdown-1',
      op: 'kernel.shutdown',
      reason: 'app-quit'
    })

    expect(runtime.getState()).toBe('draining')
    expect(port.posted.at(-1)).toEqual({
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.draining',
      pid: 3030,
      activeRequests: 1,
      reason: 'app-quit'
    })

    // New tasks arriving while draining are rejected with retryable SHUTTING_DOWN.
    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'job-2',
      op: 'kernel.task',
      taskType: 'slow.job'
    })
    expect(port.posted.at(-1)).toMatchObject({
      requestId: 'job-2',
      ok: false,
      error: {
        code: SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
        retryable: true
      }
    })

    expect(exitSpy).not.toHaveBeenCalled()

    // Finish the in-flight task so drain completes.
    finishTask!()
    await flushMicrotasks()

    expect(runtime.getState()).toBe('stopped')
    expect(port.listenerCount()).toBe(0)
    expect(port.posted.at(-1)).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shutdown-1',
      op: 'kernel.shutdown',
      ok: true,
      result: {
        ok: true,
        pid: 3030,
        drainedRequests: 1
      }
    })

    expect(scheduledExits).toHaveLength(1)
    scheduledExits[0]()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('aborts hung tasks after drainTimeoutMs so shutdown always completes', async () => {
    vi.useFakeTimers()
    const port = createMockParentPort()
    const exitSpy = vi.fn()
    let observedSignalAborted = false

    createSearchKernelRuntime({
      port,
      pid: 4040,
      drainTimeoutMs: 500,
      exit: exitSpy,
      scheduleExit: (cb) => cb(),
      handlers: {
        'hung.job': async (_payload, ctx) => {
          await new Promise<void>(() => {
            ctx.signal.addEventListener('abort', () => {
              observedSignalAborted = true
            })
          })
        }
      }
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'hung-1',
      op: 'kernel.task',
      taskType: 'hung.job'
    })

    port.emitMessage({
      kind: 'request',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shutdown-timeout',
      op: 'kernel.shutdown'
    })

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(observedSignalAborted).toBe(true)
    expect(port.posted.at(-1)).toEqual({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId: 'shutdown-timeout',
      op: 'kernel.shutdown',
      ok: true,
      result: {
        ok: true,
        pid: 4040,
        drainedRequests: 1
      }
    })
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
