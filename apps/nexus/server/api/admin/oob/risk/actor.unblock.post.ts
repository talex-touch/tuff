import { createError, readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import { createPendingDualControlOperation } from '../../../../utils/adminDualControlStore'
import {
  digestRiskPayload,
  executeRiskActorUnblock,
  normalizeActorList,
  shouldRequireDualControl,
} from '../../../../utils/adminRiskActions'

function dualControlEnabled(event: any) {
  const config = useRuntimeConfig(event)
  const value = config.adminControl?.dualControlEnabled
  return value === undefined ? true : String(value) === 'true' || value === true
}

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.actor.unblock', {
    allowedChannels: ['C'],
    requireStepUp: false,
    auditAction: 'risk.actor.unblock.oob.auth',
  })

  const body = await readBody<{ actor?: unknown, actors?: unknown, reason?: unknown }>(event)
  const actors = normalizeActorList({
    actor: body?.actor,
    actors: body?.actors,
  })
  if (actors.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'actor or actors is required.',
    })
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  const payload = { actors, reason }

  const requiresDual = dualControlEnabled(event) && shouldRequireDualControl('risk.actor.unblock', payload)
  if (requiresDual) {
    const operation = await createPendingDualControlOperation(event, {
      action: 'risk.actor.unblock',
      payloadJson: JSON.stringify(payload),
      payloadDigest: digestRiskPayload(payload),
      scope: 'risk.actor.unblock',
      submitterActorId: ctx.actorId,
      submitterAdminId: ctx.adminId,
      ttlMs: 15 * 60_000,
    })
    await appendAdminBreakglassAudit(event, {
      actorId: ctx.actorId,
      actorAdminId: ctx.adminId,
      channel: ctx.channel,
      action: 'risk.actor.unblock',
      target: `actors:${actors.length}`,
      scope: 'risk.actor.unblock',
      decision: 'pending',
      evidenceRef: operation.id,
    })
    setResponseStatus(event, 202)
    return {
      success: false,
      pending: true,
      pending_operation_id: operation.id,
      expires_at: operation.expiresAt,
    }
  }

  const result = await executeRiskActorUnblock(event, payload)
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.actor.unblock',
    target: `actors:${actors.length}`,
    scope: 'risk.actor.unblock',
    decision: 'executed',
  })
  return {
    ...result,
    executed: true,
  }
})
