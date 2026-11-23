import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type {
  AcpConfigOption,
  AcpInitializeResult,
  AcpPromptContent,
  AcpPromptResult,
  AcpServerRequestHandler,
  AcpSessionNewResult,
  AcpSessionUpdateNotification,
  AcpUsageUpdate,
  OmpAcpSpawnOptions,
  OmpPromptStreamOptions,
  OmpSessionCreateOptions,
  OmpStreamEvent,
  OmpStreamToolCall,
} from './types'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import readline from 'node:readline'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

const DEFAULT_INIT_TIMEOUT_MS = 15_000
const SIGTERM_GRACE_MS = 150
const SIGKILL_GRACE_MS = 750
const MAX_STDERR_TAIL_CHARS = 4_096

function readNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return undefined
}

function extractToolCall(update: Record<string, unknown>): OmpStreamToolCall | null {
  const toolCallId = readNonEmptyString(update.toolCallId, update.callId, update.id)
  if (!toolCallId)
    return null
  const toolName
    = readNonEmptyString(update.toolName, update.name, update.title, update.kind) ?? 'tool'
  const status = readNonEmptyString(update.status)
  const args
    = update.rawInput !== undefined
      ? update.rawInput
      : update.input !== undefined
        ? update.input
        : update.args
  const result
    = update.rawOutput !== undefined
      ? update.rawOutput
      : update.result !== undefined
        ? update.result
        : update.content
  const isError = update.isError === true || status === 'failed' || status === 'error'
  return {
    toolCallId,
    toolName,
    ...(args !== undefined ? { args } : {}),
    ...(status ? { status } : {}),
    ...(result !== undefined ? { result } : {}),
    isError,
  }
}

export class OmpAcpSession {
  private _currentModel?: string

  get currentModel(): string | undefined {
    return this._currentModel
  }

  constructor(
    readonly sessionId: string,
    private readonly client: OmpAcpClient,
    public configOptions: AcpConfigOption[] = [],
  ) {}

  async setModel(model: string): Promise<void> {
    await this.client.sendRequest('session/set_config_option', {
      sessionId: this.sessionId,
      configId: 'model',
      value: model,
    })
    this._currentModel = model
  }

  async setConfig(configId: string, value: string | boolean): Promise<void> {
    await this.client.sendRequest('session/set_config_option', {
      sessionId: this.sessionId,
      configId,
      value,
    })
  }

  async prompt(
    content: string | AcpPromptContent[],
    onEvent?: (event: OmpStreamEvent) => void,
    options?: OmpPromptStreamOptions,
  ): Promise<{ output: string, usage?: AcpUsageUpdate }> {
    let output = ''
    let usage: AcpUsageUpdate | undefined

    for await (const event of this.promptStream(content, options)) {
      if (event.type === 'delta' && event.text) {
        output += event.text
      }
      if (event.type === 'usage' && event.usage) {
        usage = event.usage
      }
      onEvent?.(event)
    }

    return { output, usage }
  }

  async* promptStream(
    content: string | AcpPromptContent[],
    options: OmpPromptStreamOptions = {},
  ): AsyncIterable<OmpStreamEvent> {
    const signal = options.signal
    if (signal?.aborted)
      return

    const formattedPrompt: AcpPromptContent[]
      = typeof content === 'string' ? [{ type: 'text', text: content }] : content

    const eventQueue: OmpStreamEvent[] = []
    let resolver: (() => void) | null = null
    const state = { finished: false, aborted: false }
    let failure: Error | null = null

    const wake = (): void => {
      const next = resolver
      resolver = null
      next?.()
    }

    const pushEvent = (event: OmpStreamEvent): void => {
      if (state.aborted)
        return
      eventQueue.push(event)
      wake()
    }

    const onAbort = (): void => {
      if (state.aborted)
        return
      state.aborted = true
      state.finished = true
      void this.cancel().catch(() => undefined)
      wake()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const unsubscribe = this.client.onSessionUpdate(this.sessionId, (notification) => {
      const update = notification.update
      const updateType = update.sessionUpdate

      if (updateType === 'agent_thought_chunk' && update.content?.text) {
        pushEvent({
          type: 'thinking',
          text: update.content.text,
          raw: update,
        })
      }
      else if (updateType === 'agent_message_chunk' && update.content?.text) {
        pushEvent({
          type: 'delta',
          text: update.content.text,
          raw: update,
        })
      }
      else if (updateType === 'usage_update' && update.usage) {
        pushEvent({
          type: 'usage',
          usage: update.usage,
          raw: update,
        })
      }
      else if (updateType === 'config_option_update' && update.configOptions) {
        this.configOptions = update.configOptions
      }
      else if (updateType === 'tool_call') {
        const toolCall = extractToolCall(update)
        pushEvent({
          type: 'tool_call',
          ...(toolCall ? { toolCall } : {}),
          raw: update,
        })
      }
      else if (updateType === 'tool_result') {
        const toolCall = extractToolCall(update)
        pushEvent({
          type: 'tool_result',
          ...(toolCall ? { toolCall } : {}),
          raw: update,
        })
      }
      else if (updateType === 'tool_call_update') {
        const toolCall = extractToolCall(update)
        if (toolCall && (toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.status === 'error')) {
          pushEvent({
            type: 'tool_result',
            toolCall,
            raw: update,
          })
        }
        else if (toolCall) {
          pushEvent({
            type: 'tool_call',
            toolCall,
            raw: update,
          })
        }
        else {
          pushEvent({
            type: 'status',
            raw: update,
          })
        }
      }
      else {
        pushEvent({
          type: 'status',
          raw: update,
        })
      }
    })

    const requestPromise = this.client
      .sendRequest<AcpPromptResult>('session/prompt', {
        sessionId: this.sessionId,
        prompt: formattedPrompt,
      })
      .then((res) => {
        if (res?.usage) {
          pushEvent({ type: 'usage', usage: res.usage, raw: res })
        }
        state.finished = true
        wake()
      })
      .catch((err) => {
        if (!state.aborted) {
          failure = err instanceof Error ? err : new Error(String(err))
        }
        state.finished = true
        wake()
      })

    try {
      while (!state.aborted && (!state.finished || eventQueue.length > 0)) {
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolver = resolve
            if (state.aborted || state.finished || eventQueue.length > 0)
              wake()
          })
        }
        while (!state.aborted && eventQueue.length > 0) {
          yield eventQueue.shift()!
        }
        if (state.finished && eventQueue.length === 0)
          break
      }

      if (state.aborted) {
        void requestPromise.catch(() => undefined)
        return
      }
      await requestPromise
      if (failure)
        throw failure
    }
    finally {
      signal?.removeEventListener('abort', onAbort)
      unsubscribe()
    }
  }

  async cancel(): Promise<void> {
    if (this.client.isClosed())
      return
    await this.client.sendRequest('session/cancel', {
      sessionId: this.sessionId,
    })
  }

  async close(): Promise<void> {
    if (this.client.isClosed())
      return
    await this.client.sendRequest('session/close', {
      sessionId: this.sessionId,
    })
  }
}

export class OmpAcpClient extends EventEmitter {
  private nextRequestId = 1
  private readonly pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void, reject: (error: Error) => void }
  >()

  private readonly sessionListeners = new Map<
    string,
    Set<(notification: AcpSessionUpdateNotification) => void>
  >()

  private rl: readline.Interface | null = null
  private requestHandler: AcpServerRequestHandler | null = null
  private closed = false
  private closePromise: Promise<void> | null = null
  private stderrBuffer = ''
  public agentInfo?: AcpInitializeResult['agentInfo']
  public capabilities?: AcpInitializeResult['agentCapabilities']

  constructor(private readonly process: ChildProcess) {
    super()
    this.setupProcess()
  }

  isClosed(): boolean {
    return this.closed
  }

  stderrTail(): string {
    return this.stderrBuffer.trim()
  }

  setRequestHandler(handler: AcpServerRequestHandler | null): void {
    this.requestHandler = handler
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private cleanupStreams(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
    try {
      this.process.stdout?.destroy()
    }
    catch {
      // ignore already destroyed stream
    }
    try {
      this.process.stderr?.destroy()
    }
    catch {
      // ignore already destroyed stream
    }
  }

  private setupProcess(): void {
    if (!this.process.stdout)
      throw new Error('Process stdout not readable')

    this.process.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      this.stderrBuffer = (this.stderrBuffer + text).slice(-MAX_STDERR_TAIL_CHARS)
    })

    const rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
    })
    this.rl = rl

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed)
        return
      try {
        const msg = JSON.parse(trimmed)
        if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
          this.handleMessage(msg as Record<string, unknown>)
        }
      }
      catch (err) {
        this.emit('protocol_error', err, trimmed)
      }
    })

    this.process.on('exit', (code, signal) => {
      const wasClosed = this.closed
      this.closed = true
      if (this.rl) {
        this.rl.close()
        this.rl = null
      }
      const stderr = this.stderrTail()
      const suffix = stderr ? `: ${stderr}` : ''
      const error = new Error(`OMP ACP process exited (code=${code}, signal=${signal})${suffix}`)
      this.rejectAllPending(error)
      this.sessionListeners.clear()
      if (!wasClosed || this.listenerCount('close') > 0) {
        this.emit('close', code, signal)
      }
    })

    this.process.on('error', (err) => {
      this.closed = true
      if (this.rl) {
        this.rl.close()
        this.rl = null
      }
      const error = err instanceof Error ? err : new Error(String(err))
      this.rejectAllPending(error)
      this.sessionListeners.clear()
      if (this.listenerCount('error') > 0) {
        this.emit('error', error)
      }
    })
  }

  private writeJsonRpcResponse(response: JsonRpcResponse): void {
    if (this.closed || !this.process.stdin || this.process.stdin.destroyed || this.process.stdin.writableEnded) {
      return
    }
    try {
      this.process.stdin.write(`${JSON.stringify(response)}\n`, 'utf8')
    }
    catch {
      // Process stdin may already be closed during teardown.
    }
  }

  private handleServerRequest(id: number | string, method: string, params: unknown): void {
    void (async () => {
      try {
        if (this.requestHandler) {
          const result = await this.requestHandler(method, params)
          this.writeJsonRpcResponse({ jsonrpc: '2.0', id, result })
          return
        }
        if (method === 'session/request_permission') {
          // Fail closed when no approval handler is wired: never leave the agent hung.
          this.writeJsonRpcResponse({
            jsonrpc: '2.0',
            id,
            result: { outcome: { outcome: 'cancelled' } },
          })
          return
        }
        this.writeJsonRpcResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        })
      }
      catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.writeJsonRpcResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message },
        })
      }
    })()
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const hasId = 'id' in msg && (typeof msg.id === 'number' || typeof msg.id === 'string')
    const hasMethod = 'method' in msg && typeof msg.method === 'string'

    // Incoming JSON-RPC request from the agent (e.g. session/request_permission).
    if (hasId && hasMethod) {
      this.handleServerRequest(msg.id as number | string, msg.method as string, msg.params)
      return
    }

    if ('id' in msg && typeof msg.id === 'number') {
      const res = msg as unknown as JsonRpcResponse
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (res.error) {
          pending.reject(new Error(res.error.message || `JSON-RPC error ${res.error.code}`))
        }
        else {
          pending.resolve(res.result)
        }
      }
      return
    }

    if (hasMethod) {
      const notif = msg as unknown as JsonRpcNotification
      if (notif.method === 'session/update' && notif.params) {
        const payload = notif.params as AcpSessionUpdateNotification
        const listeners = this.sessionListeners.get(payload.sessionId)
        if (listeners) {
          for (const listener of listeners) {
            listener(payload)
          }
        }
      }
      this.emit('notification', notif.method, notif.params)
    }
  }

  async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (this.closed)
      throw new Error('OMP ACP client is closed')
    const stdin = this.process.stdin
    if (!stdin || stdin.destroyed || stdin.writableEnded) {
      throw new Error('OMP ACP process stdin is not writable')
    }
    const id = this.nextRequestId++
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    return await new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
      const payload = `${JSON.stringify(req)}\n`
      try {
        stdin.write(payload, 'utf8', (err) => {
          if (err) {
            this.pendingRequests.delete(id)
            reject(err)
          }
        })
      }
      catch (err) {
        this.pendingRequests.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  onSessionUpdate(
    sessionId: string,
    handler: (notification: AcpSessionUpdateNotification) => void,
  ): () => void {
    let set = this.sessionListeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessionListeners.set(sessionId, set)
    }
    set.add(handler)

    return () => {
      const current = this.sessionListeners.get(sessionId)
      if (current) {
        current.delete(handler)
        if (current.size === 0) {
          this.sessionListeners.delete(sessionId)
        }
      }
    }
  }

  async initialize(
    clientInfo: { name: string, version: string } = { name: 'tuff', version: '1.0.0' },
    timeoutMs: number = DEFAULT_INIT_TIMEOUT_MS,
  ): Promise<AcpInitializeResult> {
    const request = this.sendRequest<AcpInitializeResult>('initialize', {
      clientInfo,
    })
    let timer: NodeJS.Timeout | undefined
    try {
      const result
        = timeoutMs > 0
          ? await Promise.race([
              request,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(new Error(`OMP ACP initialize timed out after ${timeoutMs}ms`))
                }, timeoutMs)
              }),
            ])
          : await request
      this.agentInfo = result.agentInfo
      this.capabilities = result.agentCapabilities
      return result
    }
    catch (error) {
      void request.catch(() => undefined)
      throw error
    }
    finally {
      if (timer)
        clearTimeout(timer)
    }
  }

  async createSession(options: OmpSessionCreateOptions = {}): Promise<OmpAcpSession> {
    const cwd = options.cwd || process.cwd()
    const result = await this.sendRequest<AcpSessionNewResult>('session/new', {
      cwd,
      mcpServers: options.mcpServers || [],
    })

    const session = new OmpAcpSession(result.sessionId, this, result.configOptions || [])
    if (options.model) {
      await session.setModel(options.model)
    }
    return session
  }

  private hasProcessExited(): boolean {
    return (
      (this.process.exitCode !== null && this.process.exitCode !== undefined)
      || (this.process.signalCode !== null && this.process.signalCode !== undefined)
    )
  }

  private waitForProcessExit(timeoutMs: number): Promise<boolean> {
    if (this.hasProcessExited())
      return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      let settled = false
      let timer: NodeJS.Timeout | undefined
      const onExit = (): void => {
        if (settled)
          return
        settled = true
        if (timer)
          clearTimeout(timer)
        this.process.removeListener('exit', onExit)
        this.process.removeListener('close', onExit)
        resolve(true)
      }
      timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        this.process.removeListener('exit', onExit)
        this.process.removeListener('close', onExit)
        resolve(this.hasProcessExited())
      }, timeoutMs)
      this.process.once('exit', onExit)
      this.process.once('close', onExit)
    })
  }

  async close(): Promise<void> {
    if (this.closePromise)
      return await this.closePromise

    this.closePromise = (async () => {
      this.closed = true
      this.rejectAllPending(new Error('OMP ACP client closed'))
      this.sessionListeners.clear()

      try {
        this.process.stdin?.end()
      }
      catch {
        // ignore
      }

      if (!this.hasProcessExited()) {
        try {
          this.process.kill('SIGTERM')
        }
        catch {
          // ignore
        }
        const exitedAfterTerm = await this.waitForProcessExit(SIGTERM_GRACE_MS)
        if (!exitedAfterTerm && !this.hasProcessExited()) {
          try {
            this.process.kill('SIGKILL')
          }
          catch {
            // ignore
          }
          const exitedAfterKill = await this.waitForProcessExit(SIGKILL_GRACE_MS)
          if (!exitedAfterKill && !this.hasProcessExited()) {
            this.process.unref?.()
          }
        }
      }

      this.cleanupStreams()
    })()

    return await this.closePromise
  }

  static async spawn(options: OmpAcpSpawnOptions = {}): Promise<OmpAcpClient> {
    const executable = options.executablePath || 'omp'
    const proc = spawn(executable, ['acp'], {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const client = new OmpAcpClient(proc)
    if (options.onRequest) {
      client.setRequestHandler(options.onRequest)
    }
    try {
      await client.initialize(undefined, options.initTimeoutMs)
      return client
    }
    catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
  }
}
