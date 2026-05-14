import type {
  TuffToolApprovalDecision,
  TuffToolApprovalGate,
  TuffToolApprovalRequest,
} from './types'

function makeApprovalId(toolId: string): string {
  return `approval_${toolId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface TuffToolApprovalRequestEvent {
  id: string
  actionId: string
  riskLevel: TuffToolApprovalRequest['riskLevel']
  reason: string
  payload: TuffToolApprovalRequest
}

export interface ApprovalRequestGateOptions {
  makeId?: (request: TuffToolApprovalRequest) => string
  reason?: (request: TuffToolApprovalRequest) => string
  metadata?: Record<string, unknown>
}

export function createApprovalRequestGate(
  options: ApprovalRequestGateOptions = {},
): TuffToolApprovalGate {
  return (request): TuffToolApprovalDecision => {
    if (!request.requiresApproval) {
      return {
        approved: true,
      }
    }

    const id = options.makeId?.(request) ?? makeApprovalId(request.toolId)
    const reason = options.reason?.(request)
      ?? `Tool "${request.toolId}" requires approval.`
    const approvalRequest: TuffToolApprovalRequestEvent = {
      id,
      actionId: request.toolId,
      riskLevel: request.riskLevel,
      reason,
      payload: request,
    }

    return {
      approved: false,
      reason,
      metadata: {
        ...options.metadata,
        approvalRequest,
      },
    }
  }
}
