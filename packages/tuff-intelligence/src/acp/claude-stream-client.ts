import type { ChildProcess } from 'node:child_process'
import type { ProcessLifecycleController, StderrTailCollector } from './process-utils'
import type {
  AcpAgentInfo,
  AcpMcpServerConfig,
  AcpPromptContent,
  AcpPromptStreamOptions,
  AcpUsageUpdate,
  ClaudePermissionMode,
  ClaudeStreamSpawnOptions,
  CliPermissionDecision,
  CliPermissionHandler,
  CliPermissionRequest,
  CliRuntimeClient,
  CliRuntimeSession,
  CliRuntimeSessionOptions,
  CliRuntimeStreamEvent,
} from './types'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import {
  asRecord,
  attachProcessLifecycle,
  attachSafeStdinErrorGuard,
  buildSpawnEnv,
  createStderrTailCollector,
  formatProcessExitError,
  inferPermissionRiskHint,
  normalizeKeyValueRecord,
  readFiniteNumber,
  readNonEmptyString,
  readRawNonEmptyString,
  terminateChildProcess,
  tryWriteJsonLine,
  writeJsonLine,
} from './process-utils'

const VALID_CLAUDE_PERMISSION_MODES = new Set<ClaudePermissionMode>([
  'manual',
  'plan',
  'acceptEdits',
  'dontAsk',
])

export function serializeClaudeMcpConfig(mcpServers: AcpMcpServerConfig[] = []): {
  mcpServers: Record<string, Record<string, unknown>>
} {
  const mapped: Record<string, Record<string, unknown>> = {}
  for (const server of mcpServers) {
    const name = readNonEmptyString(server?.name)
    if (!name)
      continue
    if (server.url) {
      const headers = normalizeKeyValueRecord(server.headers)
      mapped[name] = {
        type: server.type === 'sse' ? 'sse' : 'http',
        url: server.url,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
      continue
    }
    if (server.command) {
      const env = normalizeKeyValueRecord(server.env)
      mapped[name] = {
        type: 'stdio',
        command: server.command,
        ...(Array.isArray(server.args) && server.args.length > 0 ? { args: server.args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
      }
    }
  }
  return { mcpServers: mapped }
}

/**
 * Builds `claude` persistent stream-json argv.
 * Always passes `--print` and `--permission-prompt-tool stdio`, omits `--permission-mode`
 * by default, and accepts MCP config ONLY via a mode-0600 file path (never inline token JSON).
 */
export function buildClaudeStreamArgs(
  options: ClaudeStreamSpawnOptions = {},
  mcpConfigPath?: string,
): string[] {
  const args: string[] = [
    '--print',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--no-chrome',
  ]

  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.reasoningEffort) {
    args.push('--effort', options.reasoningEffort)
  }
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }
  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath)
  }
  if (options.strictMcpConfig) {
    args.push('--strict-mcp-config')
  }
  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  }
  if (options.permissionMode !== undefined) {
    if (!VALID_CLAUDE_PERMISSION_MODES.has(options.permissionMode)) {
      throw new Error(`Unsupported Claude permissionMode: ${String(options.permissionMode)}`)
    }
    args.push('--permission-mode', options.permissionMode)
  }
  if (Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
    args.push(...options.extraArgs)
  }

  return args
}

function formatClaudeUserBlocks(content: string | AcpPromptContent[]): Array<Record<string, unknown>> {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  const blocks: Array<Record<string, unknown>> = []
  for (const item of content) {
    if (!item || typeof item !== 'object')
      continue
    if (item.type === 'text' || item.type === 'embedded_context') {
      if (typeof item.text === 'string') {
        blocks.push({ type: 'text', text: item.text })
      }
      continue
    }
    if (item.type === 'image') {
      const mimeType = readNonEmptyString(item.mimeType)
      const data = readNonEmptyString(item.data)
      if (!mimeType || !data)
        continue
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data,
        },
      })
    }
  }
  return blocks
}

/**
 * Parses additive Anthropic token usage from a Claude `result` message.
 * `input_tokens` only counts uncached prompt tokens, so cache buckets are added on top.
 */
function parseClaudeUsage(record: Record<string, unknown>): AcpUsageUpdate | null {
  const usage = asRecord(record.usage)
  if (!usage)
    return null

  const uncachedInput = readFiniteNumber(usage.input_tokens) ?? 0
  const cacheWriteTokens = readFiniteNumber(usage.cache_creation_input_tokens) ?? 0
  const cacheReadTokens = readFiniteNumber(usage.cache_read_input_tokens) ?? 0
  const inputTokens = uncachedInput + cacheWriteTokens + cacheReadTokens
  const outputTokens = readFiniteNumber(usage.output_tokens) ?? 0
  const totalCost = readFiniteNumber(record.total_cost_usd)

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
    ...(totalCost !== undefined ? { cost: { total: totalCost } } : {}),
  }
}

interface PendingToolBlock {
  id: string
  name: string
  partialJson: string
  initialInput?: Record<string, unknown>
}

export interface ClaudeStreamClientOptions {
  onPermission?: CliPermissionHandler
  mcpConfigPath?: string | null
  initialSessionId?: string
}

export class ClaudeStreamSession implements CliRuntimeSession {
  readonly protocol = 'claude-stream-json' as const
  private _sessionId: string
  private turnInFlight = false

  get sessionId(): string {
    return this._sessionId
  }

  constructor(
    private readonly client: ClaudeStreamClient,
    initialSessionId: string = '',
  ) {
    this._sessionId = initialSessionId
  }

  async* promptStream(
    content: string | AcpPromptContent[],
    options: AcpPromptStreamOptions = {},
  ): AsyncIterable<CliRuntimeStreamEvent> {
    const signal = options.signal
    if (signal?.aborted)
      return

    if (this.turnInFlight) {
      throw new Error('Claude stream session already has an active turn')
    }
    if (this.client.isClosed()) {
      throw new Error('Claude stream client is closed')
    }

    this.turnInFlight = true

    const eventQueue: CliRuntimeStreamEvent[] = []
    let resolver: (() => void) | null = null
    const state = { finished: false, aborted: false }
    let failure: Error | null = null

    const pendingToolBlocks = new Map<number, PendingToolBlock>()
    const emittedToolCallIds = new Set<string>()
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

    const unsubscribeMessage = this.client.onStreamMessage((msg) => {
      if (state.aborted || state.finished)
        return

      const type = readNonEmptyString(msg.type)
      if (!type)
        return

      const msgSessionId = readNonEmptyString(msg.session_id)
      if (msgSessionId) {
        this._sessionId = msgSessionId
      }

      if (type === 'system') {
        const subtype = readNonEmptyString(msg.subtype)
        if (subtype === 'init') {
          pushEvent({ type: 'status', status: 'init', raw: msg })
        }
        return
      }

      if (type === 'stream_event') {
        const ev = asRecord(msg.event)
        const evType = readNonEmptyString(ev?.type)
        if (!ev || !evType)
          return

        if (evType === 'content_block_start') {
          const index = readFiniteNumber(ev.index)
          const block = asRecord(ev.content_block)
          if (index !== undefined && block && readNonEmptyString(block.type) === 'tool_use') {
            const id = readNonEmptyString(block.id) ?? `tool_${index}`
            const name = readNonEmptyString(block.name) ?? 'tool'
            const initialInput = asRecord(block.input) ?? undefined
            pendingToolBlocks.set(index, {
              id,
              name,
              partialJson: '',
              initialInput,
            })
          }
          return
        }

        if (evType === 'content_block_delta') {
          const delta = asRecord(ev.delta)
          const deltaType = readNonEmptyString(delta?.type)
          if (!delta || !deltaType)
            return

          if (deltaType === 'text_delta') {
            const text = readRawNonEmptyString(delta.text)
            if (text) {
              pushEvent({ type: 'delta', text, raw: msg })
            }
            return
          }

          if (deltaType === 'thinking_delta') {
            const thinking = readRawNonEmptyString(delta.thinking, delta.text)
            if (thinking) {
              pushEvent({ type: 'thinking', text: thinking, raw: msg })
            }
            return
          }

          if (deltaType === 'input_json_delta') {
            const index = readFiniteNumber(ev.index)
            const partial = typeof delta.partial_json === 'string' ? delta.partial_json : ''
            if (index !== undefined && partial) {
              const entry = pendingToolBlocks.get(index)
              if (entry) {
                entry.partialJson += partial
              }
            }
          }
          return
        }

        if (evType === 'content_block_stop') {
          const index = readFiniteNumber(ev.index)
          if (index !== undefined && pendingToolBlocks.has(index)) {
            const entry = pendingToolBlocks.get(index)!
            pendingToolBlocks.delete(index)
            let args: unknown = entry.initialInput ?? {}
            const trimmedJson = entry.partialJson.trim()
            if (trimmedJson) {
              try {
                args = JSON.parse(trimmedJson)
              }
              catch {
                args = { raw: trimmedJson }
              }
            }
            emittedToolCallIds.add(entry.id)
            toolNamesById.set(entry.id, entry.name)
            pushEvent({
              type: 'tool_call',
              toolCall: {
                toolCallId: entry.id,
                toolName: entry.name,
                args,
                status: 'in_progress',
                isError: false,
              },
              raw: msg,
            })
          }
        }
        return
      }

      if (type === 'assistant') {
        // Ignore assistant text/thinking blocks so deltas are never double-printed.
        // Only backfill unseen tool_use blocks.
        const message = asRecord(msg.message)
        const contentBlocks = Array.isArray(message?.content) ? message.content : []
        for (const rawBlock of contentBlocks) {
          const block = asRecord(rawBlock)
          if (!block || readNonEmptyString(block.type) !== 'tool_use')
            continue
          const id = readNonEmptyString(block.id)
          if (!id || emittedToolCallIds.has(id))
            continue
          const name = readNonEmptyString(block.name) ?? 'tool'
          emittedToolCallIds.add(id)
          toolNamesById.set(id, name)
          pushEvent({
            type: 'tool_call',
            toolCall: {
              toolCallId: id,
              toolName: name,
              args: block.input ?? {},
              status: 'in_progress',
              isError: false,
            },
            raw: msg,
          })
        }
        return
      }

      if (type === 'user') {
        const message = asRecord(msg.message)
        const contentBlocks = Array.isArray(message?.content) ? message.content : []
        for (const rawBlock of contentBlocks) {
          const block = asRecord(rawBlock)
          if (!block || readNonEmptyString(block.type) !== 'tool_result')
            continue
          const toolCallId = readNonEmptyString(block.tool_use_id, block.id)
          if (!toolCallId)
            continue
          const toolName = toolNamesById.get(toolCallId) ?? 'tool'
          const isError = block.is_error === true
          pushEvent({
            type: 'tool_result',
            toolCall: {
              toolCallId,
              toolName,
              result: block.content,
              status: isError ? 'error' : 'completed',
              isError,
            },
            raw: msg,
          })
        }
        return
      }

      if (type === 'result') {
        const usage = parseClaudeUsage(msg)
        if (usage) {
          pushEvent({ type: 'usage', usage, raw: msg })
        }
        // Per pi-provider-contracts.md §11.3.2: check `is_error === true`, NEVER `subtype`.
        if (msg.is_error === true) {
          const errorMessage
            = readNonEmptyString(msg.result, msg.error) ?? 'Claude reported an error'
          failStream(new Error(errorMessage))
          return
        }
        finishStream()
      }
    })

    const blocks = formatClaudeUserBlocks(content)
    const writePromise = this.client
      .sendUserMessage(this._sessionId, blocks)
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
        void writePromise.catch(() => undefined)
        return
      }
      await writePromise
      if (failure)
        throw failure
    }
    finally {
      signal?.removeEventListener('abort', onAbort)
      unsubscribeMessage()
      unsubscribeDisconnect()
      this.turnInFlight = false
    }
  }

  async cancel(): Promise<void> {
    if (this.client.isClosed())
      return
    await this.client.sendInterrupt()
  }

  async close(): Promise<void> {
    if (this.turnInFlight && !this.client.isClosed()) {
      await this.cancel().catch(() => undefined)
    }
  }
}

export class ClaudeStreamClient extends EventEmitter implements CliRuntimeClient {
  readonly protocol = 'claude-stream-json' as const
  private nextControlRequestId = 1
  private readonly streamListeners = new Set<(msg: Record<string, unknown>) => void>()
  private readonly disconnectListeners = new Set<(error: Error) => void>()
  private readonly activeControlRequests = new Map<string, AbortController>()

  private rl: readline.Interface | null = null
  private stderrCollector: StderrTailCollector | null = null
  private lifecycle: ProcessLifecycleController | null = null
  private permissionHandler: CliPermissionHandler | null = null
  private mcpConfigPath: string | null = null
  private mcpCleanupPromise: Promise<void> | null = null
  private sessionId = ''
  private closed = false
  private closePromise: Promise<void> | null = null
  private readonly label = 'Claude stream'
  public agentInfo?: AcpAgentInfo = { name: 'claude' }

  constructor(
    private readonly childProcess: ChildProcess,
    options: ClaudeStreamClientOptions = {},
  ) {
    super()
    if (options.onPermission) {
      this.permissionHandler = options.onPermission
    }
    if (options.mcpConfigPath) {
      this.mcpConfigPath = options.mcpConfigPath
    }
    if (options.initialSessionId) {
      this.sessionId = options.initialSessionId
    }
    this.setupProcess()
  }

  isClosed(): boolean {
    return this.closed
  }

  stderrTail(): string {
    return this.stderrCollector?.getTail() ?? ''
  }

  getMcpConfigPath(): string | null {
    return this.mcpConfigPath
  }

  getSessionId(): string {
    return this.sessionId
  }

  setPermissionHandler(handler: CliPermissionHandler | null): void {
    this.permissionHandler = handler
  }

  onStreamMessage(listener: (msg: Record<string, unknown>) => void): () => void {
    this.streamListeners.add(listener)
    return () => {
      this.streamListeners.delete(listener)
    }
  }

  onDisconnect(listener: (error: Error) => void): () => void {
    this.disconnectListeners.add(listener)
    return () => {
      this.disconnectListeners.delete(listener)
    }
  }

  private notifyDisconnect(error: Error): void {
    for (const listener of Array.from(this.disconnectListeners)) {
      listener(error)
    }
    this.disconnectListeners.clear()
  }

  private abortAllControlRequests(): void {
    for (const controller of this.activeControlRequests.values()) {
      controller.abort()
    }
    this.activeControlRequests.clear()
  }

  private cleanupMcpConfigFile(): Promise<void> {
    if (this.mcpCleanupPromise)
      return this.mcpCleanupPromise
    const filePath = this.mcpConfigPath
    if (!filePath)
      return Promise.resolve()
    this.mcpConfigPath = null
    this.mcpCleanupPromise = unlink(filePath).catch(() => undefined)
    return this.mcpCleanupPromise
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
        this.abortAllControlRequests()
        void this.cleanupMcpConfigFile()
        const error = formatProcessExitError(this.label, code, signal, this.stderrTail())
        this.notifyDisconnect(error)
        this.streamListeners.clear()
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
        this.abortAllControlRequests()
        void this.cleanupMcpConfigFile()
        this.notifyDisconnect(error)
        this.streamListeners.clear()
        if (this.listenerCount('error') > 0) {
          this.emit('error', error)
        }
      },
      onStdoutEof: () => {
        if (this.closed)
          return
        const stderr = this.stderrTail()
        const suffix = stderr ? `: ${stderr}` : ''
        const error = new Error(`${this.label} stdout closed before result arrived${suffix}`)
        this.notifyDisconnect(error)
      },
    })
  }

  private writeControlResponse(response: Record<string, unknown>): void {
    if (this.closed)
      return
    tryWriteJsonLine(this.childProcess, {
      type: 'control_response',
      response,
    })
  }

  private handleControlRequest(msg: Record<string, unknown>): void {
    const requestId = readNonEmptyString(msg.request_id)
    if (!requestId) {
      this.emit('protocol_error', new Error('control_request missing request_id'), JSON.stringify(msg))
      return
    }

    const reqBody = asRecord(msg.request)
    const subtype = readNonEmptyString(reqBody?.subtype, msg.subtype)

    if (subtype !== 'can_use_tool') {
      this.writeControlResponse({
        subtype: 'error',
        request_id: requestId,
        error: `Unsupported control_request subtype: ${subtype ?? 'unknown'}`,
      })
      return
    }

    const toolName = readNonEmptyString(reqBody?.tool_name, msg.tool_name) ?? 'tool'
    const toolCallId = readNonEmptyString(reqBody?.tool_use_id, msg.tool_use_id)
    const rawInput = reqBody?.input !== undefined
      ? reqBody.input
      : (msg.input !== undefined ? msg.input : {})
    const inputRecord = asRecord(rawInput) ?? {}
    const riskHint = inferPermissionRiskHint(toolName)

    if (!this.permissionHandler) {
      // Fail closed when no approval handler is wired.
      this.writeControlResponse({
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'deny',
          message: 'Permission denied',
        },
      })
      return
    }

    const controller = new AbortController()
    this.activeControlRequests.set(requestId, controller)

    const permReq: CliPermissionRequest = {
      sessionId: this.sessionId,
      protocol: 'claude-stream-json',
      ...(toolCallId ? { toolCallId } : {}),
      toolName,
      kind: riskHint,
      riskHint,
      summary: readNonEmptyString(reqBody?.description, msg.description) ?? `Claude tool ${toolName}`,
      input: rawInput,
      raw: msg,
    }

    void (async () => {
      try {
        const decision: CliPermissionDecision = await this.permissionHandler!(permReq)
        if (controller.signal.aborted || this.closed)
          return

        if (decision.approved && !decision.cancelled) {
          this.writeControlResponse({
            subtype: 'success',
            request_id: requestId,
            response: {
              behavior: 'allow',
              updatedInput: decision.updatedInput ?? inputRecord,
            },
          })
          return
        }

        this.writeControlResponse({
          subtype: 'success',
          request_id: requestId,
          response: {
            behavior: 'deny',
            message: decision.reason ?? (decision.cancelled ? 'Permission cancelled' : 'Permission denied'),
          },
        })
      }
      catch {
        if (controller.signal.aborted || this.closed)
          return
        // Fail closed on handler throw.
        this.writeControlResponse({
          subtype: 'success',
          request_id: requestId,
          response: {
            behavior: 'deny',
            message: 'Permission denied',
          },
        })
      }
      finally {
        this.activeControlRequests.delete(requestId)
      }
    })()
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = readNonEmptyString(msg.type)
    if (!type)
      return

    const msgSessionId = readNonEmptyString(msg.session_id)
    if (msgSessionId) {
      this.sessionId = msgSessionId
    }

    if (type === 'system' && readNonEmptyString(msg.subtype) === 'init') {
      const version = readNonEmptyString(msg.claude_code_version, msg.version)
      if (version) {
        this.agentInfo = { name: 'claude', version }
      }
    }

    if (type === 'control_request') {
      this.handleControlRequest(msg)
      return
    }

    if (type === 'control_cancel_request') {
      const requestId = readNonEmptyString(msg.request_id)
      if (requestId) {
        const controller = this.activeControlRequests.get(requestId)
        if (controller) {
          controller.abort()
          this.activeControlRequests.delete(requestId)
        }
      }
      return
    }

    for (const listener of Array.from(this.streamListeners)) {
      listener(msg)
    }
  }

  async sendUserMessage(
    sessionId: string,
    blocks: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (this.closed)
      throw new Error(`${this.label} client is closed`)

    await writeJsonLine(
      this.childProcess,
      {
        type: 'user',
        session_id: sessionId || this.sessionId || '',
        message: {
          role: 'user',
          content: blocks,
        },
        parent_tool_use_id: null,
      },
      this.label,
    )
  }

  async sendInterrupt(): Promise<void> {
    if (this.closed)
      return
    const requestId = `tuff_ctrl_${this.nextControlRequestId++}`
    await writeJsonLine(
      this.childProcess,
      {
        type: 'control_request',
        request_id: requestId,
        request: { subtype: 'interrupt' },
      },
      this.label,
    )
  }

  async createSession(options: CliRuntimeSessionOptions): Promise<ClaudeStreamSession> {
    if (this.closed)
      throw new Error(`${this.label} client is closed`)
    const initialSessionId = options.resumeSessionId || this.sessionId
    if (initialSessionId && !this.sessionId) {
      this.sessionId = initialSessionId
    }
    return new ClaudeStreamSession(this, initialSessionId)
  }

  async close(): Promise<void> {
    if (this.closePromise)
      return await this.closePromise

    this.closePromise = (async () => {
      this.closed = true
      this.lifecycle?.markClosed()
      this.abortAllControlRequests()
      const closeErr = new Error(`${this.label} client closed`)
      this.notifyDisconnect(closeErr)
      this.streamListeners.clear()
      const rl = this.rl
      this.rl = null
      await terminateChildProcess(this.childProcess, {
        rl,
        stderrCollector: this.stderrCollector,
      })
      await this.cleanupMcpConfigFile()
    })()

    return await this.closePromise
  }

  static async spawn(options: ClaudeStreamSpawnOptions = {}): Promise<ClaudeStreamClient> {
    const executable = options.executablePath || 'claude'
    const shouldWriteMcpConfig
      = (Array.isArray(options.mcpServers) && options.mcpServers.length > 0)
        || options.strictMcpConfig === true

    let mcpConfigPath: string | null = null
    if (shouldWriteMcpConfig) {
      mcpConfigPath = path.join(os.tmpdir(), `tuff-claude-mcp-${randomUUID()}.json`)
      const configPayload = serializeClaudeMcpConfig(options.mcpServers ?? [])
      await writeFile(mcpConfigPath, JSON.stringify(configPayload), {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      })
    }

    try {
      const args = buildClaudeStreamArgs(options, mcpConfigPath ?? undefined)
      const proc = spawn(executable, args, {
        cwd: options.cwd || process.cwd(),
        env: buildSpawnEnv(options.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const client = new ClaudeStreamClient(proc, {
        onPermission: options.onPermission,
        mcpConfigPath,
        initialSessionId: options.resumeSessionId,
      })

      try {
        await new Promise<void>((resolve, reject) => {
          function cleanup(): void {
            proc.removeListener('spawn', onSpawn)
            proc.removeListener('error', onError)
            proc.removeListener('exit', onExit)
          }
          function onSpawn(): void {
            cleanup()
            resolve()
          }
          function onError(err: Error): void {
            cleanup()
            reject(err)
          }
          function onExit(code: number | null, signal: NodeJS.Signals | null): void {
            cleanup()
            reject(formatProcessExitError('Claude stream', code, signal, client.stderrTail()))
          }
          proc.once('spawn', onSpawn)
          proc.once('error', onError)
          proc.once('exit', onExit)
        })
        return client
      }
      catch (spawnError) {
        await client.close().catch(() => undefined)
        throw spawnError
      }
    }
    catch (error) {
      if (mcpConfigPath) {
        await unlink(mcpConfigPath).catch(() => undefined)
      }
      throw error
    }
  }
}
