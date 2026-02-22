import { readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { appendAdminBreakglassAudit } from '../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../utils/adminControlPlaneGuard'
import { createPendingDualControlOperation } from '../../../utils/adminDualControlStore'
import { digestRiskPayload, executeRiskCaseReview, shouldRequireDualControl } from '../../../utils/adminRiskActions'

function dualControlEnabled(event: any) {
  const config = useRuntimeConfig(event)
  const value = config.adminControl?.dualControlEnabled
  return value === undefined ? true : String(value) === 'true' || value === true
}

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.case.review', {
    auditAction: 'risk.case.review.compat.ip-ban-create.auth',
  })
  const body = await readBody(event)
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : ''
  if (!ip)
    return { ok: false, error: 'Missing ip' }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  const permanent = Boolean(body?.permanent)
  const payload = {
    kind: 'ip-ban-upsert',
    ip,
    enabled: true,
    reason,
    permanent,
  } as const

  const requiresDual = dualControlEnabled(event) && shouldRequireDualControl('risk.case.review', payload)
  if (requiresDual) {
    const operation = await createPendingDualControlOperation(event, {
      action: 'risk.case.review',
      payloadJson: JSON.stringify(payload),
      payloadDigest: digestRiskPayload(payload),
      scope: 'risk.case.review',
      submitterActorId: ctx.actorId,
      submitterAdminId: ctx.adminId,
      ttlMs: 15 * 60_000,
    })
    setResponseStatus(event, 202)
    return {
      ok: false,
      pending: true,
      pending_operation_id: operation.id,
      expires_at: operation.expiresAt,
    }
  }

  const result = await executeRiskCaseReview(event, payload)
  const ban = (result as any).ban
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.case.review.compat.ip-ban-create',
    target: ip,
    scope: 'risk.case.review',
    decision: 'executed',
  })
  return { ok: true, ban }
})
