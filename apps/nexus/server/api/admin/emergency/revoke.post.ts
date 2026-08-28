import { createError, readBody } from 'h3'
import { appendAdminBreakglassAudit } from '../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../utils/adminControlPlaneGuard'
import { revokeAdminEmergencySession } from '../../../utils/adminEmergencyStore'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, undefined, {
    allowedChannels: ['A'],
    requireStepUp: true,
    auditAction: 'admin.emergency.revoke.auth',
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

  // The guard's own entry only proves someone was authorized to call this; it
  // carries no target, so without this second entry the trail cannot say which
  // break-glass session was torn down.
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'admin.emergency.revoke',
    target: sessionId,
    decision: 'executed',
  })

  return { success: true }
})

