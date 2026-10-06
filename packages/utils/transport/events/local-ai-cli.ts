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
  projectId?: string
  sessionRef?: string
}

export type LocalAiCliErrorCode
  = | 'BETA_UNAVAILABLE'
    | 'FEATURE_DISABLED'
    | 'PROVIDER_DISABLED'
    | 'PROVIDER_UNAVAILABLE'
    | 'NOT_PROBED'
    | 'PROVIDER_VERSION_UNSUPPORTED'
    | 'WRITE_APPROVAL_UNAVAILABLE'
    | 'PROVIDER_RESUME_UNSUPPORTED'
    | 'NATIVE_SESSION_BUSY'
    | 'NATIVE_SESSION_MISSING'
    | 'NATIVE_SESSION_CONFLICT'
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

export type LocalAiCliTaskChunk
  = | {
    type: 'session'
    callId: string
    provider: LocalAiCliProviderId
    sessionRef: string
  }
  | {
    type: 'status'
    callId: string
    status: 'starting' | 'running' | 'waiting-approval'
  }
  | { type: 'text-delta', callId: string, text: string }
  | { type: 'approval', callId: string, approval: LocalAiCliApprovalRequest }
  | { type: 'complete', callId: string, text: string }
  | {
    type: 'failed'
    callId: string
    code: LocalAiCliErrorCode
    recoverable: boolean
  }
  | { type: 'cancelled', callId: string }

export interface LocalAiCliProviderCapabilities {
  taskRead: boolean
  taskWriteApproval: boolean
  terminalRead: boolean
  terminalWriteApproval: boolean
  taskResume: boolean
  terminalResume: boolean
}

export interface LocalAiCliProviderStatus {
  id: LocalAiCliProviderId
  label: string
  enabled: boolean
  installed: boolean
  version?: string
  /** The path the CLI was found at and is run by, as found (not its realpath). */
  executablePath?: string
  /**
   * Why `installed` is false. `NOT_PROBED` means the CLI was not looked for at all (the master
   * switch is off and the request did not ask for `detail`), so it says nothing about the machine.
   */
  issueCode?: LocalAiCliErrorCode
  /**
   * The program picked in Settings (「选择程序」) is not an executable file (moved, uninstalled, or
   * an app bundle), so the lookup went on without it: `executablePath`, when there is one, was
   * found automatically.
   */
  settingsOverrideRejected?: boolean
  capabilities: LocalAiCliProviderCapabilities
}

export interface LocalAiCliStatus {
  /**
   * This platform offers local agents (a macOS Beta). It is not the user's consent: that is
   * `enabled`, the master switch in Settings, which every entry point other than Settings also
   * requires. Off this platform every provider reads `BETA_UNAVAILABLE` and nothing is probed.
   */
  betaAvailable: boolean
  enabled: boolean
  defaultProvider: LocalAiCliProviderId | null
  providers: LocalAiCliProviderStatus[]
}

export interface LocalAiCliStatusRequest {
  /**
   * Look for the CLIs and ask each its version even while the master switch is off. Settings asks
   * for this: it is where the user sees what is installed and decides whether to turn local agents
   * on. Every other entry only needs `enabled`; with the switch off it gets each provider as
   * `NOT_PROBED`, and no CLI is run for it.
   */
  detail?: boolean
  /**
   * Drop the memoised lookups and `--version` answers and probe every CLI again (「重新探测」).
   * Implies `detail`. Without it the status is answered from memory, so opening a menu costs no CLI
   * process.
   */
  refresh?: boolean
}

export interface LocalAiCliLocateRequest {
  provider: LocalAiCliProviderId
}

export interface LocalAiCliTerminalCreateRequest {
  provider: LocalAiCliProviderId
  access: LocalAiCliAccess
  cols: number
  rows: number
  projectId?: string
  sessionRef?: string
  /** SDK-issued internal cancellation correlation, never caller ownership. */
  creationToken?: string
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

export type LocalAiCliTerminalKillRequest =
  | { sessionId: string, creationToken?: never }
  | { creationToken: string, sessionId?: never }

export interface LocalAiCliTerminalData {
  sessionId: string
  data: string
}

export interface LocalAiCliTerminalExit {
  sessionId: string
  exitCode: number | null
  signal?: number
}

export type LocalAiCliSessionState = 'available' | 'missing' | 'conflict'
export type LocalAiCliSessionOrigin = 'tuff' | 'discovered'

export interface LocalAiCliSessionSummary {
  sessionRef: string
  projectId: string | null
  provider: LocalAiCliProviderId
  title: string
  state: LocalAiCliSessionState
  origin: LocalAiCliSessionOrigin
  createdAt: number
  updatedAt: number
  lastSeenAt: number
}

export interface LocalAiCliSessionChanged {
  sessionRef: string
  projectId: string | null
  type: 'upsert' | 'forget'
}

export interface LocalAiCliSessionDiscoveryResult {
  discovered: number
  skipped: number
  incomplete: boolean
}

const PROVIDERS = new Set<LocalAiCliProviderId>(['pi', 'codex', 'claude', 'oh-my-pi'])
const ACCESS = new Set<LocalAiCliAccess>(['answer-only', 'workspace-read', 'workspace-write'])
const CONTEXT_KINDS = new Set<LocalAiCliContextKind>(['selection', 'clipboard', 'active-app', 'active-window'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function boundedText(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string')
    throw new Error(`LOCAL_AI_CLI_${field}_INVALID`)
  const text = value.trim()
  if (!text || text.length > max)
    throw new Error(`LOCAL_AI_CLI_${field}_INVALID`)
  return text
}

function optionalOpaqueId(value: unknown, code: string): string | undefined {
  if (value === undefined)
    return undefined
  if (typeof value !== 'string' || !/^[A-Z0-9-]{1,128}$/i.test(value)) {
    throw new Error(code)
  }
  return value
}

export function normalizeLocalAiCliProjectId(value: unknown): string | undefined {
  return optionalOpaqueId(value, 'LOCAL_AI_CLI_PROJECT_INVALID')
}

export function normalizeLocalAiCliSessionRef(value: unknown): string | undefined {
  return optionalOpaqueId(value, 'LOCAL_AI_CLI_SESSION_INVALID')
}

export function normalizeLocalAiCliStartRequest(value: unknown): LocalAiCliStartRequest {
  if (!isRecord(value))
    throw new Error('LOCAL_AI_CLI_REQUEST_INVALID')
  if (!PROVIDERS.has(value.provider as LocalAiCliProviderId)) {
    throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
  }
  if (!ACCESS.has(value.access as LocalAiCliAccess)) {
    throw new Error('LOCAL_AI_CLI_ACCESS_INVALID')
  }
  if (!Array.isArray(value.context) || value.context.length > LOCAL_AI_CLI_LIMITS.contextItems) {
    throw new Error('LOCAL_AI_CLI_CONTEXT_INVALID')
  }
  const context = value.context.map((item) => {
    if (!isRecord(item) || !CONTEXT_KINDS.has(item.kind as LocalAiCliContextKind)) {
      throw new Error('LOCAL_AI_CLI_CONTEXT_INVALID')
    }
    return {
      kind: item.kind as LocalAiCliContextKind,
      text: boundedText(item.text, LOCAL_AI_CLI_LIMITS.contextChars, 'CONTEXT'),
    }
  })
  const projectId = normalizeLocalAiCliProjectId(value.projectId)
  const sessionRef = normalizeLocalAiCliSessionRef(value.sessionRef)
  return {
    provider: value.provider as LocalAiCliProviderId,
    prompt: boundedText(value.prompt, LOCAL_AI_CLI_LIMITS.promptChars, 'PROMPT'),
    access: value.access as LocalAiCliAccess,
    context,
    ...(projectId ? { projectId } : {}),
    ...(sessionRef ? { sessionRef } : {}),
  }
}

export function normalizeLocalAiCliTerminalCreateRequest(
  value: unknown,
): LocalAiCliTerminalCreateRequest {
  if (!isRecord(value))
    throw new Error('LOCAL_AI_CLI_REQUEST_INVALID')
  if (!PROVIDERS.has(value.provider as LocalAiCliProviderId)) {
    throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
  }
  if (!ACCESS.has(value.access as LocalAiCliAccess)) {
    throw new Error('LOCAL_AI_CLI_ACCESS_INVALID')
  }
  const projectId = normalizeLocalAiCliProjectId(value.projectId)
  const sessionRef = normalizeLocalAiCliSessionRef(value.sessionRef)
  if (value.creationToken !== undefined && typeof value.creationToken !== 'string') {
    throw new Error('LOCAL_AI_CLI_REQUEST_INVALID')
  }
  return {
    provider: value.provider as LocalAiCliProviderId,
    access: value.access as LocalAiCliAccess,
    cols: typeof value.cols === 'number' ? value.cols : 0,
    rows: typeof value.rows === 'number' ? value.rows : 0,
    ...(projectId ? { projectId } : {}),
    ...(sessionRef ? { sessionRef } : {}),
    ...(typeof value.creationToken === 'string' ? { creationToken: value.creationToken } : {}),
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
    get: defineEvent('local-ai-cli')
      .module('status')
      .event('get')
      .define<LocalAiCliStatusRequest | undefined, LocalAiCliStatus>(),
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
  session: {
    list: defineEvent('local-ai-cli')
      .module('session')
      .event('list')
      .define<{ projectId?: string | null } | undefined, LocalAiCliSessionSummary[]>(),
    discover: defineEvent('local-ai-cli')
      .module('session')
      .event('discover')
      .define<{ projectId: string }, LocalAiCliSessionDiscoveryResult>(),
    forget: defineEvent('local-ai-cli')
      .module('session')
      .event('forget')
      .define<{ sessionRef: string }, { forgotten: boolean }>(),
    changed: defineEvent('local-ai-cli')
      .module('session')
      .event('changed')
      .define<LocalAiCliSessionChanged, void>(),
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
