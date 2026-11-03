import type { JsonSchema } from '@talex-touch/utils/types/agent'
import type {
  AiAgentProfile,
  AiExecutionBudget,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunRecord,
  AiSessionHistoryMessage
} from '@talex-touch/utils/types/ai-orchestrator'

export const PI_RUNTIME_PROTOCOL_VERSION = 1 as const

/** The utility process name Electron reports for the Pi runtime (Settings › Performance reads it). */
export const PI_RUNTIME_SERVICE_NAME = 'Tuff Pi Agent Runtime'

export interface PiRuntimeToolSpec {
  id: string
  name: string
  description: string
  inputSchema: JsonSchema
}

/** The counters a run's budgets are measured by; they are carried with every logged message. */
export interface PiRuntimeCounters {
  /** Model requests made so far: the next one is `modelSteps + 1`, so tool call ids never repeat. */
  modelSteps: number
  toolCalls: number
  usage: PiRuntimeUsage
  costKnown: boolean
}

/**
 * One entry of a run's message log: an agent message as it ended, with the counters as they stood
 * once it had. The main process stores these encrypted, one per message, and resumes from them.
 */
export interface PiRuntimeRunRecord extends PiRuntimeCounters {
  message: unknown
}

/**
 * How a run that was stopped continues, decided by the main process from the log it kept: the
 * conversation the agent starts from, and the assistant message it replays instead of asking the
 * model again, when that turn's work was not finished.
 */
export interface PiRuntimeResume {
  messages: unknown[]
  replay?: unknown
  counters: PiRuntimeCounters
}

export interface PiRuntimeStartPayload {
  run: AiOrchestratorRunRecord
  request: AiOrchestratorExecuteRequest
  profile: AiAgentProfile
  tools: PiRuntimeToolSpec[]
  history: AiSessionHistoryMessage[]
  budget: AiExecutionBudget
  /** Present only on a run resumed after a restart that had logged at least one tool turn. */
  resume?: PiRuntimeResume
}

export interface PiRuntimeUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cost?: number
}

export interface PiRuntimeModelRequest {
  requestId: string
  runId: string
  step: number
  systemPrompt: string
  messages: unknown[]
  tools: Array<{ name: string; description: string; parameters: unknown }>
  modelPreference: string[]
}

export interface PiRuntimeModelResponse {
  requestId: string
  runId: string
  text?: string
  toolCalls?: Array<{
    id?: string
    name: string
    arguments: Record<string, unknown>
  }>
  usage?: PiRuntimeUsage
  provider?: string
  model?: string
  error?: string
}

export interface PiRuntimeToolRequest {
  requestId: string
  runId: string
  toolCallId: string
  toolId: string
  input: unknown
}

export interface PiRuntimeToolResponse {
  requestId: string
  runId: string
  output?: unknown
  error?: string
}

export interface PiRuntimeRunEvent {
  runId: string
  type: string
  level?: 'debug' | 'info' | 'warn' | 'error'
  payload?: Record<string, unknown>
}

export interface PiRuntimeRunResult {
  runId: string
  output: string
  usage: PiRuntimeUsage
}

export type PiRuntimeParentPayload =
  | { type: 'runtime.ready' }
  | { type: 'runtime.error'; error: string }
  | { type: 'model.request'; payload: PiRuntimeModelRequest }
  | { type: 'tool.request'; payload: PiRuntimeToolRequest }
  | { type: 'run.event'; payload: PiRuntimeRunEvent }
  | { type: 'run.record'; payload: { runId: string; record: PiRuntimeRunRecord } }
  | { type: 'run.completed'; payload: PiRuntimeRunResult }
  | { type: 'run.failed'; runId: string; error: string }
  | { type: 'run.cancelled'; runId: string }

export type PiRuntimeParentMessage = PiRuntimeParentPayload & {
  protocolVersion: typeof PI_RUNTIME_PROTOCOL_VERSION
}

export type PiRuntimeChildPayload =
  | { type: 'run.start'; payload: PiRuntimeStartPayload }
  | { type: 'run.cancel'; runId: string }
  | { type: 'model.response'; payload: PiRuntimeModelResponse }
  | { type: 'tool.response'; payload: PiRuntimeToolResponse }
  | { type: 'runtime.shutdown' }

export type PiRuntimeChildMessage = PiRuntimeChildPayload & {
  protocolVersion: typeof PI_RUNTIME_PROTOCOL_VERSION
}
