import type { TuffIntelligenceApprovalTicket } from '@talex-touch/tuff-intelligence/light'
import { logAdminAudit } from '../../../../utils/adminAuditStore'
import { requireAdmin } from '../../../../utils/auth'
import { approveIntelligenceLabTool } from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    approved?: boolean
    ticket?: TuffIntelligenceApprovalTicket
    reason?: string
  }>(event)

  if (!body?.ticket) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ticket is required',
    })
  }

  const approved = Boolean(body.approved)
  const result = await approveIntelligenceLabTool({
    approved,
    ticket: body.ticket,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  }, {
    event,
    userId,
  })

  // Letting an agent run a tool is a human security decision; without an entry
  // here there is nothing tying the decision to the admin who made it.
  await logAdminAudit(event, {
    adminUserId: userId,
    action: approved ? 'intelligence.tool.approve' : 'intelligence.tool.reject',
    targetType: 'intelligence_tool_call',
    targetId: body.ticket.id,
    targetLabel: `${body.ticket.toolId} @ ${body.ticket.sessionId}`,
    metadata: {
      approved,
      sessionId: body.ticket.sessionId,
      toolId: body.ticket.toolId,
      riskLevel: body.ticket.riskLevel,
      actionId: body.ticket.actionId ?? null,
      reason: typeof body.reason === 'string' ? body.reason : null,
    },
  })

  return result
})
