import { createError, readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { appendAdminBreakglassAudit } from '../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../utils/adminControlPlaneGuard'
import { createPendingDualControlOperation } from '../../../utils/adminDualControlStore'
import {
  digestRiskPayload,
  executeRiskCaseReview,
  shouldRequireDualControl,
  type RiskCaseReviewPayload,
} from '../../../utils/adminRiskActions'

function dualControlEnabled(event: any) {
  const config = useRuntimeConfig(event)
  const value = config.adminControl?.dualControlEnabled
  return value === undefined ? true : String(value) === 'true' || value === true
}

function parsePayload(body: Record<string, unknown>): RiskCaseReviewPayload {
  const kind = typeof body.kind === 'string' ? body.kind.trim() : ''
  if (kind === 'ip-ban-upsert') {
    const ip = typeof body.ip === 'string' ? body.ip.trim() : ''
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    const expiresAt = typeof body.expires_at === 'string' ? body.expires_at.trim() : null
    const permanent = Boolean(body.permanent)
    return { kind, ip, enabled, reason, expiresAt, permanent }
  }

  if (kind === 'ip-ban-toggle') {
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const enabled = Boolean(body.enabled)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    return { kind, id, enabled, reason }
  }

  if (kind === 'ip-ban-delete') {
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    return { kind, id, reason }
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid risk case review payload.',
  })
}

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.case.review', {
    auditAction: 'risk.case.review.auth',
  })

  const body = await readBody<Record<string, unknown>>(event)
  const payload = parsePayload(body)
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
    await appendAdminBreakglassAudit(event, {
      actorId: ctx.actorId,
      actorAdminId: ctx.adminId,
      channel: ctx.channel,
      action: 'risk.case.review',
      target: payload.kind,
      scope: 'risk.case.review',
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

  const result = await executeRiskCaseReview(event, payload)
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.case.review',
    target: payload.kind,
    scope: 'risk.case.review',
    decision: 'executed',
  })
  return {
    success: true,
    result,
  }
})
