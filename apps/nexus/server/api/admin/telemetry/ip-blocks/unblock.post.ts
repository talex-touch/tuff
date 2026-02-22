import { createError, readBody } from 'h3'
import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import { executeRiskActorUnblock } from '../../../../utils/adminRiskActions'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.actor.unblock', {
    auditAction: 'risk.actor.unblock.compat.auth',
  })

  const body = await readBody<{ ip?: unknown }>(event)
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : ''
  if (!ip) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ip is required.',
    })
  }

  const result = await executeRiskActorUnblock(event, {
    actors: [ip],
    reason: 'compat:admin-telemetry-unblock',
  })

  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.actor.unblock.compat',
    target: ip,
    scope: 'risk.actor.unblock',
    decision: 'executed',
  })

  return { success: result.success }
})
