import process from 'node:process'
import {
  SEARCH_KERNEL_ERROR_CODES,
  SEARCH_KERNEL_PROTOCOL_VERSION,
  isSearchKernelOperation,
  isSearchKernelRequest,
  serializeSearchKernelError,
  type SearchKernelErrorPayload,
  type SearchKernelErrorResponse,
  type SearchKernelEvent,
  type SearchKernelHealthResult,
  type SearchKernelMemorySnapshot,
  type SearchKernelOperation,
  type SearchKernelPingResult,
  type SearchKernelProcessState,
  type SearchKernelRequest,
  type SearchKernelShutdownResult,
  type SearchKernelSuccessResponse
} from './search-kernel-protocol'

const DEFAULT_DRAIN_TIMEOUT_MS = 3_000

/**
 * Minimal parent port contract matching Electron's `process.parentPort` so the kernel runtime
 * has zero Electron GUI imports and can be exercised directly in Vitest with an in-memory port.
 */
export interface SearchKernelParentPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  off(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

export interface SearchKernelTaskContext {
  readonly requestId: string
  readonly taskType: string
  readonly signal: AbortSignal
}

export type SearchKernelTaskHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  context: SearchKernelTaskContext
) => TResult | Promise<TResult>

export interface SearchKernelRuntimeOptions {
  port: SearchKernelParentPort
  handlers?: Record<string, SearchKernelTaskHandler>
  now?: () => number
  pid?: number
  memoryUsage?: () => NodeJS.MemoryUsage
  exit?: (code: number) => void
  drainTimeoutMs?: number
  scheduleExit?: (callback: () => void) => void
}

export interface SearchKernelRuntimeHandle {
  registerTask<TPayload = unknown, TResult = unknown>(
    taskType: string,
    handler: SearchKernelTaskHandler<TPayload, TResult>
  ): void
  unregisterTask(taskType: string): boolean
  getCapabilities(): string[]
  getState(): SearchKernelProcessState
  getActiveRequestCount(): number
  dispose(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Starts the Search & Index Kernel message loop on the provided parent port.
 *
 * Pure Node + protocol: no Electron GUI modules are imported here so the same bundle entry runs
 * inside Electron's `utilityProcess` (inheriting bundle codesign/TCC identity) and in unit tests.
 */
export function createSearchKernelRuntime(
  options: SearchKernelRuntimeOptions
): SearchKernelRuntimeHandle {
  const port = options.port
  const now = options.now ?? (() => Date.now())
  const pid = options.pid ?? process.pid
  const readMemoryUsage = options.memoryUsage ?? (() => process.memoryUsage())
  const exitProcess = options.exit ?? ((code: number) => process.exit(code))
  const drainTimeoutMs =
    typeof options.drainTimeoutMs === 'number' &&
    Number.isFinite(options.drainTimeoutMs) &&
    options.drainTimeoutMs > 0
      ? options.drainTimeoutMs
      : DEFAULT_DRAIN_TIMEOUT_MS
  const scheduleExit =
    options.scheduleExit ??
    ((callback: () => void) => {
      setImmediate(callback)
    })

  const startedAt = now()
  let state: SearchKernelProcessState = 'ready'
  let disposed = false
  let shutdownPromise: Promise<SearchKernelShutdownResult> | null = null

  const handlers = new Map<string, SearchKernelTaskHandler>()
  if (options.handlers) {
    for (const [taskType, handler] of Object.entries(options.handlers)) {
      if (taskType.length > 0) {
        handlers.set(taskType, handler)
      }
    }
  }

  const activeTasks = new Map<string, Promise<void>>()
  const shutdownController = new AbortController()

  const getCapabilities = (): string[] => Array.from(handlers.keys()).sort()

  const captureMemory = (): SearchKernelMemorySnapshot => {
    const usage = readMemoryUsage()
    return {
      rssBytes: usage.rss,
      heapUsedBytes: usage.heapUsed,
      heapTotalBytes: usage.heapTotal,
      externalBytes: usage.external,
      arrayBuffersBytes: usage.arrayBuffers,
      pid,
      capturedAt: now()
    }
  }

  const safePost = (
    message: SearchKernelSuccessResponse | SearchKernelErrorResponse | SearchKernelEvent
  ): void => {
    try {
      port.postMessage(message)
    } catch {
      // Parent channel may already be closed during teardown.
    }
  }

  const postErrorResponse = (
    requestId: string,
    op: SearchKernelOperation | 'unknown',
    error: SearchKernelErrorPayload
  ): void => {
    safePost({
      kind: 'response',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      requestId,
      op,
      ok: false,
      error
    })
  }

  const postErrorEvent = (error: SearchKernelErrorPayload): void => {
    safePost({
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.error',
      pid,
      error
    })
  }

  const handleMalformedMessage = (raw: unknown): void => {
    if (isRecord(raw) && raw.kind === 'request') {
      const requestId = readNonEmptyString(raw.requestId)
      if (requestId) {
        if (raw.protocolVersion !== SEARCH_KERNEL_PROTOCOL_VERSION) {
          postErrorResponse(requestId, 'unknown', {
            code: SEARCH_KERNEL_ERROR_CODES.PROTOCOL_ERROR,
            message: `Unsupported search kernel protocol version: ${String(raw.protocolVersion)}`,
            retryable: false
          })
          return
        }
        if (typeof raw.op === 'string' && !isSearchKernelOperation(raw.op)) {
          postErrorResponse(requestId, 'unknown', {
            code: SEARCH_KERNEL_ERROR_CODES.UNKNOWN_OPERATION,
            message: `Unknown search kernel operation: ${raw.op.slice(0, 64)}`,
            retryable: false
          })
          return
        }
        postErrorResponse(requestId, isSearchKernelOperation(raw.op) ? raw.op : 'unknown', {
          code: SEARCH_KERNEL_ERROR_CODES.INVALID_MESSAGE,
          message: 'Malformed search kernel request payload',
          retryable: false
        })
        return
      }
    }

    postErrorEvent({
      code: SEARCH_KERNEL_ERROR_CODES.INVALID_MESSAGE,
      message: 'Received malformed search kernel IPC frame',
      retryable: false
    })
  }

  const performShutdown = (reason?: string): Promise<SearchKernelShutdownResult> => {
    if (shutdownPromise) return shutdownPromise

    state = 'draining'
    const drainedRequests = activeTasks.size
    safePost({
      kind: 'event',
      protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
      event: 'kernel.draining',
      pid,
      activeRequests: drainedRequests,
      ...(reason !== undefined ? { reason } : {})
    })

    shutdownPromise = (async () => {
      const pending = Array.from(activeTasks.values())
      if (pending.length > 0) {
        let timer: ReturnType<typeof setTimeout> | null = null
        try {
          await Promise.race([
            Promise.allSettled(pending),
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                timer = null
                shutdownController.abort()
                resolve()
              }, drainTimeoutMs)
            })
          ])
        } finally {
          if (timer) clearTimeout(timer)
        }
      }

      state = 'stopped'
      dispose()
      return {
        ok: true,
        pid,
        drainedRequests
      }
    })()

    return shutdownPromise
  }

  const handleTaskRequest = (
    request: Extract<SearchKernelRequest, { op: 'kernel.task' }>
  ): void => {
    if (state === 'draining' || state === 'stopped') {
      postErrorResponse(request.requestId, 'kernel.task', {
        code: SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
        message: 'Search kernel is shutting down and cannot accept new tasks',
        retryable: true
      })
      return
    }

    const handler = handlers.get(request.taskType)
    if (!handler) {
      postErrorResponse(request.requestId, 'kernel.task', {
        code: SEARCH_KERNEL_ERROR_CODES.UNKNOWN_TASK,
        message: `Unknown search kernel task: ${request.taskType.slice(0, 64)}`,
        retryable: false
      })
      return
    }

    let finished = false
    const taskPromise = (async () => {
      try {
        const result = await handler(request.payload, {
          requestId: request.requestId,
          taskType: request.taskType,
          signal: shutdownController.signal
        })
        safePost({
          kind: 'response',
          protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
          requestId: request.requestId,
          op: 'kernel.task',
          ok: true,
          result
        })
      } catch (error) {
        postErrorResponse(
          request.requestId,
          'kernel.task',
          serializeSearchKernelError(error, SEARCH_KERNEL_ERROR_CODES.TASK_FAILED, false)
        )
      } finally {
        finished = true
        activeTasks.delete(request.requestId)
      }
    })()

    if (!finished) {
      activeTasks.set(request.requestId, taskPromise)
    }
  }

  const handleRequest = (request: SearchKernelRequest): void => {
    switch (request.op) {
      case 'kernel.ping': {
        const result: SearchKernelPingResult = {
          ok: true,
          pid,
          uptimeMs: Math.max(0, now() - startedAt),
          version: SEARCH_KERNEL_PROTOCOL_VERSION
        }
        safePost({
          kind: 'response',
          protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
          requestId: request.requestId,
          op: 'kernel.ping',
          ok: true,
          result
        })
        return
      }
      case 'kernel.memory': {
        safePost({
          kind: 'response',
          protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
          requestId: request.requestId,
          op: 'kernel.memory',
          ok: true,
          result: captureMemory()
        })
        return
      }
      case 'kernel.health': {
        const result: SearchKernelHealthResult = {
          ok: true,
          state,
          pid,
          uptimeMs: Math.max(0, now() - startedAt),
          memory: captureMemory(),
          capabilities: getCapabilities(),
          activeRequests: activeTasks.size
        }
        safePost({
          kind: 'response',
          protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
          requestId: request.requestId,
          op: 'kernel.health',
          ok: true,
          result
        })
        return
      }
      case 'kernel.task': {
        handleTaskRequest(request)
        return
      }
      case 'kernel.shutdown': {
        void performShutdown(request.reason)
          .then((result) => {
            safePost({
              kind: 'response',
              protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
              requestId: request.requestId,
              op: 'kernel.shutdown',
              ok: true,
              result
            })
            // Exit only after the shutdown ack has been queued on parentPort.
            scheduleExit(() => exitProcess(0))
          })
          .catch((error) => {
            postErrorResponse(
              request.requestId,
              'kernel.shutdown',
              serializeSearchKernelError(error, SEARCH_KERNEL_ERROR_CODES.TASK_FAILED, false)
            )
            scheduleExit(() => exitProcess(1))
          })
      }
    }
  }

  const handleMessage = (event: { data: unknown }): void => {
    try {
      const data = event?.data
      if (!isSearchKernelRequest(data)) {
        handleMalformedMessage(data)
        return
      }
      handleRequest(data)
    } catch (error) {
      postErrorEvent(
        serializeSearchKernelError(error, SEARCH_KERNEL_ERROR_CODES.INVALID_MESSAGE, false)
      )
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    port.off('message', handleMessage)
  }

  port.on('message', handleMessage)

  safePost({
    kind: 'event',
    protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
    event: 'kernel.ready',
    pid,
    version: SEARCH_KERNEL_PROTOCOL_VERSION,
    capabilities: getCapabilities(),
    startedAt
  })

  return {
    registerTask<TPayload = unknown, TResult = unknown>(
      taskType: string,
      handler: SearchKernelTaskHandler<TPayload, TResult>
    ): void {
      if (!taskType) {
        throw new Error('Search kernel taskType must be a non-empty string')
      }
      handlers.set(taskType, handler as SearchKernelTaskHandler)
    },
    unregisterTask(taskType: string): boolean {
      return handlers.delete(taskType)
    },
    getCapabilities,
    getState: () => state,
    getActiveRequestCount: () => activeTasks.size,
    dispose
  }
}

function bootstrapUtilityProcess(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return
  }
  const parentPort = (
    process as NodeJS.Process & {
      parentPort?: SearchKernelParentPort
    }
  ).parentPort
  if (!parentPort) {
    return
  }
  createSearchKernelRuntime({ port: parentPort })
}

bootstrapUtilityProcess()
