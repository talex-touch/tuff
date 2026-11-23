import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as electron from 'electron'
import type { ForkOptions } from 'electron'
import { createLogger } from '../../../../utils/logger'
import {
  SEARCH_KERNEL_ENTRY_FILENAME,
  SEARCH_KERNEL_ERROR_CODES,
  SEARCH_KERNEL_PROTOCOL_VERSION,
  SEARCH_KERNEL_SERVICE_NAME,
  isSearchKernelEvent,
  isSearchKernelResponse,
  type SearchKernelEvent,
  type SearchKernelHealthResult,
  type SearchKernelLifecycleState,
  type SearchKernelMemorySnapshot,
  type SearchKernelOperation,
  type SearchKernelPingResult,
  type SearchKernelRequest,
  type SearchKernelShutdownResult
} from './search-kernel-protocol'

export const SEARCH_KERNEL_UTILITY_PROCESS_ENV = 'TUFF_SEARCH_KERNEL_UTILITY_PROCESS'

const DEFAULT_READY_TIMEOUT_MS = 15_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000
const DEFAULT_MAX_RESTARTS_IN_WINDOW = 3
const DEFAULT_RESTART_WINDOW_MS = 60_000
const DEFAULT_RESTART_BASE_DELAY_MS = 250
const DEFAULT_RESTART_MAX_DELAY_MS = 5_000

const kernelLog = createLogger('SearchEngine').child('KernelClient')

export function isSearchKernelUtilityProcessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SEARCH_KERNEL_UTILITY_PROCESS_ENV]?.trim() === '1'
}

export interface SearchKernelEntryResolveOptions {
  dirname?: string
  resourcesPath?: string
  cwd?: string
  exists?: (candidate: string) => boolean
}

export function resolveSearchKernelEntryPath(
  options: SearchKernelEntryResolveOptions = {}
): string {
  const dirname = options.dirname ?? __dirname
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const cwd = options.cwd ?? process.cwd()
  const exists = options.exists ?? existsSync

  const candidates = new Set<string>([path.join(dirname, SEARCH_KERNEL_ENTRY_FILENAME)])
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    candidates.add(
      path.join(resourcesPath, 'app.asar.unpacked', 'out', 'main', SEARCH_KERNEL_ENTRY_FILENAME)
    )
    candidates.add(
      path.join(resourcesPath, 'app.asar', 'out', 'main', SEARCH_KERNEL_ENTRY_FILENAME)
    )
    candidates.add(path.join(resourcesPath, 'out', 'main', SEARCH_KERNEL_ENTRY_FILENAME))
  }
  candidates.add(path.resolve(cwd, 'out', 'main', SEARCH_KERNEL_ENTRY_FILENAME))

  const all = Array.from(candidates)
  const found = all.find((candidate) => exists(candidate))
  if (!found) {
    throw new SearchKernelClientError(
      SEARCH_KERNEL_ERROR_CODES.EXITED,
      `Search kernel entry not found: ${all.join(', ')}`,
      false
    )
  }
  return found
}

export class SearchKernelClientError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = 'SearchKernelClientError'
    this.code = code
    this.retryable = retryable
  }
}

export interface SearchKernelStreamLike {
  on(event: 'data', listener: (chunk: unknown) => void): unknown
}

/**
 * Minimal subset of Electron's `UtilityProcess` consumed by `SearchKernelClient`.
 * Keeps production typing aligned with Electron while letting unit tests inject fast fakes.
 */
export interface SearchKernelChildProcess {
  readonly pid: number | undefined
  readonly stdout: SearchKernelStreamLike | null
  readonly stderr: SearchKernelStreamLike | null
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  on(event: 'error', listener: (...args: unknown[]) => void): unknown
  on(event: 'spawn', listener: () => void): unknown
  off(event: 'message', listener: (message: unknown) => void): unknown
  off(event: 'exit', listener: (code: number) => void): unknown
  off(event: 'error', listener: (...args: unknown[]) => void): unknown
  off(event: 'spawn', listener: () => void): unknown
  postMessage(message: unknown): void
  kill(): boolean
}

export type SearchKernelForkFn = (
  entryPath: string,
  args: string[],
  options: ForkOptions
) => SearchKernelChildProcess

export type SearchKernelTimerHandle = ReturnType<typeof setTimeout>

export interface SearchKernelClientOptions {
  fork?: SearchKernelForkFn
  resolveEntryPath?: () => string
  registerBeforeQuit?: (listener: () => void) => () => void
  now?: () => number
  setTimeout?: (callback: () => void, ms: number) => SearchKernelTimerHandle
  clearTimeout?: (handle: SearchKernelTimerHandle) => void
  createRequestId?: () => string
  cwd?: string
  readyTimeoutMs?: number
  defaultRequestTimeoutMs?: number
  shutdownTimeoutMs?: number
  maxRestartsInWindow?: number
  restartWindowMs?: number
  restartBaseDelayMs?: number
  restartMaxDelayMs?: number
  autoRestart?: boolean
  beforeStart?: () => Promise<void>
  onEvent?: (event: SearchKernelEvent) => void
  onStateChange?: (state: SearchKernelLifecycleState, previous: SearchKernelLifecycleState) => void
}

export interface SearchKernelRequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SearchKernelShutdownOptions {
  reason?: string
  timeoutMs?: number
}

interface PendingRequestEntry {
  op: SearchKernelOperation
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: SearchKernelTimerHandle
  cleanupAbort: () => void
}

function defaultFork(
  entryPath: string,
  args: string[],
  options: ForkOptions
): SearchKernelChildProcess {
  const { app, utilityProcess } = electron
  if (!app || !utilityProcess) {
    throw new SearchKernelClientError(
      SEARCH_KERNEL_ERROR_CODES.EXITED,
      'Electron utilityProcess is unavailable in the current runtime',
      false
    )
  }
  if (!app.isReady()) {
    throw new SearchKernelClientError(
      SEARCH_KERNEL_ERROR_CODES.NOT_READY,
      'Search kernel utility process can only start after Electron app ready',
      true
    )
  }
  const cwd = options.cwd ?? app.getPath('userData')
  return utilityProcess.fork(entryPath, args, {
    ...options,
    cwd
  }) as unknown as SearchKernelChildProcess
}

function defaultRegisterBeforeQuit(listener: () => void): () => void {
  const { app } = electron
  if (!app || typeof app.on !== 'function' || typeof app.off !== 'function') {
    return () => {}
  }
  app.on('before-quit', listener)
  return () => {
    app.off('before-quit', listener)
  }
}

function normalizePositiveMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

/**
 * Main-process lifecycle & RPC host for the same-bundle Search & Index Kernel `utilityProcess`.
 */
export class SearchKernelClient {
  private readonly forkProcess: SearchKernelForkFn
  private readonly resolveEntry: () => string
  private readonly registerBeforeQuit: (listener: () => void) => () => void
  private readonly now: () => number
  private readonly scheduleTimer: (callback: () => void, ms: number) => SearchKernelTimerHandle
  private readonly cancelTimer: (handle: SearchKernelTimerHandle) => void
  private readonly createRequestId: () => string
  private readonly cwd?: string
  private readonly readyTimeoutMs: number
  private readonly defaultRequestTimeoutMs: number
  private readonly shutdownTimeoutMs: number
  private readonly maxRestartsInWindow: number
  private readonly restartWindowMs: number
  private readonly restartBaseDelayMs: number
  private readonly restartMaxDelayMs: number
  private readonly autoRestart: boolean
  private readonly beforeStart?: () => Promise<void>
  private readonly onEvent?: (event: SearchKernelEvent) => void
  private readonly onStateChange?: (
    state: SearchKernelLifecycleState,
    previous: SearchKernelLifecycleState
  ) => void

  private state: SearchKernelLifecycleState = 'idle'
  private child: SearchKernelChildProcess | null = null
  private childPid: number | null = null
  private spawnGeneration = 0
  private capabilities: string[] = []
  private startPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private readyTimer: SearchKernelTimerHandle | null = null
  private shutdownPromise: Promise<SearchKernelShutdownResult | null> | null = null
  private shuttingDown = false
  private disposed = false

  private detachChildListeners: (() => void) | null = null
  private unregisterBeforeQuit: (() => void) | null = null

  private readonly pendingRequests = new Map<string, PendingRequestEntry>()
  private readonly exitWaiters = new Set<() => void>()

  private restartTimestamps: number[] = []
  private restartTimer: SearchKernelTimerHandle | null = null
  private nextRestartAt: number | null = null

  constructor(options: SearchKernelClientOptions = {}) {
    this.forkProcess = options.fork ?? defaultFork
    this.resolveEntry = options.resolveEntryPath ?? (() => resolveSearchKernelEntryPath())
    this.registerBeforeQuit = options.registerBeforeQuit ?? defaultRegisterBeforeQuit
    this.now = options.now ?? (() => Date.now())
    this.scheduleTimer = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms))
    this.cancelTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle))
    this.createRequestId = options.createRequestId ?? (() => randomUUID())
    this.cwd = options.cwd
    this.readyTimeoutMs = normalizePositiveMs(options.readyTimeoutMs, DEFAULT_READY_TIMEOUT_MS)
    this.defaultRequestTimeoutMs = normalizePositiveMs(
      options.defaultRequestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS
    )
    this.shutdownTimeoutMs = normalizePositiveMs(
      options.shutdownTimeoutMs,
      DEFAULT_SHUTDOWN_TIMEOUT_MS
    )
    this.maxRestartsInWindow = normalizeNonNegativeInt(
      options.maxRestartsInWindow,
      DEFAULT_MAX_RESTARTS_IN_WINDOW
    )
    this.restartWindowMs = normalizePositiveMs(options.restartWindowMs, DEFAULT_RESTART_WINDOW_MS)
    this.restartBaseDelayMs = normalizePositiveMs(
      options.restartBaseDelayMs,
      DEFAULT_RESTART_BASE_DELAY_MS
    )
    this.restartMaxDelayMs = normalizePositiveMs(
      options.restartMaxDelayMs,
      DEFAULT_RESTART_MAX_DELAY_MS
    )
    this.autoRestart = options.autoRestart ?? true
    this.beforeStart = options.beforeStart
    this.onEvent = options.onEvent
    this.onStateChange = options.onStateChange
  }

  getState(): SearchKernelLifecycleState {
    return this.state
  }

  getPid(): number | null {
    return this.childPid
  }

  getSpawnGeneration(): number {
    return this.spawnGeneration
  }

  getCapabilities(): string[] {
    return [...this.capabilities]
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size
  }

  isDegraded(): boolean {
    return this.state === 'degraded'
  }

  getRestartStats(): {
    restartsInWindow: number
    maxRestartsInWindow: number
    degraded: boolean
    nextRestartAt: number | null
  } {
    this.pruneRestartWindow(this.now())
    return {
      restartsInWindow: this.restartTimestamps.length,
      maxRestartsInWindow: this.maxRestartsInWindow,
      degraded: this.state === 'degraded',
      nextRestartAt: this.nextRestartAt
    }
  }

  resetDegradedState(): void {
    this.clearRestartTimer()
    this.restartTimestamps = []
    if (this.state === 'degraded') {
      this.setState('idle')
    }
  }

  async ensureStarted(): Promise<void> {
    if (this.disposed) {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
        'Search kernel client has been disposed',
        false
      )
    }
    if (this.state === 'degraded') {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.DEGRADED,
        'Search kernel entered degraded state after repeated crashes',
        false
      )
    }
    if (this.state === 'ready' && this.child) {
      return
    }
    if (this.startPromise) {
      return this.startPromise
    }

    this.clearRestartTimer()
    this.shuttingDown = false

    const startPromise = this.beforeStart
      ? (async () => {
          await this.beforeStart!()
          if (this.disposed || this.shuttingDown) {
            throw new SearchKernelClientError(
              SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
              'Search kernel client was shut down before start',
              false
            )
          }
          if (this.state === 'degraded') {
            throw new SearchKernelClientError(
              SEARCH_KERNEL_ERROR_CODES.DEGRADED,
              'Search kernel entered degraded state after repeated crashes',
              false
            )
          }
          await this.spawnChild()
        })()
      : this.spawnChild()
    this.startPromise = startPromise
    try {
      await startPromise
    } finally {
      if (this.startPromise === startPromise) {
        this.startPromise = null
      }
    }
  }

  async ping(options?: SearchKernelRequestOptions): Promise<SearchKernelPingResult> {
    return (await this.sendRequest(
      'kernel.ping',
      (requestId) => ({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId,
        op: 'kernel.ping'
      }),
      options
    )) as SearchKernelPingResult
  }

  async health(options?: SearchKernelRequestOptions): Promise<SearchKernelHealthResult> {
    return (await this.sendRequest(
      'kernel.health',
      (requestId) => ({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId,
        op: 'kernel.health'
      }),
      options
    )) as SearchKernelHealthResult
  }

  async memory(options?: SearchKernelRequestOptions): Promise<SearchKernelMemorySnapshot> {
    return (await this.sendRequest(
      'kernel.memory',
      (requestId) => ({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId,
        op: 'kernel.memory'
      }),
      options
    )) as SearchKernelMemorySnapshot
  }

  async invokeTask<TResult = unknown, TPayload = unknown>(
    taskType: string,
    payload?: TPayload,
    options?: SearchKernelRequestOptions
  ): Promise<TResult> {
    if (!taskType || typeof taskType !== 'string') {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.INVALID_MESSAGE,
        'Search kernel taskType must be a non-empty string',
        false
      )
    }
    return (await this.sendRequest(
      'kernel.task',
      (requestId) => ({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId,
        op: 'kernel.task',
        taskType,
        ...(payload !== undefined ? { payload } : {})
      }),
      options
    )) as TResult
  }

  async shutdown(
    options: SearchKernelShutdownOptions = {}
  ): Promise<SearchKernelShutdownResult | null> {
    if (this.shutdownPromise) {
      return this.shutdownPromise
    }

    const timeoutMs = normalizePositiveMs(options.timeoutMs, this.shutdownTimeoutMs)
    this.shuttingDown = true
    this.clearRestartTimer()
    this.clearReadyTimer()

    if (this.readyReject) {
      const rejectStart = this.readyReject
      this.readyResolve = null
      this.readyReject = null
      rejectStart(
        new SearchKernelClientError(
          SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
          'Search kernel shutdown requested before readiness',
          false
        )
      )
    }

    const child = this.child
    if (!child) {
      this.rejectAllPending(
        new SearchKernelClientError(
          SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
          'Search kernel stopped',
          false
        )
      )
      this.disarmBeforeQuitHook()
      if (this.state !== 'degraded') {
        this.setState('stopped')
      }
      return null
    }

    this.setState('draining')

    const runShutdown = (async (): Promise<SearchKernelShutdownResult | null> => {
      let ack: SearchKernelShutdownResult | null = null
      let exited = false
      let onExit: (() => void) | null = null
      const exitPromise = new Promise<void>((resolve) => {
        onExit = (): void => {
          exited = true
          if (onExit) {
            this.exitWaiters.delete(onExit)
          }
          resolve()
        }
        this.exitWaiters.add(onExit)
      })

      let killTimer: SearchKernelTimerHandle | null = null
      const deadlinePromise = new Promise<'timeout'>((resolve) => {
        killTimer = this.scheduleTimer(() => {
          killTimer = null
          resolve('timeout')
        }, timeoutMs)
      })

      const shutdownRequest = this.postRawRequest(
        child,
        'kernel.shutdown',
        (requestId) => ({
          kind: 'request',
          protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
          requestId,
          op: 'kernel.shutdown',
          ...(options.reason !== undefined ? { reason: options.reason } : {})
        }),
        { timeoutMs }
      )
        .then((result) => {
          ack = result as SearchKernelShutdownResult
          return 'acked' as const
        })
        .catch(() => 'failed' as const)

      try {
        const outcome = await Promise.race([
          Promise.all([shutdownRequest, exitPromise]).then(() => 'exited' as const),
          deadlinePromise
        ])

        if (outcome === 'timeout' && !exited && this.child === child) {
          try {
            child.kill()
          } catch {
            // The child may already have terminated.
          }
          this.cleanupChildState(child)
        }
      } finally {
        if (onExit) {
          this.exitWaiters.delete(onExit)
        }
        if (killTimer) {
          this.cancelTimer(killTimer)
        }
      }

      this.rejectAllPending(
        new SearchKernelClientError(
          SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN,
          'Search kernel shut down',
          false
        )
      )
      this.disarmBeforeQuitHook()
      this.setState('stopped')
      return ack
    })()

    this.shutdownPromise = runShutdown
    try {
      return await runShutdown
    } finally {
      if (this.shutdownPromise === runShutdown) {
        this.shutdownPromise = null
      }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.shutdown({ reason: 'dispose' })
    this.disarmBeforeQuitHook()
  }

  private setState(next: SearchKernelLifecycleState): void {
    if (this.state === next) return
    const previous = this.state
    this.state = next
    this.onStateChange?.(next, previous)
  }

  private armBeforeQuitHook(): void {
    if (this.unregisterBeforeQuit) return
    this.unregisterBeforeQuit = this.registerBeforeQuit(() => {
      void this.shutdown({ reason: 'app-before-quit' })
    })
  }

  private disarmBeforeQuitHook(): void {
    if (!this.unregisterBeforeQuit) return
    const unregister = this.unregisterBeforeQuit
    this.unregisterBeforeQuit = null
    unregister()
  }

  private clearReadyTimer(): void {
    if (!this.readyTimer) return
    this.cancelTimer(this.readyTimer)
    this.readyTimer = null
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      this.cancelTimer(this.restartTimer)
      this.restartTimer = null
    }
    this.nextRestartAt = null
  }

  private pruneRestartWindow(currentTime: number): void {
    const cutoff = currentTime - this.restartWindowMs
    this.restartTimestamps = this.restartTimestamps.filter((ts) => ts > cutoff)
  }

  private spawnChild(): Promise<void> {
    const entryPath = this.resolveEntry()
    this.setState('starting')
    this.armBeforeQuitHook()

    const forkOptions: ForkOptions = {
      serviceName: SEARCH_KERNEL_SERVICE_NAME,
      stdio: 'pipe',
      ...(this.cwd !== undefined ? { cwd: this.cwd } : {})
    }

    let child: SearchKernelChildProcess
    try {
      child = this.forkProcess(entryPath, [], forkOptions)
    } catch (error) {
      this.setState('stopped')
      const wrapped =
        error instanceof SearchKernelClientError
          ? error
          : new SearchKernelClientError(
              SEARCH_KERNEL_ERROR_CODES.EXITED,
              error instanceof Error ? error.message : String(error),
              true
            )
      return Promise.reject(wrapped)
    }

    this.spawnGeneration += 1
    this.child = child
    this.childPid = typeof child.pid === 'number' ? child.pid : null

    // Drain piped streams so an unconsumed pipe never blocks the utility process.
    child.stdout?.on('data', () => {})
    child.stderr?.on('data', () => {})

    const handleMessage = (message: unknown): void => {
      if (this.child !== child) return
      this.handleChildMessage(child, message)
    }

    const handleSpawn = (): void => {
      if (this.child !== child) return
      if (typeof child.pid === 'number') {
        this.childPid = child.pid
      }
      kernelLog.info('Search kernel utility process spawned', {
        meta: { pid: this.childPid ?? -1 }
      })
    }

    const handleError = (...args: unknown[]): void => {
      if (this.child !== child) return
      const detail = args.find((value): value is string => typeof value === 'string')
      kernelLog.error('Search kernel utility process reported fatal error', {
        meta: { detail: detail ?? 'unknown' }
      })
    }

    const handleExit = (code: number): void => {
      this.handleChildExit(child, code)
    }

    child.on('message', handleMessage)
    child.on('spawn', handleSpawn)
    child.on('error', handleError)
    child.on('exit', handleExit)

    this.detachChildListeners = () => {
      child.off('message', handleMessage)
      child.off('spawn', handleSpawn)
      child.off('error', handleError)
      child.off('exit', handleExit)
    }

    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject

      this.readyTimer = this.scheduleTimer(() => {
        this.readyTimer = null
        if (this.child !== child) return
        const timeoutError = new SearchKernelClientError(
          SEARCH_KERNEL_ERROR_CODES.TIMEOUT,
          `Search kernel did not become ready within ${this.readyTimeoutMs}ms`,
          true
        )
        const pendingReject = this.readyReject
        this.readyResolve = null
        this.readyReject = null
        try {
          child.kill()
        } catch {
          // Child may already be dead.
        }
        this.cleanupChildState(child)
        this.setState('stopped')
        pendingReject?.(timeoutError)
      }, this.readyTimeoutMs)
    })
  }

  private handleChildMessage(child: SearchKernelChildProcess, message: unknown): void {
    if (isSearchKernelEvent(message)) {
      if (message.event === 'kernel.ready') {
        this.childPid = message.pid
        this.capabilities = [...message.capabilities]
        this.clearReadyTimer()
        if (this.child === child && !this.shuttingDown) {
          this.setState('ready')
        }
        const resolveStart = this.readyResolve
        this.readyResolve = null
        this.readyReject = null
        resolveStart?.()
      } else if (message.event === 'kernel.draining') {
        if (this.child === child && this.state !== 'stopped') {
          this.setState('draining')
        }
      } else if (message.event === 'kernel.error') {
        kernelLog.warn('Search kernel emitted error event', {
          meta: { code: message.error.code, message: message.error.message }
        })
      }
      this.onEvent?.(message)
      return
    }

    if (!isSearchKernelResponse(message)) {
      return
    }

    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) return

    this.pendingRequests.delete(message.requestId)
    this.cancelTimer(pending.timer)
    pending.cleanupAbort()

    if (!message.ok) {
      pending.reject(
        new SearchKernelClientError(
          message.error.code,
          message.error.message,
          message.error.retryable
        )
      )
      return
    }

    if (message.op !== pending.op) {
      pending.reject(
        new SearchKernelClientError(
          SEARCH_KERNEL_ERROR_CODES.INVALID_RESPONSE,
          `Search kernel response op mismatch: expected ${pending.op}, got ${message.op}`,
          false
        )
      )
      return
    }

    pending.resolve(message.result)
  }

  private handleChildExit(child: SearchKernelChildProcess, code: number): void {
    const isCurrentChild = this.child === child
    if (!isCurrentChild) return

    const wasShuttingDown = this.shuttingDown
    this.cleanupChildState(child)

    const exitError = new SearchKernelClientError(
      SEARCH_KERNEL_ERROR_CODES.EXITED,
      `Search kernel utility process exited with code ${String(code)}`,
      !wasShuttingDown
    )

    if (this.readyReject) {
      const rejectStart = this.readyReject
      this.readyResolve = null
      this.readyReject = null
      rejectStart(exitError)
    }

    this.rejectAllPending(exitError)

    for (const waiter of Array.from(this.exitWaiters)) {
      waiter()
    }

    if (wasShuttingDown || this.disposed) {
      this.setState('stopped')
      return
    }

    kernelLog.error('Search kernel utility process exited unexpectedly', {
      meta: { code }
    })
    this.handleUnexpectedCrash()
  }

  private handleUnexpectedCrash(): void {
    const currentTime = this.now()
    this.pruneRestartWindow(currentTime)

    if (this.restartTimestamps.length >= this.maxRestartsInWindow) {
      this.clearRestartTimer()
      this.setState('degraded')
      kernelLog.error('Search kernel entered degraded state after exceeding crash budget', {
        meta: {
          restartsInWindow: this.restartTimestamps.length,
          windowMs: this.restartWindowMs
        }
      })
      return
    }

    const attemptIndex = this.restartTimestamps.length
    this.restartTimestamps.push(currentTime)
    this.setState('stopped')

    if (!this.autoRestart) {
      return
    }

    const delayMs = Math.min(this.restartMaxDelayMs, this.restartBaseDelayMs * 2 ** attemptIndex)
    this.nextRestartAt = currentTime + delayMs
    this.restartTimer = this.scheduleTimer(() => {
      this.restartTimer = null
      this.nextRestartAt = null
      if (this.shuttingDown || this.disposed || this.state === 'degraded') return
      void this.ensureStarted().catch(() => {
        if (
          !this.shuttingDown &&
          !this.disposed &&
          this.state !== 'degraded' &&
          !this.restartTimer
        ) {
          this.handleUnexpectedCrash()
        }
      })
    }, delayMs)
    this.restartTimer.unref?.()
  }

  private cleanupChildState(child: SearchKernelChildProcess): void {
    this.clearReadyTimer()
    if (this.detachChildListeners) {
      const detach = this.detachChildListeners
      this.detachChildListeners = null
      detach()
    }
    if (this.child === child) {
      this.child = null
      this.childPid = null
      this.capabilities = []
    }
  }

  private rejectAllPending(error: Error): void {
    const entries = Array.from(this.pendingRequests.values())
    this.pendingRequests.clear()
    for (const entry of entries) {
      this.cancelTimer(entry.timer)
      entry.cleanupAbort()
      entry.reject(error)
    }
  }

  private async sendRequest(
    op: SearchKernelOperation,
    buildRequest: (requestId: string) => SearchKernelRequest,
    options?: SearchKernelRequestOptions
  ): Promise<unknown> {
    if (options?.signal?.aborted) {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.ABORTED,
        `Search kernel ${op} request was aborted before start`,
        false
      )
    }

    await this.ensureStarted()

    if (options?.signal?.aborted) {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.ABORTED,
        `Search kernel ${op} request was aborted`,
        false
      )
    }

    const child = this.child
    if (!child || this.state !== 'ready') {
      throw new SearchKernelClientError(
        SEARCH_KERNEL_ERROR_CODES.NOT_READY,
        'Search kernel is not ready',
        true
      )
    }

    return await this.postRawRequest(child, op, buildRequest, options)
  }

  private postRawRequest(
    child: SearchKernelChildProcess,
    op: SearchKernelOperation,
    buildRequest: (requestId: string) => SearchKernelRequest,
    options?: SearchKernelRequestOptions
  ): Promise<unknown> {
    const timeoutMs = normalizePositiveMs(options?.timeoutMs, this.defaultRequestTimeoutMs)
    const signal = options?.signal
    const requestId = this.createRequestId()
    const request = buildRequest(requestId)

    return new Promise<unknown>((resolve, reject) => {
      const cleanup = (): void => {
        const entry = this.pendingRequests.get(requestId)
        if (!entry) return
        this.pendingRequests.delete(requestId)
        this.cancelTimer(entry.timer)
        entry.cleanupAbort()
      }

      const handleAbort = (): void => {
        if (!this.pendingRequests.has(requestId)) return
        cleanup()
        reject(
          new SearchKernelClientError(
            SEARCH_KERNEL_ERROR_CODES.ABORTED,
            `Search kernel ${op} request was aborted`,
            false
          )
        )
      }

      let cleanupAbort = (): void => {}
      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true })
        cleanupAbort = () => {
          signal.removeEventListener('abort', handleAbort)
        }
      }

      const timer = this.scheduleTimer(() => {
        if (!this.pendingRequests.has(requestId)) return
        cleanup()
        reject(
          new SearchKernelClientError(
            SEARCH_KERNEL_ERROR_CODES.TIMEOUT,
            `Search kernel ${op} request timed out after ${timeoutMs}ms`,
            true
          )
        )
      }, timeoutMs)

      this.pendingRequests.set(requestId, {
        op,
        resolve,
        reject,
        timer,
        cleanupAbort
      })

      try {
        child.postMessage(request)
      } catch (error) {
        cleanup()
        reject(
          new SearchKernelClientError(
            SEARCH_KERNEL_ERROR_CODES.EXITED,
            error instanceof Error ? error.message : String(error),
            true
          )
        )
      }
    })
  }
}

let sharedSearchKernelClient: SearchKernelClient | null = null
let sharedSearchKernelDisposal: Promise<void> | null = null
let sharedSearchKernelDisposalSeq = 0

/**
 * Returns the process-wide shared `SearchKernelClient` so `SearchIndexWorkerClient` and all
 * `SearchIndexReadWorkerClient` lanes share a single `utilityProcess` when enabled.
 *
 * If a previous shared client is still disposing, the replacement client serializes its
 * startup behind that disposal so two kernels never open the same SQLite file concurrently.
 */
export function getSharedSearchKernelClient(
  options?: SearchKernelClientOptions
): SearchKernelClient {
  if (!sharedSearchKernelClient) {
    const pendingDisposal = sharedSearchKernelDisposal
    const clientOptions: SearchKernelClientOptions | undefined = pendingDisposal
      ? {
          ...options,
          beforeStart: async () => {
            await pendingDisposal
            await options?.beforeStart?.()
          }
        }
      : options
    sharedSearchKernelClient = new SearchKernelClient(clientOptions)
  }
  return sharedSearchKernelClient
}

/**
 * Clears and disposes the process-wide shared `SearchKernelClient` (used in tests and teardown).
 * Concurrent resets await the same in-flight disposal before resolving.
 */
export async function resetSharedSearchKernelClient(): Promise<void> {
  const current = sharedSearchKernelClient
  const previousDisposal = sharedSearchKernelDisposal
  if (!current) {
    if (previousDisposal) {
      await previousDisposal
    }
    return
  }

  sharedSearchKernelClient = null
  const disposalId = ++sharedSearchKernelDisposalSeq
  const disposal = (async () => {
    if (previousDisposal) {
      await previousDisposal.catch(() => undefined)
    }
    await current.dispose().catch(() => undefined)
  })()
  sharedSearchKernelDisposal = disposal
  try {
    await disposal
  } finally {
    if (sharedSearchKernelDisposalSeq === disposalId) {
      sharedSearchKernelDisposal = null
    }
  }
}
