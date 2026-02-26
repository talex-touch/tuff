import type { TuffIntelligencePauseReason } from '../../../../utils/tuffIntelligenceRuntimeStore'
import { requireAdmin } from '../../../../utils/auth'
import { pauseIntelligenceLabSession } from '../../../../utils/tuffIntelligenceLabService'

const ALLOWED_REASONS: TuffIntelligencePauseReason[] = [
  'client_disconnect',
  'heartbeat_timeout',
  'manual_pause',
  'system_preempted',
]

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    sessionId?: string
    reason?: string
  }>(event)

  const sessionId = String(body?.sessionId || '').trim()
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId is required',
    })
  }

  const reason = typeof body?.reason === 'string' && ALLOWED_REASONS.includes(body.reason as TuffIntelligencePauseReason)
    ? (body.reason as TuffIntelligencePauseReason)
    : 'manual_pause'

  return await pauseIntelligenceLabSession(event, userId, {
    sessionId,
    reason,
  })
})
