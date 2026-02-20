import type { TuffIntelligenceApprovalTicket } from '@talex-touch/utils'
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

  return await approveIntelligenceLabTool({
    approved: Boolean(body.approved),
    ticket: body.ticket,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  }, {
    event,
    userId,
  })
})
