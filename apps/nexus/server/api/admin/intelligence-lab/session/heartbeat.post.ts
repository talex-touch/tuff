import { requireAdmin } from '../../../../utils/auth'
import { heartbeatIntelligenceLabSession } from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    sessionId?: string
  }>(event)

  const sessionId = String(body?.sessionId || '').trim()
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId is required',
    })
  }

  return await heartbeatIntelligenceLabSession(event, userId, {
    sessionId,
  })
})

