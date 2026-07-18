import type { JsonSchema } from '@talex-touch/utils/types/agent'
import type {
  AiAgentProfile,
  AiExecutionBudget,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunRecord,
  AiSessionHistoryMessage
} from '@talex-touch/utils/types/ai-orchestrator'

export const PI_RUNTIME_PROTOCOL_VERSION = 1 as const

export interface PiRuntimeToolSpec {
  id: string
  name: string
  description: string
  inputSchema: JsonSchema
}

export interface PiRuntimeStartPayload {
  run: AiOrchestratorRunRecord
  request: AiOrchestratorExecuteRequest
  profile: AiAgentProfile
  tools: PiRuntimeToolSpec[]
  history: AiSessionHistoryMessage[]
  budget: AiExecutionBudget
}

export interface PiRuntimeUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
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
