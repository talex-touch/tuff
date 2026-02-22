import { createError, readBody } from 'h3'
import { requireAdminControlPlaneAuth } from '../../../utils/adminControlPlaneGuard'
import { revokeAdminEmergencySession } from '../../../utils/adminEmergencyStore'

export default defineEventHandler(async (event) => {
  await requireAdminControlPlaneAuth(event, undefined, {
    allowedChannels: ['A'],
    requireStepUp: true,
    auditAction: 'admin.emergency.revoke',
  })

  const body = await readBody<{ session_id?: unknown }>(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'session_id is required.',
    })
  }

  await revokeAdminEmergencySession(event, sessionId)
  return { success: true }
})

