import type { ChildProcess } from 'node:child_process'
import type { ProcessLifecycleController, StderrTailCollector } from './process-utils'
import type {
  AcpClientCapabilities,
  AcpClientInfo,
  AcpConfigOption,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  AcpPromptResult,
  AcpPromptStreamOptions,
  AcpServerRequestHandler,
  AcpSessionCreateOptions,
  AcpSessionLoadParams,
  AcpSessionLoadResult,
  AcpSessionNewResult,
  AcpSessionUpdateNotification,
  AcpSpawnOptions,
  AcpUsageUpdate,
  CliPermissionDecision,
  CliPermissionHandler,
  CliPermissionRequest,
  CliRuntimeClient,
  CliRuntimeSession,
  CliRuntimeStreamEvent,
  CliRuntimeToolCall,
} from './types'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import readline from 'node:readline'
import {
  asRecord,
  attachProcessLifecycle,
  attachSafeStdinErrorGuard,
  buildSpawnEnv,
  createStderrTailCollector,
  DEFAULT_INIT_TIMEOUT_MS,
  formatProcessExitError,
  inferPermissionRiskHint,
  readNonEmptyString,
  readRawNonEmptyString,
  terminateChildProcess,
  tryWriteJsonLine,
  withTimeout,
  writeJsonLine,
} from './process-utils'

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

export const DEFAULT_ACP_PROTOCOL_VERSION = 1

export const DEFAULT_ACP_CLIENT_INFO: AcpClientInfo = {
  name: 'tuff',
  version: '1.0.0',
}

export const DEFAULT_ACP_CLIENT_CAPABILITIES: AcpClientCapabilities = {
  fs: {
    readTextFile: false,
    writeTextFile: false,
  },
  terminal: false,
}

const FAIL_CLOSED_PERMISSION_RESULT: AcpPermissionRequestResult = {
  outcome: { outcome: 'cancelled' },
}

function extractToolCall(update: Record<string, unknown>): CliRuntimeToolCall | null {
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

function isInitializeParams(
  value: AcpClientInfo | AcpInitializeParams | undefined,
): value is AcpInitializeParams {
  return Boolean(value && typeof value === 'object' && 'clientInfo' in value)
}

function normalizeAcpPermissionRequest(params: unknown): CliPermissionRequest {
  const record = asRecord(params)
  const toolCall = asRecord(record?.toolCall)
  const sessionId = readNonEmptyString(record?.sessionId) ?? ''
  const toolCallId = readNonEmptyString(toolCall?.toolCallId, toolCall?.id)
  const kind = readNonEmptyString(toolCall?.kind)
  const toolName = readNonEmptyString(toolCall?.title, toolCall?.kind) ?? 'tool'
  const options = Array.isArray(record?.options)
    ? (record.options as AcpPermissionOption[])
    : undefined

  return {
    sessionId,
    protocol: 'acp',
    ...(toolCallId ? { toolCallId } : {}),
    toolName,
    ...(kind ? { kind } : {}),
    riskHint: inferPermissionRiskHint(toolName, kind),
    summary: readNonEmptyString(toolCall?.title, toolCall?.kind),
    ...(toolCall?.rawInput !== undefined ? { input: toolCall.rawInput } : {}),
    ...(options ? { acpOptions: options } : {}),
    raw: params,
  }
}

export function mapDecisionToAcpPermissionResult(
  decision: CliPermissionDecision,
  acpOptions?: AcpPermissionOption[],
): AcpPermissionRequestResult {
  if (decision.cancelled) {
    return FAIL_CLOSED_PERMISSION_RESULT
  }

  const options = Array.isArray(acpOptions) ? acpOptions : []
  if (decision.approved) {
    const preferredKinds = decision.remember
      ? ['allow_always', 'allow_once']
      : ['allow_once', 'allow_always']
    for (const kind of preferredKinds) {
      const match = options.find(opt => opt && opt.kind === kind && typeof opt.optionId === 'string')
      if (match) {
        return { outcome: { outcome: 'selected', optionId: match.optionId } }
      }
    }
    // Fail closed if no allow option was offered by the agent.
    return FAIL_CLOSED_PERMISSION_RESULT
  }

  const rejectKinds = decision.remember
    ? ['reject_always', 'reject_once']
    : ['reject_once', 'reject_always']
  for (const kind of rejectKinds) {
    const match = options.find(opt => opt && opt.kind === kind && typeof opt.optionId === 'string')
    if (match) {
      return { outcome: { outcome: 'selected', optionId: match.optionId } }
    }
  }
  return FAIL_CLOSED_PERMISSION_RESULT
}

function findReasoningConfigOption(configOptions: AcpConfigOption[]): AcpConfigOption | undefined {
  return configOptions.find(opt =>
    opt.category === 'thought_level'
    || opt.id === 'reasoning_effort'
    || opt.id === 'thinking'
    || opt.id === 'effort',
  )
}

export interface AcpClientOptions {
  label?: string
  onRequest?: AcpServerRequestHandler
  onPermission?: CliPermissionHandler
}

export class AcpSession implements CliRuntimeSession {
  readonly protocol = 'acp' as const
  private _currentModel?: string

  get currentModel(): string | undefined {
    return this._currentModel
  }

  constructor(
    readonly sessionId: string,
    protected readonly client: AcpClient,
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
    onEvent?: (event: CliRuntimeStreamEvent) => void,
    options?: AcpPromptStreamOptions,
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
    options: AcpPromptStreamOptions = {},
  ): AsyncIterable<CliRuntimeStreamEvent> {
    const signal = options.signal
    if (signal?.aborted)
      return

    const formattedPrompt: AcpPromptContent[]
      = typeof content === 'string' ? [{ type: 'text', text: content }] : content

    const eventQueue: CliRuntimeStreamEvent[] = []
    let resolver: (() => void) | null = null
    const state = { finished: false, aborted: false }
    let failure: Error | null = null

    const wake = (): void => {
      const next = resolver
      resolver = null
      next?.()
    }

    const pushEvent = (event: CliRuntimeStreamEvent): void => {
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

      if (updateType === 'agent_thought_chunk') {
        const text = readRawNonEmptyString(update.content?.text, update.text)
        if (text) {
          pushEvent({
            type: 'thinking',
            text,
            raw: update,
          })
        }
      }
      else if (updateType === 'agent_message_chunk') {
        const text = readRawNonEmptyString(update.content?.text, update.text)
        if (text) {
          pushEvent({
            type: 'delta',
            text,
            raw: update,
          })
        }
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
        if (toolCall) {
          pushEvent({
            type: 'tool_call',
            toolCall,
            raw: update,
          })
        }
        else {
          pushEvent({
            type: 'status',
            status: updateType,
            raw: update,
          })
        }
      }
      else if (updateType === 'tool_result') {
        const toolCall = extractToolCall(update)
        if (toolCall) {
          pushEvent({
            type: 'tool_result',
            toolCall,
            raw: update,
          })
        }
        else {
          pushEvent({
            type: 'status',
            status: updateType,
            raw: update,
          })
        }
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
            status: updateType,
            raw: update,
          })
        }
      }
      else {
        pushEvent({
          type: 'status',
          status: readNonEmptyString(updateType),
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

export class AcpClient extends EventEmitter implements CliRuntimeClient {
  readonly protocol = 'acp' as const
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
  private stderrCollector: StderrTailCollector | null = null
  private lifecycle: ProcessLifecycleController | null = null
  private requestHandler: AcpServerRequestHandler | null = null
  private permissionHandler: CliPermissionHandler | null = null
  private closed = false
  private closePromise: Promise<void> | null = null
  protected readonly label: string
  public agentInfo?: AcpInitializeResult['agentInfo']
  public capabilities?: AcpInitializeResult['agentCapabilities']

  constructor(
    protected readonly childProcess: ChildProcess,
    options: AcpClientOptions = {},
  ) {
    super()
    this.label = options.label?.trim() || 'ACP'
    if (options.onRequest) {
      this.requestHandler = options.onRequest
    }
    if (options.onPermission) {
      this.permissionHandler = options.onPermission
    }
    this.setupProcess()
  }

  isClosed(): boolean {
    return this.closed
  }

  stderrTail(): string {
    return this.stderrCollector?.getTail() ?? ''
  }

  setRequestHandler(handler: AcpServerRequestHandler | null): void {
    this.requestHandler = handler
  }

  setPermissionHandler(handler: CliPermissionHandler | null): void {
    this.permissionHandler = handler
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private setupProcess(): void {
    if (!this.childProcess.stdout)
      throw new Error('Process stdout not readable')

    attachSafeStdinErrorGuard(this.childProcess)
    this.stderrCollector = createStderrTailCollector(this.childProcess)

    const rl = readline.createInterface({
      input: this.childProcess.stdout,
      terminal: false,
    })
    this.rl = rl

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed)
        return
      try {
        const msg = JSON.parse(trimmed)
        const record = asRecord(msg)
        if (record) {
          this.handleMessage(record)
        }
        else {
          this.emit('protocol_error', new Error('Expected JSON object frame'), trimmed)
        }
      }
      catch (err) {
        this.emit('protocol_error', err, trimmed)
      }
    })

    this.lifecycle = attachProcessLifecycle(this.childProcess, rl, {
      onExit: (code, signal) => {
        const wasClosed = this.closed
        this.closed = true
        if (this.rl) {
          this.rl.close()
          this.rl = null
        }
        this.stderrCollector?.detach()
        const error = formatProcessExitError(this.label, code, signal, this.stderrTail())
        this.rejectAllPending(error)
        this.sessionListeners.clear()
        if (!wasClosed || this.listenerCount('close') > 0) {
          this.emit('close', code, signal)
        }
      },
      onError: (error) => {
        this.closed = true
        if (this.rl) {
          this.rl.close()
          this.rl = null
        }
        this.stderrCollector?.detach()
        this.rejectAllPending(error)
        this.sessionListeners.clear()
        if (this.listenerCount('error') > 0) {
          this.emit('error', error)
        }
      },
      onStdoutEof: () => {
        if (this.closed)
          return
        const stderr = this.stderrTail()
        const suffix = stderr ? `: ${stderr}` : ''
        const error = new Error(`${this.label} stdout closed unexpectedly${suffix}`)
        this.rejectAllPending(error)
      },
    })
  }

  private writeJsonRpcResponse(response: JsonRpcResponse): void {
    if (this.closed)
      return
    tryWriteJsonLine(this.childProcess, response)
  }

  private handleServerRequest(id: number | string, method: string, params: unknown): void {
    void (async () => {
      try {
        if (this.requestHandler) {
          const result = await this.requestHandler(method, params)
          this.writeJsonRpcResponse({ jsonrpc: '2.0', id, result: result === undefined ? null : result })
          return
        }
        if (method === 'session/request_permission') {
          if (!this.permissionHandler) {
            // Fail closed when no approval handler is wired: never leave the agent hung.
            this.writeJsonRpcResponse({
              jsonrpc: '2.0',
              id,
              result: FAIL_CLOSED_PERMISSION_RESULT,
            })
            return
          }
          try {
            const normalized = normalizeAcpPermissionRequest(params)
            const decision = await this.permissionHandler(normalized)
            const result = mapDecisionToAcpPermissionResult(
              decision,
              (params as AcpPermissionRequestParams | undefined)?.options,
            )
            this.writeJsonRpcResponse({ jsonrpc: '2.0', id, result })
          }
          catch {
            // Fail closed on handler throw.
            this.writeJsonRpcResponse({
              jsonrpc: '2.0',
              id,
              result: FAIL_CLOSED_PERMISSION_RESULT,
            })
          }
          return
        }
        this.writeJsonRpcResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        })
      }
      catch (err) {
        if (method === 'session/request_permission') {
          this.writeJsonRpcResponse({
            jsonrpc: '2.0',
            id,
            result: FAIL_CLOSED_PERMISSION_RESULT,
          })
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        const errorCode = typeof (err as { code?: unknown } | null)?.code === 'number'
          ? (err as { code: number }).code
          : -32603
        this.writeJsonRpcResponse({
          jsonrpc: '2.0',
          id,
          error: { code: errorCode, message },
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
      throw new Error(`${this.label} client is closed`)

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
      void writeJsonLine(this.childProcess, req, this.label).catch((err) => {
        if (this.pendingRequests.delete(id)) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    })
  }

  sendNotification(method: string, params?: unknown): void {
    if (this.closed)
      return
    const notif: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    tryWriteJsonLine(this.childProcess, notif)
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
    clientInfoOrParams?: AcpClientInfo | AcpInitializeParams,
    timeoutMs: number = DEFAULT_INIT_TIMEOUT_MS,
    clientCapabilities?: AcpClientCapabilities,
  ): Promise<AcpInitializeResult> {
    let initParams: AcpInitializeParams
    if (isInitializeParams(clientInfoOrParams)) {
      const capabilities = clientCapabilities ?? clientInfoOrParams.clientCapabilities
      initParams = {
        protocolVersion: clientInfoOrParams.protocolVersion ?? DEFAULT_ACP_PROTOCOL_VERSION,
        clientInfo: clientInfoOrParams.clientInfo,
        ...(capabilities !== undefined ? { clientCapabilities: capabilities } : {}),
      }
    }
    else {
      initParams = {
        protocolVersion: DEFAULT_ACP_PROTOCOL_VERSION,
        clientInfo: clientInfoOrParams ?? DEFAULT_ACP_CLIENT_INFO,
        ...(clientCapabilities !== undefined ? { clientCapabilities } : {}),
      }
    }

    const request = this.sendRequest<AcpInitializeResult>('initialize', initParams)
    const result = await withTimeout(
      request,
      timeoutMs,
      `${this.label} initialize timed out after ${timeoutMs}ms`,
    )
    this.agentInfo = result.agentInfo
    this.capabilities = result.agentCapabilities
    return result
  }

  protected createSessionInstance(
    sessionId: string,
    configOptions: AcpConfigOption[],
  ): AcpSession {
    return new AcpSession(sessionId, this, configOptions)
  }

  async loadSession(
    options: AcpSessionLoadParams & { model?: string, reasoningEffort?: string },
  ): Promise<AcpSession> {
    const result = await this.sendRequest<AcpSessionLoadResult>('session/load', {
      sessionId: options.sessionId,
      cwd: options.cwd,
      mcpServers: options.mcpServers ?? [],
    })
    const sessionId = readNonEmptyString(result?.sessionId) ?? options.sessionId
    const session = this.createSessionInstance(sessionId, result?.configOptions ?? [])
    if (options.model) {
      await session.setModel(options.model)
    }
    if (options.reasoningEffort) {
      const reasoningOpt = findReasoningConfigOption(session.configOptions)
      if (reasoningOpt) {
        await session.setConfig(reasoningOpt.id, options.reasoningEffort)
      }
    }
    return session
  }

  async createSession(options: AcpSessionCreateOptions = {}): Promise<AcpSession> {
    const cwd = options.cwd || process.cwd()
    if (options.resumeSessionId) {
      return await this.loadSession({
        sessionId: options.resumeSessionId,
        cwd,
        mcpServers: options.mcpServers ?? [],
        ...(options.model ? { model: options.model } : {}),
        ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
      })
    }

    const result = await this.sendRequest<AcpSessionNewResult>('session/new', {
      cwd,
      mcpServers: options.mcpServers || [],
    })

    const session = this.createSessionInstance(result.sessionId, result.configOptions || [])
    if (options.model) {
      await session.setModel(options.model)
    }
    if (options.reasoningEffort) {
      const reasoningOpt = findReasoningConfigOption(session.configOptions)
      if (reasoningOpt) {
        await session.setConfig(reasoningOpt.id, options.reasoningEffort)
      }
    }
    return session
  }

  async close(): Promise<void> {
    if (this.closePromise)
      return await this.closePromise

    this.closePromise = (async () => {
      this.closed = true
      this.lifecycle?.markClosed()
      this.rejectAllPending(new Error(`${this.label} client closed`))
      this.sessionListeners.clear()
      const rl = this.rl
      this.rl = null
      await terminateChildProcess(this.childProcess, {
        rl,
        stderrCollector: this.stderrCollector,
      })
    })()

    return await this.closePromise
  }

  static async spawn(options: AcpSpawnOptions): Promise<AcpClient> {
    const executable = options.executablePath
    const args = options.args ?? []
    const proc = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      env: buildSpawnEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const client = new AcpClient(proc, {
      label: options.label ?? 'ACP',
      onRequest: options.onRequest,
      onPermission: options.onPermission,
    })

    try {
      await client.initialize(
        {
          clientInfo: options.clientInfo ?? DEFAULT_ACP_CLIENT_INFO,
          protocolVersion: options.protocolVersion ?? DEFAULT_ACP_PROTOCOL_VERSION,
          ...(options.clientCapabilities !== undefined
            ? { clientCapabilities: options.clientCapabilities }
            : {}),
        },
        options.initTimeoutMs,
      )
      return client
    }
    catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
  }
}
