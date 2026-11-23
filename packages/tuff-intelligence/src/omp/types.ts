export interface AcpClientInfo {
  name: string
  version: string
}

export interface AcpInitializeParams {
  clientInfo: AcpClientInfo
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

export interface AcpSessionNewParams {
  cwd: string
  mcpServers?: AcpMcpServerConfig[]
  sessionId?: string
}

export interface AcpSessionNewResult {
  sessionId: string
  configOptions?: AcpConfigOption[]
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
    | 'session_info_update'
    | 'config_option_update'
    | 'agent_thought_chunk'
    | 'agent_message_chunk'
    | 'usage_update'
    | 'tool_call'
    | 'tool_call_update'
    | 'tool_result'

export interface AcpSessionUpdateNotification {
  sessionId: string
  update: {
    sessionUpdate: AcpSessionUpdateType
    content?: {
      type: string
      text?: string
      [key: string]: unknown
    }
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

export interface OmpStreamToolCall {
  toolCallId: string
  toolName: string
  args?: unknown
  status?: string
  result?: unknown
  isError?: boolean
}

export interface OmpStreamEvent {
  type: 'thinking' | 'delta' | 'usage' | 'tool_call' | 'tool_result' | 'status'
  text?: string
  usage?: AcpUsageUpdate
  toolCall?: OmpStreamToolCall
  raw?: unknown
}

export interface OmpAcpSpawnOptions {
  executablePath?: string
  cwd?: string
  env?: Record<string, string | undefined>
  initTimeoutMs?: number
  onRequest?: AcpServerRequestHandler
}

export interface OmpPromptStreamOptions {
  signal?: AbortSignal
}

export interface OmpSessionCreateOptions {
  cwd?: string
  model?: string
  mcpServers?: AcpMcpServerConfig[]
}
