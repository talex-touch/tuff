import type { AiCliProviderId } from '../../types/ai-orchestrator'
import { defineEvent } from '../event/builder'

export type LocalAiCliProviderId = Extract<AiCliProviderId, 'pi' | 'codex' | 'claude' | 'oh-my-pi'>

export type LocalAiCliMode = 'task' | 'terminal'
export type LocalAiCliAccess = 'answer-only' | 'workspace-read' | 'workspace-write'
export type LocalAiCliContextKind = 'selection' | 'clipboard' | 'active-app' | 'active-window'

export const LOCAL_AI_CLI_LIMITS = Object.freeze({
  promptChars: 32_768,
  resultChars: 50_000,
  approvalSummaryChars: 500,
  contextItems: 3,
  contextChars: 16_384,
  terminalInputChars: 16_384,
  terminalChunkChars: 65_536,
  terminalCols: 400,
  terminalRows: 200,
})

export interface LocalAiCliContextItem {
  kind: LocalAiCliContextKind
  text: string
}

export interface LocalAiCliStartRequest {
  provider: LocalAiCliProviderId
  prompt: string
  access: LocalAiCliAccess
  context: LocalAiCliContextItem[]
  workspaceRef?: string
}

export type LocalAiCliErrorCode =
  | 'BETA_UNAVAILABLE'
  | 'FEATURE_DISABLED'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_VERSION_UNSUPPORTED'
  | 'WRITE_APPROVAL_UNAVAILABLE'
  | 'WORKSPACE_INVALID'
  | 'PROCESS_START_FAILED'
  | 'PROTOCOL_INVALID'
  | 'PROCESS_EXITED'
  | 'CANCELLED'
  | 'INTERNAL_ERROR'

export interface LocalAiCliApprovalRequest {
  approvalId: string
  callId: string
  provider: LocalAiCliProviderId
  toolName: string
  operation: 'read' | 'write' | 'command' | 'network' | 'other'
  summary: string
  expiresAt: number
}

export interface LocalAiCliApprovalDecision {
  approvalId: string
  decision: 'allow-once' | 'deny'
}

export interface LocalAiCliPasteBackRequest {
  text: string
  appName: string
  windowTitle?: string
  capturedAt: number
}

export interface LocalAiCliPasteBackResult {
  success: boolean
  reason?: 'target-unavailable' | 'target-drift' | 'capture-expired' | 'unsupported'
}

export type LocalAiCliTaskChunk =
  | {
      type: 'session'
      callId: string
      provider: LocalAiCliProviderId
      nativeSessionId?: string
    }
  | {
      type: 'status'
      callId: string
      status: 'starting' | 'running' | 'waiting-approval'
    }
  | { type: 'text-delta'; callId: string; text: string }
  | { type: 'approval'; callId: string; approval: LocalAiCliApprovalRequest }
  | { type: 'complete'; callId: string; text: string }
  | {
      type: 'failed'
      callId: string
      code: LocalAiCliErrorCode
      recoverable: boolean
    }
  | { type: 'cancelled'; callId: string }

export interface LocalAiCliProviderCapabilities {
  taskRead: boolean
  taskWriteApproval: boolean
  terminalRead: boolean
  terminalWriteApproval: boolean
  resume: boolean
}

export interface LocalAiCliProviderStatus {
  id: LocalAiCliProviderId
  label: string
  enabled: boolean
  installed: boolean
  version?: string
  executablePath?: string
  issueCode?: LocalAiCliErrorCode
  capabilities: LocalAiCliProviderCapabilities
}

export interface LocalAiCliStatus {
  betaAvailable: boolean
  enabled: boolean
  defaultProvider: LocalAiCliProviderId | null
  providers: LocalAiCliProviderStatus[]
}

export interface LocalAiCliLocateRequest {
  provider: LocalAiCliProviderId
}

export interface LocalAiCliTerminalCreateRequest {
  provider: LocalAiCliProviderId
  access: LocalAiCliAccess
  cols: number
  rows: number
  nativeSessionId?: string
  workspaceRef?: string
}

export interface LocalAiCliTerminalCreateResult {
  sessionId: string
}

export interface LocalAiCliTerminalWriteRequest {
  sessionId: string
  data: string
}

export interface LocalAiCliTerminalResizeRequest {
  sessionId: string
  cols: number
  rows: number
}

export interface LocalAiCliTerminalKillRequest {
  sessionId: string
}

export interface LocalAiCliTerminalData {
  sessionId: string
  data: string
}

export interface LocalAiCliTerminalExit {
  sessionId: string
  exitCode: number
  signal?: number
}

const PROVIDERS = new Set<LocalAiCliProviderId>(['pi', 'codex', 'claude', 'oh-my-pi'])
const ACCESS = new Set<LocalAiCliAccess>(['answer-only', 'workspace-read', 'workspace-write'])
const CONTEXT_KINDS = new Set<LocalAiCliContextKind>(['selection', 'clipboard', 'active-app', 'active-window'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function boundedText(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') throw new Error(`LOCAL_AI_CLI_${field}_INVALID`)
  const text = value.trim()
  if (!text || text.length > max) throw new Error(`LOCAL_AI_CLI_${field}_INVALID`)
  return text
}

export function normalizeLocalAiCliStartRequest(value: unknown): LocalAiCliStartRequest {
  if (!isRecord(value)) throw new Error('LOCAL_AI_CLI_REQUEST_INVALID')
  if (!PROVIDERS.has(value.provider as LocalAiCliProviderId)) {
    throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
  }
  if (!ACCESS.has(value.access as LocalAiCliAccess)) {
    throw new Error('LOCAL_AI_CLI_ACCESS_INVALID')
  }
  if (!Array.isArray(value.context) || value.context.length > LOCAL_AI_CLI_LIMITS.contextItems) {
    throw new Error('LOCAL_AI_CLI_CONTEXT_INVALID')
  }
  const context = value.context.map(item => {
    if (!isRecord(item) || !CONTEXT_KINDS.has(item.kind as LocalAiCliContextKind)) {
      throw new Error('LOCAL_AI_CLI_CONTEXT_INVALID')
    }
    return {
      kind: item.kind as LocalAiCliContextKind,
      text: boundedText(item.text, LOCAL_AI_CLI_LIMITS.contextChars, 'CONTEXT'),
    }
  })
  const workspaceRef = value.workspaceRef
  if (workspaceRef !== undefined && (typeof workspaceRef !== 'string' || !workspaceRef.trim())) {
    throw new Error('LOCAL_AI_CLI_WORKSPACE_INVALID')
  }
  return {
    provider: value.provider as LocalAiCliProviderId,
    prompt: boundedText(value.prompt, LOCAL_AI_CLI_LIMITS.promptChars, 'PROMPT'),
    access: value.access as LocalAiCliAccess,
    context,
    ...(typeof workspaceRef === 'string' ? { workspaceRef: workspaceRef.trim() } : {}),
  }
}

export function normalizeLocalAiCliApprovalDecision(value: unknown): LocalAiCliApprovalDecision {
  if (!isRecord(value) || typeof value.approvalId !== 'string') {
    throw new Error('LOCAL_AI_CLI_APPROVAL_INVALID')
  }
  if (value.decision !== 'allow-once' && value.decision !== 'deny') {
    throw new Error('LOCAL_AI_CLI_APPROVAL_INVALID')
  }
  return { approvalId: value.approvalId, decision: value.decision }
}

export const LocalAiCliEvents = {
  status: {
    get: defineEvent('local-ai-cli').module('status').event('get').define<void, LocalAiCliStatus>(),
    locate: defineEvent('local-ai-cli')
      .module('status')
      .event('locate')
      .define<LocalAiCliLocateRequest, LocalAiCliProviderStatus>(),
    openSettings: defineEvent('local-ai-cli').module('status').event('open-settings').define<void, boolean>(),
    returnToPanel: defineEvent('local-ai-cli').module('status').event('return-to-panel').define<void, boolean>(),
  },
  task: {
    stream: defineEvent('local-ai-cli')
      .module('task')
      .event('stream')
      .define<LocalAiCliStartRequest, AsyncIterable<LocalAiCliTaskChunk>>({
        stream: { enabled: true, bufferSize: 100 },
      }),
    approval: defineEvent('local-ai-cli').module('task').event('approval').define<LocalAiCliApprovalDecision, void>(),
    pasteBack: defineEvent('local-ai-cli')
      .module('task')
      .event('paste-back')
      .define<LocalAiCliPasteBackRequest, LocalAiCliPasteBackResult>(),
  },
  terminal: {
    create: defineEvent('local-ai-cli')
      .module('terminal')
      .event('create')
      .define<LocalAiCliTerminalCreateRequest, LocalAiCliTerminalCreateResult>(),
    write: defineEvent('local-ai-cli').module('terminal').event('write').define<LocalAiCliTerminalWriteRequest, void>(),
    resize: defineEvent('local-ai-cli')
      .module('terminal')
      .event('resize')
      .define<LocalAiCliTerminalResizeRequest, void>(),
    kill: defineEvent('local-ai-cli').module('terminal').event('kill').define<LocalAiCliTerminalKillRequest, void>(),
    data: defineEvent('local-ai-cli').module('terminal').event('data').define<LocalAiCliTerminalData, void>(),
    exit: defineEvent('local-ai-cli').module('terminal').event('exit').define<LocalAiCliTerminalExit, void>(),
  },
} as const
