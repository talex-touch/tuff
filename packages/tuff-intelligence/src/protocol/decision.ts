import type { IntelligenceMessage } from '../types/intelligence'

export interface CapabilityCall {
  id: string
  capabilityId: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export interface ViewIntent {
  id: string
  type: 'render' | 'patch' | 'dispose'
  viewType?: string
  viewId?: string
  lifecycle?: 'ephemeral' | 'persistent'
  props?: Record<string, unknown>
}

export interface SkillRequest {
  id: string
  skillId: string
  reason?: string
}

export interface ApprovalRequest {
  id: string
  actionId: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  payload?: unknown
}

export interface SubAgentTask {
  id: string
  objective: string
  input?: unknown
}

export interface AgentDecision {
  thinkingText?: string
  thinkingDone?: boolean
  text?: string
  message?: IntelligenceMessage
  capabilityCalls?: CapabilityCall[]
  viewIntents?: ViewIntent[]
  skillRequests?: SkillRequest[]
  approvalRequests?: ApprovalRequest[]
  subAgentTasks?: SubAgentTask[]
  done: boolean
}
