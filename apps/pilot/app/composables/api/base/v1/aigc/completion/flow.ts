export interface CompletionTurnAcceptedEvent {
  requestId: string
  turnId: string
  queuePos: number
}

export interface ResolveStreamRequestIdOptions {
  existingRequestId?: string
  createTurn: () => Promise<CompletionTurnAcceptedEvent>
  onTurnAccepted?: (event: CompletionTurnAcceptedEvent) => void
}

export async function resolveStreamRequestId(options: ResolveStreamRequestIdOptions): Promise<string> {
  const existingRequestId = String(options.existingRequestId || '').trim()
  if (existingRequestId) {
    return existingRequestId
  }

  const turn = await options.createTurn()
  const requestId = String(turn.requestId || '').trim()
  if (!requestId) {
    throw new Error('request_id is missing')
  }

  options.onTurnAccepted?.({
    requestId,
    turnId: String(turn.turnId || '').trim(),
    queuePos: Number.isFinite(turn.queuePos) ? Number(turn.queuePos) : 0,
  })

  return requestId
}

export interface ToolApprovalTicket {
  ticketId: string
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  decisionReason?: string
}

export function normalizeToolApprovalTicket(value: unknown): ToolApprovalTicket | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const ticketId = String(row.ticketId || row.ticket_id || '').trim()
  const status = String(row.status || '').trim().toLowerCase()
  if (!ticketId || (status !== 'pending' && status !== 'approved' && status !== 'rejected')) {
    return null
  }
  return {
    ticketId,
    status,
    reason: String(row.reason || '').trim() || undefined,
    decisionReason: String(row.decisionReason || row.decision_reason || '').trim() || undefined,
  }
}

export interface PollToolApprovalDecisionOptions {
  ticketId: string
  intervalMs: number
  fetchTicket: (ticketId: string) => Promise<ToolApprovalTicket | null>
  isAborted?: () => boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export async function pollToolApprovalDecision(options: PollToolApprovalDecisionOptions): Promise<ToolApprovalTicket> {
  const sleep = options.sleep || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))
  while (true) {
    if (options.isAborted?.()) {
      throw new Error('APPROVAL_MONITOR_ABORTED')
    }

    try {
      const ticket = await options.fetchTicket(options.ticketId)
      if (ticket && ticket.status !== 'pending') {
        return ticket
      }
    }
    catch (error) {
      const raw = String(error instanceof Error ? error.message : error || '')
      if (raw === 'APPROVAL_MONITOR_ABORTED') {
        throw error
      }
    }

    await sleep(options.intervalMs)
  }
}

export function buildRejectedApprovalAuditPatch(input: {
  fallbackMessage: string
  ticket: ToolApprovalTicket
}): {
  auditType: 'tool.call.rejected'
  status: 'rejected'
  errorCode: 'TOOL_APPROVAL_REJECTED'
  errorMessage: string
} {
  const reason = input.ticket.decisionReason || input.ticket.reason || input.fallbackMessage || '工具审批被拒绝'
  return {
    auditType: 'tool.call.rejected',
    status: 'rejected',
    errorCode: 'TOOL_APPROVAL_REJECTED',
    errorMessage: String(reason || '工具审批被拒绝').trim() || '工具审批被拒绝',
  }
}

export function buildApprovalMonitorFailureAuditPatch(input: {
  error: unknown
}): {
  auditType: 'tool.call.failed'
  status: 'failed'
  errorCode: 'TOOL_APPROVAL_POLL_FAILED'
  errorMessage: string
} {
  void input.error
  return {
    auditType: 'tool.call.failed',
    status: 'failed',
    errorCode: 'TOOL_APPROVAL_POLL_FAILED',
    errorMessage: '审批状态查询失败，请稍后重试。',
  }
}
