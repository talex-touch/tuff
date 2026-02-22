import { createError, readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import { createPendingDualControlOperation } from '../../../../utils/adminDualControlStore'
import { digestRiskPayload, executeRiskModeOverride, shouldRequireDualControl, type RiskModeOverridePayload } from '../../../../utils/adminRiskActions'

function dualControlEnabled(event: any) {
  const config = useRuntimeConfig(event)
  const value = config.adminControl?.dualControlEnabled
  return value === undefined ? true : String(value) === 'true' || value === true
}

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.mode.override', {
    allowedChannels: ['C'],
    requireStepUp: false,
    auditAction: 'risk.mode.override.oob.auth',
  })

  const body = await readBody<{ mode?: unknown, reason?: unknown }>(event)
  const mode = typeof body?.mode === 'string' ? body.mode.trim().toUpperCase() : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  if (mode !== 'NORMAL' && mode !== 'ELEVATED' && mode !== 'EXTREME') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid mode.' })
  }

  const payload: RiskModeOverridePayload = { mode, reason }
  const requiresDual = dualControlEnabled(event) && shouldRequireDualControl('risk.mode.override', payload)
  if (requiresDual) {
    const operation = await createPendingDualControlOperation(event, {
      action: 'risk.mode.override',
      payloadJson: JSON.stringify(payload),
      payloadDigest: digestRiskPayload(payload),
      scope: 'risk.mode.override',
      submitterActorId: ctx.actorId,
      submitterAdminId: ctx.adminId,
      ttlMs: 15 * 60_000,
    })
    await appendAdminBreakglassAudit(event, {
      actorId: ctx.actorId,
      actorAdminId: ctx.adminId,
      channel: ctx.channel,
      action: 'risk.mode.override',
      target: mode,
      scope: 'risk.mode.override',
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

  const result = await executeRiskModeOverride(event, payload, ctx.actorId)
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.mode.override',
    target: mode,
    scope: 'risk.mode.override',
    decision: 'executed',
  })
  return { success: true, mode: result.mode }
})
