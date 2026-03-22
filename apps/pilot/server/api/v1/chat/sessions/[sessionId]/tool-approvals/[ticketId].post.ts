import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../../utils/auth'
import {
  getChatTurnByRequestId,
  updateChatTurnStatus,
} from '../../../../../../utils/chat-turn-queue'
import { requireSessionId } from '../../../../../../utils/pilot-http'
import {
  decidePilotToolApproval,
} from '../../../../../../utils/pilot-tool-approvals'

interface DecideApprovalBody {
  approved?: boolean
  reason?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const ticketId = String(event.context.params?.ticketId || '').trim()
  if (!ticketId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ticketId is required',
    })
  }

  const body = await readBody<DecideApprovalBody>(event)
  if (typeof body?.approved !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'approved(boolean) is required',
    })
  }

  const ticket = await decidePilotToolApproval(event, {
    sessionId,
    userId,
    ticketId,
    approved: body.approved,
    reason: String(body.reason || '').trim() || undefined,
  })

  if (!ticket) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ticket not found',
    })
  }

  if (!body.approved && ticket.requestId) {
    const queued = await getChatTurnByRequestId(event, userId, sessionId, ticket.requestId)
    if (queued && queued.status !== 'completed' && queued.status !== 'failed' && queued.status !== 'cancelled') {
      await updateChatTurnStatus(event, userId, sessionId, ticket.requestId, 'failed', {
        errorText: String(body.reason || '').trim() || '工具调用审批被拒绝',
      })
    }
  }

  return {
    session_id: sessionId,
    ticket: {
      ...ticket,
    },
  }
})
