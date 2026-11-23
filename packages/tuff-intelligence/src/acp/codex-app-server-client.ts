import type { ChildProcess } from 'node:child_process'
import type { ProcessLifecycleController, StderrTailCollector } from './process-utils'
import type {
  AcpAgentInfo,
  AcpMcpServerConfig,
  AcpPromptContent,
  AcpPromptStreamOptions,
  AcpUsageUpdate,
  CliPermissionDecision,
  CliPermissionHandler,
  CliPermissionRequest,
  CliRuntimeClient,
  CliRuntimeSession,
  CliRuntimeSessionOptions,
  CliRuntimeStreamEvent,
  CliRuntimeToolCall,
  CodexAppServerSpawnOptions,
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
  normalizeKeyValueEntries,
  readFiniteNumber,
  readNonEmptyString,
  readRawNonEmptyString,
  terminateChildProcess,
  tryWriteJsonLine,
  withTimeout,
  writeJsonLine,
} from './process-utils'

const CODEX_TOOL_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'webSearch',
  'toolCall',
])

const CODEX_REASONING_DELTA_METHODS = new Set([
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta',
  'item/reasoning/delta',
])

const BARE_TOML_KEY_PATTERN = /^[A-Za-z0-9_-]+$/
const BEARER_HEADER_PATTERN = /^Bearer\s+(.+)$/i

function encodeTomlString(value: string): string {
  // JSON.stringify escapes ", \, and U+0000..U+001F using TOML-compatible escapes; also escape DEL (0x7F).
  return JSON.stringify(value).replace(/\u007F/g, '\\u007f')
}

function encodeTomlKey(key: string): string {
  return BARE_TOML_KEY_PATTERN.test(key) ? key : encodeTomlString(key)
}

export interface CodexAppServerSpawnConfig {
  args: string[]
  env: Record<string, string | undefined>
}

/**
 * Builds `codex app-server --stdio` argv and child env overrides.
 * MCP bearer tokens and headers are NEVER placed literally into `argv`; they are bound via
 * child environment variables (`bearer_token_env_var` / `env_http_headers` / `env_vars`).
 */
export function buildCodexAppServerSpawnConfig(
  options: CodexAppServerSpawnOptions = {},
): CodexAppServerSpawnConfig {
  const args: string[] = ['app-server', '--stdio']
  const env: Record<string, string | undefined> = {
    ...(options.env || {}),
  }

  if (options.strictMcpServers) {
    args.push('-c', 'mcp_servers={}')
  }

  const servers: AcpMcpServerConfig[] = options.mcpServers ?? []
  servers.forEach((server, idx) => {
    const serverName = readNonEmptyString(server?.name)
    if (!serverName)
      return
    const key = encodeTomlKey(serverName)

    if (server.url) {
      args.push('-c', `mcp_servers.${key}.url=${encodeTomlString(server.url)}`)
      const headers = normalizeKeyValueEntries(server.headers)
      const nonBearerHeaderMappings: string[] = []
      let nonBearerIdx = 0

      for (const [headerName, headerValue] of headers) {
        if (headerName.toLowerCase() === 'authorization') {
          const bearerMatch = BEARER_HEADER_PATTERN.exec(headerValue.trim())
          if (bearerMatch && bearerMatch[1]) {
            const tokenEnvVar = `TUFF_MCP_TOKEN_${idx}`
            env[tokenEnvVar] = bearerMatch[1]
            args.push('-c', `mcp_servers.${key}.bearer_token_env_var=${encodeTomlString(tokenEnvVar)}`)
            continue
          }
        }
        const headerEnvVar = `TUFF_MCP_HDR_${idx}_${nonBearerIdx++}`
        env[headerEnvVar] = headerValue
        nonBearerHeaderMappings.push(
          `${encodeTomlString(headerName)}=${encodeTomlString(headerEnvVar)}`,
        )
      }

      if (nonBearerHeaderMappings.length > 0) {
        args.push('-c', `mcp_servers.${key}.env_http_headers={${nonBearerHeaderMappings.join(',')}}`)
      }
      return
    }

    if (server.command) {
      args.push('-c', `mcp_servers.${key}.command=${encodeTomlString(server.command)}`)
      if (Array.isArray(server.args) && server.args.length > 0) {
        args.push('-c', `mcp_servers.${key}.args=[${server.args.map(encodeTomlString).join(',')}]`)
      }
      const envEntries = normalizeKeyValueEntries(server.env)
      if (envEntries.length > 0) {
        const varNames: string[] = []
        for (const [varName, varValue] of envEntries) {
          env[varName] = varValue
          varNames.push(varName)
        }
        args.push('-c', `mcp_servers.${key}.env_vars=[${varNames.map(encodeTomlString).join(',')}]`)
      }
    }
  })

  if (Array.isArray(options.args) && options.args.length > 0) {
    args.push(...options.args)
  }

  return { args, env }
}

function formatCodexInput(content: string | AcpPromptContent[]): Array<Record<string, unknown>> {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  const items: Array<Record<string, unknown>> = []
  for (const block of content) {
    if (!block || typeof block !== 'object')
      continue
    if (block.type === 'text' || block.type === 'embedded_context') {
      if (typeof block.text === 'string') {
        items.push({ type: 'text', text: block.text })
      }
      continue
    }
    if (block.type === 'image') {
      const mimeType = readNonEmptyString(block.mimeType)
      const data = readNonEmptyString(block.data)
      if (!mimeType || !data)
        continue
      const url = data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`
      items.push({ type: 'image', url })
    }
  }
  return items
}

/**
 * Parses OpenAI-style token usage (`input_tokens` is total prompt tokens;
 * `cached_input_tokens` is reported alongside it, NEVER added on top).
 */
function parseCodexUsage(value: unknown): AcpUsageUpdate | null {
  const root = asRecord(value)
  if (!root)
    return null
  const tokenUsage = asRecord(root.tokenUsage)
  const candidate
    = asRecord(tokenUsage?.last)
      ?? asRecord(tokenUsage?.total)
      ?? asRecord(root.usage)
      ?? asRecord(asRecord(root.turn)?.usage)
      ?? tokenUsage
      ?? root

  const inputTokens = readFiniteNumber(candidate.inputTokens, candidate.input_tokens)
  const outputTokens = readFiniteNumber(candidate.outputTokens, candidate.output_tokens)
  const cacheReadTokens = readFiniteNumber(candidate.cachedInputTokens, candidate.cached_input_tokens)
  const explicitTotal = readFiniteNumber(candidate.totalTokens, candidate.total_tokens)

  if (inputTokens === undefined && outputTokens === undefined && explicitTotal === undefined) {
    return null
  }

  const totalTokens = explicitTotal ?? ((inputTokens ?? 0) + (outputTokens ?? 0))
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    totalTokens,
    ...(cacheReadTokens !== undefined && cacheReadTokens > 0 ? { cacheReadTokens } : {}),
  }
}

function extractCodexToolName(item: Record<string, unknown>, itemType: string): string {
  if (itemType === 'mcpToolCall') {
    const server = readNonEmptyString(item.server, item.serverName)
    const tool = readNonEmptyString(item.tool, item.toolName, item.name)
    if (server && tool)
      return `${server}.${tool}`
    if (tool)
      return tool
  }
  return readNonEmptyString(item.toolName, item.name, item.title) ?? itemType
}

function extractCodexToolArgs(item: Record<string, unknown>): unknown {
  if (item.arguments !== undefined)
    return item.arguments
  if (item.input !== undefined)
    return item.input
  if (item.args !== undefined)
    return item.args
  if (item.command !== undefined) {
    return {
      command: item.command,
      ...(item.cwd !== undefined ? { cwd: item.cwd } : {}),
    }
  }
  if (item.changes !== undefined)
    return { changes: item.changes }
  if (item.query !== undefined)
    return { query: item.query }
  return undefined
}

function extractCodexToolCall(
  item: Record<string, unknown>,
  params: Record<string, unknown>,
  isCompletion: boolean,
  knownNames: Map<string, string>,
): CliRuntimeToolCall | null {
  const itemType = readNonEmptyString(item.type)
  if (!itemType || !CODEX_TOOL_ITEM_TYPES.has(itemType))
    return null

  const toolCallId = readNonEmptyString(item.id, item.callId, params.itemId)
  if (!toolCallId)
    return null

  const extractedName = extractCodexToolName(item, itemType)
  const toolName = isCompletion
    ? (knownNames.get(toolCallId) ?? extractedName)
    : extractedName
  if (!isCompletion) {
    knownNames.set(toolCallId, toolName)
  }

  const args = extractCodexToolArgs(item)
  const status = readNonEmptyString(item.status) ?? (isCompletion ? 'completed' : 'in_progress')

  if (!isCompletion) {
    return {
      toolCallId,
      toolName,
      ...(args !== undefined ? { args } : {}),
      status,
      isError: false,
    }
  }

  const result
    = item.aggregatedOutput !== undefined
      ? item.aggregatedOutput
      : item.output !== undefined
        ? item.output
        : item.result !== undefined
          ? item.result
          : item.changes !== undefined
            ? item.changes
            : item.content !== undefined
              ? item.content
              : item.error

  const exitCode = readFiniteNumber(item.exitCode, item.exit_code)
  const isError
    = item.isError === true
      || status === 'failed'
      || status === 'error'
      || status === 'declined'
      || (exitCode !== undefined && exitCode !== 0)
      || Boolean(item.error)

  return {
    toolCallId,
    toolName,
    ...(args !== undefined ? { args } : {}),
    status,
    ...(result !== undefined ? { result } : {}),
    isError,
  }
}

export interface CodexAppServerClientOptions {
  onPermission?: CliPermissionHandler
}

interface CodexNotificationEntry {
  method: string
  params: Record<string, unknown>
}

export class CodexAppServerSession implements CliRuntimeSession {
  readonly protocol = 'codex-app-server' as const
  private activeTurnId: string | undefined
  private turnInFlight = false

  constructor(
    readonly sessionId: string,
    private readonly client: CodexAppServerClient,
    private readonly sessionOptions: CliRuntimeSessionOptions,
  ) {}

  async* promptStream(
    content: string | AcpPromptContent[],
    options: AcpPromptStreamOptions = {},
  ): AsyncIterable<CliRuntimeStreamEvent> {
    const signal = options.signal
    if (signal?.aborted)
      return

    if (this.turnInFlight) {
      throw new Error('Codex app-server session already has an active turn')
    }
    if (this.client.isClosed()) {
      throw new Error('Codex app-server client is closed')
    }

    this.turnInFlight = true
    this.activeTurnId = undefined

    const eventQueue: CliRuntimeStreamEvent[] = []
    let resolver: (() => void) | null = null
    const state = { finished: false, aborted: false }
    let failure: Error | null = null
    const streamedAgentMessageItemIds = new Set<string>()
    let sawAnyAgentMessageDelta = false
    const toolNamesById = new Map<string, string>()

    const wake = (): void => {
      const next = resolver
      resolver = null
      next?.()
    }

    const pushEvent = (event: CliRuntimeStreamEvent): void => {
      if (state.aborted || state.finished)
        return
      eventQueue.push(event)
      wake()
    }

    const failStream = (error: Error): void => {
      if (state.aborted || state.finished)
        return
      failure = error
      state.finished = true
      wake()
    }

    const finishStream = (): void => {
      if (state.aborted || state.finished)
        return
      state.finished = true
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

    const unsubscribeDisconnect = this.client.onDisconnect((error) => {
      if (!state.aborted && !state.finished) {
        failStream(error)
      }
    })

    const unsubscribeNotif = this.client.onThreadNotification(
      this.sessionId,
      ({ method, params }) => {
        if (state.aborted || state.finished)
          return

        const turnObj = asRecord(params.turn)
        const notifTurnId = readNonEmptyString(params.turnId, turnObj?.id)
        if (this.activeTurnId && notifTurnId && notifTurnId !== this.activeTurnId) {
          return
        }

        if (method === 'turn/started') {
          if (notifTurnId) {
            this.activeTurnId = notifTurnId
          }
          return
        }

        if (method === 'item/agentMessage/delta') {
          const text = readRawNonEmptyString(params.delta)
          if (text) {
            const itemId = readNonEmptyString(params.itemId, params.id)
            if (itemId)
              streamedAgentMessageItemIds.add(itemId)
            sawAnyAgentMessageDelta = true
            pushEvent({ type: 'delta', text, raw: params })
          }
          return
        }

        if (CODEX_REASONING_DELTA_METHODS.has(method)) {
          const text = readRawNonEmptyString(params.delta, params.text)
          if (text) {
            pushEvent({ type: 'thinking', text, raw: params })
          }
          return
        }

        if (method === 'item/started') {
          const item = asRecord(params.item)
          if (item) {
            const toolCall = extractCodexToolCall(item, params, false, toolNamesById)
            if (toolCall) {
              pushEvent({ type: 'tool_call', toolCall, raw: params })
            }
          }
          return
        }

        if (method === 'item/completed') {
          const item = asRecord(params.item)
          const itemType = readNonEmptyString(item?.type)
          if (!item || !itemType)
            return

          if (itemType === 'agentMessage' || itemType === 'agent_message') {
            const itemId = readNonEmptyString(item.id, params.itemId)
            const alreadyStreamed = itemId
              ? streamedAgentMessageItemIds.has(itemId)
              || (streamedAgentMessageItemIds.size === 0 && sawAnyAgentMessageDelta)
              : sawAnyAgentMessageDelta
            const text = readRawNonEmptyString(item.text)
            if (text && !alreadyStreamed) {
              pushEvent({ type: 'delta', text, raw: params })
            }
            return
          }

          if (CODEX_TOOL_ITEM_TYPES.has(itemType)) {
            const toolCall = extractCodexToolCall(item, params, true, toolNamesById)
            if (toolCall) {
              pushEvent({ type: 'tool_result', toolCall, raw: params })
            }
            return
          }

          if (itemType === 'error') {
            // Non-fatal warning per pi-provider-contracts.md §11.3.2.
            pushEvent({
              type: 'status',
              status: readNonEmptyString(item.message) ?? 'error',
              raw: params,
            })
          }
          return
        }

        if (method === 'thread/tokenUsage/updated') {
          const usage = parseCodexUsage(params)
          if (usage) {
            pushEvent({ type: 'usage', usage, raw: params })
          }
          return
        }

        if (method === 'turn/completed') {
          const usage = parseCodexUsage(params)
          if (usage) {
            pushEvent({ type: 'usage', usage, raw: params })
          }
          const status = readNonEmptyString(turnObj?.status, params.status)
          const turnError = turnObj?.error ?? params.error
          if (status === 'failed' || Boolean(turnError)) {
            const errRecord = asRecord(turnError)
            const msg
              = readNonEmptyString(errRecord?.message, turnError, params.message)
                ?? 'Codex turn failed'
            failStream(new Error(msg))
            return
          }
          finishStream()
          return
        }

        if (method === 'turn/failed') {
          const errRecord = asRecord(params.error)
          const msg
            = readNonEmptyString(errRecord?.message, params.error, params.message)
              ?? 'Codex turn failed'
          failStream(new Error(msg))
        }
      },
    )

    const input = formatCodexInput(content)
    const startPromise = this.client
      .sendRequest<Record<string, unknown>>('turn/start', {
        threadId: this.sessionId,
        input,
        cwd: this.sessionOptions.cwd,
        ...(this.sessionOptions.model ? { model: this.sessionOptions.model } : {}),
        ...(this.sessionOptions.reasoningEffort ? { effort: this.sessionOptions.reasoningEffort } : {}),
        // Per agent-tool-gateway-contracts.md §4: always route approvals per call.
        approvalPolicy: 'untrusted',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [this.sessionOptions.cwd],
          networkAccess: false,
        },
      })
      .then((res) => {
        const resRecord = asRecord(res)
        const turnId = readNonEmptyString(asRecord(resRecord?.turn)?.id, resRecord?.turnId)
        if (turnId) {
          this.activeTurnId = turnId
        }
      })
      .catch((err) => {
        failStream(err instanceof Error ? err : new Error(String(err)))
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
        void startPromise.catch(() => undefined)
        return
      }
      await startPromise
      if (failure)
        throw failure
    }
    finally {
      signal?.removeEventListener('abort', onAbort)
      unsubscribeNotif()
      unsubscribeDisconnect()
      this.activeTurnId = undefined
      this.turnInFlight = false
    }
  }

  async cancel(): Promise<void> {
    if (this.client.isClosed())
      return
    await this.client.sendRequest('turn/interrupt', {
      threadId: this.sessionId,
      ...(this.activeTurnId ? { turnId: this.activeTurnId } : {}),
    })
  }

  async close(): Promise<void> {
    if (this.turnInFlight && !this.client.isClosed()) {
      await this.cancel().catch(() => undefined)
    }
  }
}

export class CodexAppServerClient extends EventEmitter implements CliRuntimeClient {
  readonly protocol = 'codex-app-server' as const
  private nextRequestId = 1
  private readonly pendingRequests = new Map<
    number | string,
    { resolve: (value: unknown) => void, reject: (error: Error) => void }
  >()

  private readonly threadListeners = new Map<
    string,
    Set<(entry: CodexNotificationEntry) => void>
  >()

  private readonly disconnectListeners = new Set<(error: Error) => void>()

  private rl: readline.Interface | null = null
  private stderrCollector: StderrTailCollector | null = null
  private lifecycle: ProcessLifecycleController | null = null
  private permissionHandler: CliPermissionHandler | null = null
  private closed = false
  private closePromise: Promise<void> | null = null
  private readonly label = 'Codex app-server'
  public agentInfo?: AcpAgentInfo

  constructor(
    private readonly childProcess: ChildProcess,
    options: CodexAppServerClientOptions = {},
  ) {
    super()
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

  setPermissionHandler(handler: CliPermissionHandler | null): void {
    this.permissionHandler = handler
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private notifyDisconnect(error: Error): void {
    for (const listener of Array.from(this.disconnectListeners)) {
      listener(error)
    }
    this.disconnectListeners.clear()
  }

  onDisconnect(listener: (error: Error) => void): () => void {
    this.disconnectListeners.add(listener)
    return () => {
      this.disconnectListeners.delete(listener)
    }
  }

  onThreadNotification(
    threadId: string,
    listener: (entry: CodexNotificationEntry) => void,
  ): () => void {
    let set = this.threadListeners.get(threadId)
    if (!set) {
      set = new Set()
      this.threadListeners.set(threadId, set)
    }
    set.add(listener)
    return () => {
      const current = this.threadListeners.get(threadId)
      if (current) {
        current.delete(listener)
        if (current.size === 0) {
          this.threadListeners.delete(threadId)
        }
      }
    }
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
        const parsed = JSON.parse(trimmed)
        const record = asRecord(parsed)
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
        this.notifyDisconnect(error)
        this.threadListeners.clear()
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
        this.notifyDisconnect(error)
        this.threadListeners.clear()
        if (this.listenerCount('error') > 0) {
          this.emit('error', error)
        }
      },
      onStdoutEof: () => {
        if (this.closed)
          return
        const stderr = this.stderrTail()
        const suffix = stderr ? `: ${stderr}` : ''
        const error = new Error(`${this.label} stdout closed before turn completed${suffix}`)
        this.rejectAllPending(error)
        this.notifyDisconnect(error)
      },
    })
  }

  private writeResponse(id: number | string, payload: { result?: unknown, error?: { code: number, message: string } }): void {
    if (this.closed)
      return
    tryWriteJsonLine(this.childProcess, {
      jsonrpc: '2.0',
      id,
      ...payload,
    })
  }

  private handleServerRequest(id: number | string, method: string, params: unknown): void {
    const paramsRecord = asRecord(params)

    if (
      method === 'item/commandExecution/requestApproval'
      || method === 'item/fileChange/requestApproval'
      || method === 'item/permissions/requestApproval'
    ) {
      const isCommand = method === 'item/commandExecution/requestApproval'
      const isPermissions = method === 'item/permissions/requestApproval'

      const failClosedResult = isPermissions
        ? { scope: 'turn', permissions: {} }
        : { decision: 'decline' }

      if (!this.permissionHandler) {
        this.writeResponse(id, { result: failClosedResult })
        return
      }

      const riskHint = isCommand || isPermissions ? 'execute' : 'write'
      const toolName = isCommand
        ? 'commandExecution'
        : isPermissions
          ? 'permissions'
          : 'fileChange'

      const request: CliPermissionRequest = {
        sessionId: readNonEmptyString(paramsRecord?.threadId) ?? '',
        protocol: 'codex-app-server',
        ...(readNonEmptyString(paramsRecord?.itemId, paramsRecord?.callId)
          ? { toolCallId: readNonEmptyString(paramsRecord?.itemId, paramsRecord?.callId) }
          : {}),
        toolName,
        kind: riskHint,
        riskHint,
        summary:
          readNonEmptyString(paramsRecord?.reason, paramsRecord?.command)
          ?? `${method} approval`,
        input: params,
        raw: params,
      }

      void (async () => {
        try {
          const decision: CliPermissionDecision = await this.permissionHandler!(request)
          if (isPermissions) {
            const approved = decision.approved && !decision.cancelled
            this.writeResponse(id, {
              result: approved
                ? { scope: 'turn', permissions: paramsRecord?.permissions ?? {} }
                : { scope: 'turn', permissions: {} },
            })
            return
          }
          const mappedDecision = decision.approved && !decision.cancelled
            ? (decision.remember ? 'acceptForSession' : 'accept')
            : (decision.cancelled ? 'cancel' : 'decline')
          this.writeResponse(id, { result: { decision: mappedDecision } })
        }
        catch {
          // Fail closed on handler throw.
          this.writeResponse(id, { result: failClosedResult })
        }
      })()
      return
    }

    this.writeResponse(id, {
      error: { code: -32601, message: `Method not found: ${method}` },
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Accept incoming frames WITH or WITHOUT `"jsonrpc": "2.0"`.
    const hasId = 'id' in msg && (typeof msg.id === 'number' || typeof msg.id === 'string')
    const hasMethod = 'method' in msg && typeof msg.method === 'string'

    if (hasId && hasMethod) {
      this.handleServerRequest(msg.id as number | string, msg.method as string, msg.params)
      return
    }

    if (hasId) {
      const id = msg.id as number | string
      const pending = this.pendingRequests.get(id)
        ?? (typeof id === 'string' && /^\d+$/.test(id) ? this.pendingRequests.get(Number(id)) : undefined)
      if (pending) {
        this.pendingRequests.delete(id)
        if (typeof id === 'string' && /^\d+$/.test(id)) {
          this.pendingRequests.delete(Number(id))
        }
        const errObj = asRecord(msg.error)
        if (errObj) {
          const errMsg = readNonEmptyString(errObj.message) ?? `JSON-RPC error ${String(errObj.code ?? '')}`
          pending.reject(new Error(errMsg))
        }
        else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    if (hasMethod) {
      const method = msg.method as string
      const params = asRecord(msg.params) ?? {}
      const threadId = readNonEmptyString(params.threadId, asRecord(params.thread)?.id)
      if (threadId) {
        const listeners = this.threadListeners.get(threadId)
        if (listeners) {
          for (const listener of listeners) {
            listener({ method, params })
          }
        }
      }
      this.emit('notification', method, params)
    }
  }

  async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (this.closed)
      throw new Error(`${this.label} client is closed`)

    const id = this.nextRequestId++
    const req = {
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
    tryWriteJsonLine(this.childProcess, {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    })
  }

  async initialize(timeoutMs: number = DEFAULT_INIT_TIMEOUT_MS): Promise<Record<string, unknown>> {
    const request = this.sendRequest<Record<string, unknown>>('initialize', {
      clientInfo: {
        name: 'tuff',
        title: 'Tuff',
        version: '1.0.0',
      },
    })
    const result = await withTimeout(
      request,
      timeoutMs,
      `${this.label} initialize timed out after ${timeoutMs}ms`,
    )
    const record = asRecord(result) ?? {}
    const infoObj = asRecord(record.serverInfo) ?? asRecord(record.agentInfo)
    this.agentInfo = {
      name: readNonEmptyString(infoObj?.name) ?? 'codex',
      ...(readNonEmptyString(infoObj?.title) ? { title: readNonEmptyString(infoObj?.title) } : {}),
      ...(readNonEmptyString(infoObj?.version, record.version, record.userAgent)
        ? { version: readNonEmptyString(infoObj?.version, record.version, record.userAgent) }
        : {}),
    }
    this.sendNotification('initialized')
    return record
  }

  async createSession(options: CliRuntimeSessionOptions): Promise<CodexAppServerSession> {
    const cwd = options.cwd || process.cwd()
    const method = options.resumeSessionId ? 'thread/resume' : 'thread/start'
    const params = options.resumeSessionId
      ? {
          threadId: options.resumeSessionId,
          cwd,
          ...(options.model ? { model: options.model } : {}),
          ...(options.systemPrompt ? { developerInstructions: options.systemPrompt } : {}),
          // Per agent-tool-gateway-contracts.md §4: always route approvals per call.
          approvalPolicy: 'untrusted',
          sandbox: 'workspace-write',
          excludeTurns: true,
        }
      : {
          cwd,
          ...(options.model ? { model: options.model } : {}),
          ...(options.systemPrompt ? { developerInstructions: options.systemPrompt } : {}),
          // Per agent-tool-gateway-contracts.md §4: always route approvals per call.
          approvalPolicy: 'untrusted',
          sandbox: 'workspace-write',
          serviceName: 'tuff',
          sessionStartSource: 'startup',
        }

    const result = await this.sendRequest<Record<string, unknown>>(method, params)
    const record = asRecord(result)
    const thread = asRecord(record?.thread)
    const threadId = readNonEmptyString(thread?.id, record?.threadId, options.resumeSessionId)
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread id')
    }
    return new CodexAppServerSession(threadId, this, { ...options, cwd })
  }

  async close(): Promise<void> {
    if (this.closePromise)
      return await this.closePromise

    this.closePromise = (async () => {
      this.closed = true
      this.lifecycle?.markClosed()
      const closeErr = new Error(`${this.label} client closed`)
      this.rejectAllPending(closeErr)
      this.notifyDisconnect(closeErr)
      this.threadListeners.clear()
      const rl = this.rl
      this.rl = null
      await terminateChildProcess(this.childProcess, {
        rl,
        stderrCollector: this.stderrCollector,
      })
    })()

    return await this.closePromise
  }

  static async spawn(options: CodexAppServerSpawnOptions = {}): Promise<CodexAppServerClient> {
    const executable = options.executablePath || 'codex'
    const { args, env } = buildCodexAppServerSpawnConfig(options)
    const proc = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      env: buildSpawnEnv(env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const client = new CodexAppServerClient(proc, {
      onPermission: options.onPermission,
    })

    try {
      await client.initialize(options.initTimeoutMs)
      return client
    }
    catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
  }
}
