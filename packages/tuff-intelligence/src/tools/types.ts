import type { z } from 'zod'

export type TuffToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type TuffToolSource = 'builtin' | 'plugin' | 'mcp' | 'skill' | 'workflow'

export type TuffToolErrorCode = 'TOOL_NOT_FOUND'
  | 'TOOL_INPUT_INVALID'
  | 'TOOL_OUTPUT_INVALID'
  | 'TOOL_APPROVAL_DENIED'
  | 'TOOL_EXECUTION_FAILED'

export interface TuffToolContext {
  sessionId?: string
  turnId?: string
  caller?: string
  traceId?: string
  metadata?: Record<string, unknown>
}

export interface TuffToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string
  name: string
  description: string
  source?: TuffToolSource
  riskLevel?: TuffToolRiskLevel
  requiresApproval?: boolean
  inputSchema: z.ZodType<TInput>
  outputSchema?: z.ZodType<TOutput>
  tags?: string[]
  examples?: TuffToolExample[]
  metadata?: Record<string, unknown>
  execute: (input: TInput, context: TuffToolContext) => Promise<TOutput> | TOutput
}

export type TuffTool<TInput = unknown, TOutput = unknown> = TuffToolDefinition<TInput, TOutput>
export type AnyTuffTool = TuffTool<any, any>

export interface TuffToolExample {
  input: unknown
  output?: unknown
  description?: string
}

export interface TuffToolManifest {
  id: string
  name: string
  description: string
  source: TuffToolSource
  riskLevel: TuffToolRiskLevel
  requiresApproval: boolean
  inputSchema: z.ZodType
  metadata?: Record<string, unknown>
  tags?: string[]
  examples?: TuffToolExample[]
}

export interface TuffToolError {
  code: TuffToolErrorCode
  message: string
  detail?: unknown
}

export interface TuffToolInvocationResult<TOutput = unknown> {
  ok: boolean
  toolId: string
  output?: TOutput
  error?: TuffToolError
  metadata?: Record<string, unknown>
}

export interface TuffToolApprovalRequest<TInput = unknown> {
  toolId: string
  name: string
  description: string
  source: TuffToolSource
  riskLevel: TuffToolRiskLevel
  input: TInput
  context: TuffToolContext
  requiresApproval: boolean
  metadata?: Record<string, unknown>
}

export interface TuffToolApprovalDecision {
  approved: boolean
  reason?: string
  metadata?: Record<string, unknown>
}

export type TuffToolApprovalGate = (
  request: TuffToolApprovalRequest,
) => Promise<TuffToolApprovalDecision> | TuffToolApprovalDecision

export interface TuffToolKitOptions {
  approvalGate?: TuffToolApprovalGate
}

export interface TuffToolListFilter {
  source?: TuffToolSource
  riskLevel?: TuffToolRiskLevel
  tags?: string[]
  requiresApproval?: boolean
}
