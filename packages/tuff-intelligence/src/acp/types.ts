export interface AcpClientInfo {
  name: string
  version: string
  title?: string
}

export interface AcpInitializeParams {
  clientInfo: AcpClientInfo
  protocolVersion?: number
  clientCapabilities?: Record<string, unknown>
}

export interface AcpAgentInfo {
  name: string
  title?: string
  version?: string
}

export interface AcpInitializeResult {
  protocolVersion: number
  agentInfo: AcpAgentInfo
  authMethods?: Array<{
    id: string
    name: string
    description?: string
  }>
  agentCapabilities?: {
    loadSession?: boolean
    mcpCapabilities?: {
      http?: boolean
      sse?: boolean
    }
    promptCapabilities?: {
      embeddedContext?: boolean
      image?: boolean
    }
    sessionCapabilities?: {
      list?: Record<string, unknown>
      fork?: Record<string, unknown>
      resume?: Record<string, unknown>
      close?: Record<string, unknown>
    }
  }
}

export interface AcpConfigOption {
  id: string
  name: string
  category?: string
  type: 'select' | 'boolean' | 'text'
  currentValue: string | boolean
  options?: Array<{
    value: string
    name: string
    description?: string
  }>
}

export interface AcpKeyValueHeader {
  name: string
  value: string
}

export interface AcpMcpServerConfig {
  name: string
  type?: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string> | AcpKeyValueHeader[]
  url?: string
  headers?: Record<string, string> | AcpKeyValueHeader[]
}

export interface AcpSessionMode {
  id: string
  name?: string
  description?: string
}

export interface AcpSessionModeState {
  currentModeId?: string
  availableModes: AcpSessionMode[]
}

export interface AcpSessionNewParams {
  cwd: string
  mcpServers?: AcpMcpServerConfig[]
  sessionId?: string
  _meta?: Record<string, unknown>
}

export interface AcpSessionNewResult {
  sessionId: string
  configOptions?: AcpConfigOption[]
  modes?: AcpSessionModeState
}

export interface AcpSessionLoadParams {
  sessionId: string
  cwd: string
  mcpServers?: AcpMcpServerConfig[]
  _meta?: Record<string, unknown>
}

export interface AcpSessionLoadResult {
  sessionId?: string
  configOptions?: AcpConfigOption[]
  modes?: AcpSessionModeState
}

export interface AcpSetConfigOptionParams {
  sessionId: string
  configId: string
  value: string | boolean
}

export interface AcpPromptContent {
  type: 'text' | 'image' | 'embedded_context'
  text?: string
  data?: string
  mimeType?: string
}

export interface AcpSessionPromptParams {
  sessionId: string
  prompt: AcpPromptContent[]
}

export interface AcpUsageUpdate {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  cost?: {
    input?: number
    output?: number
    total?: number
  }
}

export type AcpSessionUpdateType
  = | 'available_commands_update'
    | 'current_mode_update'
    | 'session_info_update'
    | 'config_option_update'
    | 'agent_thought_chunk'
    | 'agent_message_chunk'
    | 'user_message_chunk'
    | 'plan'
    | 'usage_update'
    | 'tool_call'
    | 'tool_call_update'
    | 'tool_result'
    | (string & {})

export interface AcpSessionUpdateNotification {
  sessionId: string
  update: {
    sessionUpdate: AcpSessionUpdateType
    content?:
      | {
          type: string
          text?: string
          [key: string]: unknown
        }
      | Array<{
          type?: string
          text?: string
          [key: string]: unknown
        }>
    configOptions?: AcpConfigOption[]
    usage?: AcpUsageUpdate
    [key: string]: unknown
  }
}

export interface AcpPromptResult {
  stopReason?: string
  usage?: AcpUsageUpdate
}

export interface AcpPermissionOption {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string
}

export interface AcpPermissionRequestParams {
  sessionId: string
  toolCall?: {
    toolCallId?: string
    title?: string
    kind?: string
    status?: string
    rawInput?: unknown
    [key: string]: unknown
  }
  options?: AcpPermissionOption[]
  [key: string]: unknown
}

export interface AcpPermissionRequestResult {
  outcome:
    | { outcome: 'cancelled' }
    | { outcome: 'selected', optionId: string }
}

export type AcpServerRequestHandler = (
  method: string,
  params: unknown,
) => unknown | Promise<unknown>

export interface AcpPromptStreamOptions {
  signal?: AbortSignal
}

export interface AcpSessionCreateOptions {
  cwd?: string
  model?: string
  systemPrompt?: string
  reasoningEffort?: string
  mcpServers?: AcpMcpServerConfig[]
  permissionMode?: 'review' | 'full'
  resumeSessionId?: string
  _meta?: Record<string, unknown>
}

export const CLI_RUNTIME_KINDS = [
  'omp',
  'codex',
  'claude',
  'antigravity',
  'opencode',
  'gemini',
  'kiro',
  'cursor',
] as const

export type CliRuntimeKind = (typeof CLI_RUNTIME_KINDS)[number]
export type CliRuntimeProtocol = 'acp' | 'codex-app-server' | 'claude-stream-json'
export type CliPermissionRiskKind = 'read' | 'write' | 'execute'

export interface CliRuntimeToolCall {
  toolCallId: string
  toolName: string
  args?: unknown
  status?: string
  result?: unknown
  isError?: boolean
}

export type CliRuntimeStreamEvent
  = | { type: 'thinking', text: string, raw?: unknown }
    | { type: 'delta', text: string, raw?: unknown }
    | { type: 'tool_call', toolCall: CliRuntimeToolCall, raw?: unknown }
    | { type: 'tool_result', toolCall: CliRuntimeToolCall, raw?: unknown }
    | { type: 'usage', usage: AcpUsageUpdate, raw?: unknown }
    | { type: 'status', status?: string, raw?: unknown }

export interface CliPermissionRequest {
  sessionId: string
  protocol: CliRuntimeProtocol
  toolCallId?: string
  toolName: string
  kind?: string
  riskHint?: CliPermissionRiskKind
  summary?: string
  input?: unknown
  acpOptions?: AcpPermissionOption[]
  raw?: unknown
}

export interface CliPermissionDecision {
  approved: boolean
  remember?: boolean
  updatedInput?: Record<string, unknown>
  reason?: string
  cancelled?: boolean
}

export type CliPermissionHandler = (
  req: CliPermissionRequest,
) => CliPermissionDecision | Promise<CliPermissionDecision>

export interface CliRuntimeSessionOptions {
  cwd: string
  model?: string
  systemPrompt?: string
  reasoningEffort?: string
  mcpServers?: AcpMcpServerConfig[]
  permissionMode?: 'review' | 'full'
  resumeSessionId?: string
  _meta?: Record<string, unknown>
}

export interface CliRuntimeSession {
  readonly sessionId: string
  readonly protocol: CliRuntimeProtocol
  readonly lastStopReason?: string
  readonly modes?: AcpSessionModeState
  promptStream(
    content: string | AcpPromptContent[],
    options?: AcpPromptStreamOptions,
  ): AsyncIterable<CliRuntimeStreamEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

export interface CliRuntimeClient {
  readonly protocol: CliRuntimeProtocol
  readonly agentInfo?: AcpAgentInfo
  isClosed(): boolean
  stderrTail(): string
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'protocol_error', listener: (error: unknown, rawLine: string) => void): this
  createSession(options: CliRuntimeSessionOptions): Promise<CliRuntimeSession>
  close(): Promise<void>
}

export interface AcpSpawnOptions {
  executablePath: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  clientInfo?: AcpClientInfo
  protocolVersion?: number
  clientCapabilities?: Record<string, unknown>
  initTimeoutMs?: number
  onRequest?: AcpServerRequestHandler
  onPermission?: CliPermissionHandler
  label?: string
}

export interface CodexAppServerSpawnOptions {
  executablePath?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  mcpServers?: AcpMcpServerConfig[]
  strictMcpServers?: boolean
  initTimeoutMs?: number
  onPermission?: CliPermissionHandler
}

export type ClaudePermissionMode = 'manual' | 'plan' | 'acceptEdits' | 'dontAsk'

export interface ClaudeStreamSpawnOptions {
  executablePath?: string
  cwd?: string
  env?: Record<string, string | undefined>
  model?: string
  systemPrompt?: string
  reasoningEffort?: string
  mcpServers?: AcpMcpServerConfig[]
  strictMcpConfig?: boolean
  resumeSessionId?: string
  permissionMode?: ClaudePermissionMode
  extraArgs?: string[]
  onPermission?: CliPermissionHandler
}
