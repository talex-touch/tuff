import type { MessageUpdateEvent } from '@talex-touch/pi-desktop-reuse/message-stream'
import type { IntelligenceMessageAttachment } from '../../../types/intelligence'
import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export type ConversationWorkspaceMode = 'chat' | 'agent'
export type ConversationWorkspaceStatus = 'idle' | 'running' | 'pending_approval' | 'interrupted' | 'failed' | 'cancelled'
export type WorkspaceSubmitDisposition = 'started' | 'queued' | 'duplicate'
/**
 * How a pending input enters an active conversation:
 * - `'steer'`: inject into the running agent turn at the next tool/step boundary (falls back to
 *   the front of the next-turn queue if the run ends or pauses before draining it).
 * - `'queue'`: wait until the current turn finishes, then start as the next turn.
 */
export type WorkspaceQueueDeliveryMode = 'steer' | 'queue'

export interface ConversationWorkspaceSettings {
  mode: ConversationWorkspaceMode
  profileId?: string
  providerId?: string
  model?: string
  reasoningEffort?: 'auto' | 'low' | 'medium' | 'high' | 'max'
  autoContext?: boolean
}

/** IDs identify Main-owned copies; no caller-selected filesystem path is a reference. */
export interface WorkspaceAttachmentRef {
  id: string
  /**
   * `audio` is a voice message's recording. It is shown and played, never given to a model: the
   * turn's text is its transcript (see `WorkspaceSubmitRequest.voiceRecordingId`).
   */
  kind: 'image' | 'audio'
  name?: string
  mimeType: string
  size: number
  previewUrl?: string
  /** Audio only: the recording's length. */
  durationMs?: number
}

export interface WorkspaceQueuedInput {
  id: string
  conversationId: string
  text: string
  settings: ConversationWorkspaceSettings
  projectId: string | null
  createdAt: number
  /** Projection only: ordering remains the upstream queue's Main-owned numeric priority. */
  priority?: 'promoted'
  /** Delivery timing when a turn is already running (`'steer'` injects at next tool/step boundary). */
  deliveryMode?: WorkspaceQueueDeliveryMode
  attachments?: WorkspaceAttachmentRef[]
  lead?: { text: string; note: string }
  retryOfMessageId?: string
  answersToolCallId?: string
}

export interface WorkspaceHostMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'complete' | 'streaming' | 'failed'
  meta?: Record<string, unknown>
  parts?: unknown[]
  error?: { code: string; detail: string }
  attachments?: WorkspaceAttachmentRef[]
  seq: number
  createdAt: number
}

export interface WorkspaceContextProjection {
  package?: {
    tokenBudget: number
    tokenEstimate: number
    sourceTypes: string[]
    preparedAt?: number
    turnId: string
    /** Opaque identities of the host's actual context preparation, not native Pi history. */
    sessionId?: string
    packageId?: string
    scope?: string
  }
  compactions?: Array<{
    turnId: string
    phase: 'start' | 'end'
    reason?: string
    ok?: boolean
    at: number
  }>
  checkpoints?: Array<{ id: string; type: string; createdAt?: number; status?: string }>
}

export interface WorkspacePendingRun {
  runId: string
  profileId: string
  approvalReason?: string
  requestedAt: number
}

export interface ConversationWorkspaceState {
  conversationId: string
  projectId: string | null
  /** Authoritative working directory (project root or temporary space) for relative paths and tools. */
  workspaceRoot?: string
  settings: ConversationWorkspaceSettings
  status: ConversationWorkspaceStatus
  activeTurnId?: string
  runId?: string
  queueHeld: boolean
  queue: WorkspaceQueuedInput[]
  messages: WorkspaceHostMessage[]
  pendingRun?: WorkspacePendingRun
  context?: WorkspaceContextProjection
  revision: number
  updatedAt: number
}

/** Only Main's runner applies this projection, never a client endpoint. */
export interface WorkspaceExecutionProjection {
  status?: ConversationWorkspaceStatus
  runId?: string
  pendingRun?: WorkspacePendingRun | null
  context?: WorkspaceContextProjection
}

export interface WorkspaceSubmitRequest {
  conversationId: string
  id: string
  text: string
  settings?: ConversationWorkspaceSettings
  attachments?: IntelligenceMessageAttachment[]
  /**
   * Send this kept recording (`VoiceKeptRecording.id`) as the message's voice. Main copies it into
   * the conversation and the user message shows it; `text` is its transcript, which is what the
   * model reads — no adapter carries audio.
   */
  voiceRecordingId?: string
  create?: { projectId: string | null; title: string }
  lead?: { text: string; note: string }
  retryOfMessageId?: string
  answersToolCallId?: string
  /** Optional delivery timing when submitting while a turn is already running. */
  deliveryMode?: WorkspaceQueueDeliveryMode
}

export interface WorkspaceSubmitResult {
  disposition: WorkspaceSubmitDisposition
  state: ConversationWorkspaceState
}

export interface WorkspaceForkRequest {
  conversationId: string
  messageId?: string
  mode?: ConversationWorkspaceMode
  /** Applied only to the child; the source conversation keeps its settings. */
  profileId?: string
}

export interface WorkspaceRunDecisionRequest {
  conversationId: string
  runId: string
}

export interface WorkspaceUpdateQueuedRequest {
  conversationId: string
  queueId: string
  text?: string
  deliveryMode?: WorkspaceQueueDeliveryMode
  attachments?: IntelligenceMessageAttachment[]
  keptAttachmentIds?: string[]
}

export interface WorkspaceMessageUpdate {
  conversationId: string
  turnId: string
  seq: number
  update: MessageUpdateEvent
}

export interface WorkspaceFileEntry {
  name: string
  path: string
  isDirectory: boolean
  size?: number
}

export interface WorkspaceReadFileRequest {
  path: string
  conversationId?: string | null
  maxBytes?: number
}

export interface WorkspaceReadFileResult {
  path: string
  name: string
  ext: string
  kind: 'text' | 'image' | 'pdf' | 'directory' | 'binary'
  mimeType: string
  size: number
  truncated: boolean
  mtimeMs: number
  text?: string
  base64?: string
  entries?: WorkspaceFileEntry[]
}

export interface WorkspacePickFileRequest {
  conversationId?: string | null
  defaultPath?: string
}

export interface WorkspacePickFileResult {
  path: string | null
}

export interface WorkspaceOpenFileExternalRequest {
  path: string
  conversationId?: string | null
}

export interface WorkspaceOpenFileExternalResult {
  opened: boolean
  revealed?: boolean
}

export const AgentWorkspaceEvents = {
  get: defineEvent('agent-workspace').module('api').event('get').define<{ conversationId: string }, ConversationWorkspaceState | null>(),
  configure: defineEvent('agent-workspace').module('api').event('configure').define<{ conversationId: string; settings: ConversationWorkspaceSettings }, ConversationWorkspaceState>(),
  submit: defineEvent('agent-workspace').module('api').event('submit').define<WorkspaceSubmitRequest, WorkspaceSubmitResult>(),
  pause: defineEvent('agent-workspace').module('api').event('pause').define<{ conversationId: string }, ConversationWorkspaceState>(),
  resume: defineEvent('agent-workspace').module('api').event('resume').define<{ conversationId: string }, ConversationWorkspaceState>(),
  removeQueued: defineEvent('agent-workspace').module('api').event('queue:remove').define<{ conversationId: string; queueId: string }, ConversationWorkspaceState>(),
  reorderQueued: defineEvent('agent-workspace').module('api').event('queue:reorder').define<{ conversationId: string; queueId: string; direction: 'up' | 'down' }, ConversationWorkspaceState>(),
  promoteQueued: defineEvent('agent-workspace').module('api').event('queue:promote').define<{ conversationId: string; queueId: string }, ConversationWorkspaceState>(),
  updateQueued: defineEvent('agent-workspace').module('api').event('queue:update').define<WorkspaceUpdateQueuedRequest, ConversationWorkspaceState>(),
  fork: defineEvent('agent-workspace').module('api').event('fork').define<WorkspaceForkRequest, ConversationWorkspaceState>(),
  approveRun: defineEvent('agent-workspace').module('api').event('run:approve').define<WorkspaceRunDecisionRequest, ConversationWorkspaceState>(),
  rejectRun: defineEvent('agent-workspace').module('api').event('run:reject').define<WorkspaceRunDecisionRequest, ConversationWorkspaceState>(),
  readFile: defineEvent('agent-workspace').module('api').event('file:read').define<WorkspaceReadFileRequest, WorkspaceReadFileResult>(),
  pickFile: defineEvent('agent-workspace').module('api').event('file:pick').define<WorkspacePickFileRequest, WorkspacePickFileResult>(),
  openFileExternal: defineEvent('agent-workspace').module('api').event('file:open-external').define<WorkspaceOpenFileExternalRequest, WorkspaceOpenFileExternalResult>(),
  changed: defineEvent('agent-workspace').module('push').event('changed').define<ConversationWorkspaceState, void>(),
  messageUpdate: defineEvent('agent-workspace').module('push').event('message:update').define<WorkspaceMessageUpdate, void>()
} as const

export interface AgentWorkspaceSdk {
  get: (conversationId: string) => Promise<ConversationWorkspaceState | null>
  configure: (conversationId: string, settings: ConversationWorkspaceSettings) => Promise<ConversationWorkspaceState>
  submit: (request: WorkspaceSubmitRequest) => Promise<WorkspaceSubmitResult>
  pause: (conversationId: string) => Promise<ConversationWorkspaceState>
  resume: (conversationId: string) => Promise<ConversationWorkspaceState>
  removeQueued: (conversationId: string, queueId: string) => Promise<ConversationWorkspaceState>
  reorderQueued: (conversationId: string, queueId: string, direction: 'up' | 'down') => Promise<ConversationWorkspaceState>
  promoteQueued: (conversationId: string, queueId: string) => Promise<ConversationWorkspaceState>
  updateQueued: (request: WorkspaceUpdateQueuedRequest) => Promise<ConversationWorkspaceState>
  fork: (request: WorkspaceForkRequest) => Promise<ConversationWorkspaceState>
  approveRun: (request: WorkspaceRunDecisionRequest) => Promise<ConversationWorkspaceState>
  rejectRun: (request: WorkspaceRunDecisionRequest) => Promise<ConversationWorkspaceState>
  readFile: (request: WorkspaceReadFileRequest) => Promise<WorkspaceReadFileResult>
  pickFile: (request?: WorkspacePickFileRequest) => Promise<WorkspacePickFileResult>
  openFileExternal: (request: WorkspaceOpenFileExternalRequest) => Promise<WorkspaceOpenFileExternalResult>
  onChanged: (listener: (state: ConversationWorkspaceState) => void) => () => void
  onMessageUpdate: (listener: (update: WorkspaceMessageUpdate) => void) => () => void
}

export function createAgentWorkspaceSdk(transport: Pick<ITuffTransport, 'send' | 'on'>): AgentWorkspaceSdk {
  return {
    get: conversationId => transport.send(AgentWorkspaceEvents.get, { conversationId }),
    configure: (conversationId, settings) => transport.send(AgentWorkspaceEvents.configure, { conversationId, settings }),
    submit: request => transport.send(AgentWorkspaceEvents.submit, request),
    pause: conversationId => transport.send(AgentWorkspaceEvents.pause, { conversationId }),
    resume: conversationId => transport.send(AgentWorkspaceEvents.resume, { conversationId }),
    removeQueued: (conversationId, queueId) => transport.send(AgentWorkspaceEvents.removeQueued, { conversationId, queueId }),
    reorderQueued: (conversationId, queueId, direction) => transport.send(AgentWorkspaceEvents.reorderQueued, { conversationId, queueId, direction }),
    promoteQueued: (conversationId, queueId) => transport.send(AgentWorkspaceEvents.promoteQueued, { conversationId, queueId }),
    updateQueued: request => transport.send(AgentWorkspaceEvents.updateQueued, request),
    fork: request => transport.send(AgentWorkspaceEvents.fork, request),
    approveRun: request => transport.send(AgentWorkspaceEvents.approveRun, request),
    rejectRun: request => transport.send(AgentWorkspaceEvents.rejectRun, request),
    readFile: request => transport.send(AgentWorkspaceEvents.readFile, request),
    pickFile: request => transport.send(AgentWorkspaceEvents.pickFile, request ?? {}),
    openFileExternal: request => transport.send(AgentWorkspaceEvents.openFileExternal, request),
    onChanged: listener => transport.on(AgentWorkspaceEvents.changed, listener),
    onMessageUpdate: listener => transport.on(AgentWorkspaceEvents.messageUpdate, listener)
  }
}
