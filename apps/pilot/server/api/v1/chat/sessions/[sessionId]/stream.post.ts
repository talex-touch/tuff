import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId } from '../../../../../utils/pilot-http'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  requireSessionId(event)

  throw createError({
    statusCode: 410,
    statusMessage: 'Gone',
    message: 'Pilot legacy stream API removed. Please use /api/chat/sessions/:sessionId/stream.',
    data: {
      code: 'PILOT_LEGACY_API_REMOVED',
      legacyPath: '/api/v1/chat/sessions/:sessionId/stream',
      replacementPath: '/api/chat/sessions/:sessionId/stream',
    },
  })
})
