import { readBody } from 'h3'
import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import { executeRiskCaseReview } from '../../../../utils/adminRiskActions'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.case.review', {
    auditAction: 'risk.case.review.compat.ip-ban-toggle.auth',
  })
  const id = event.context.params?.id
  if (!id)
    return { ok: false, error: 'Missing id' }

  const body = await readBody(event)
  const enabled = Boolean(body?.enabled)
  await executeRiskCaseReview(event, {
    kind: 'ip-ban-toggle',
    id,
    enabled,
  })
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.case.review.compat.ip-ban-toggle',
    target: id,
    scope: 'risk.case.review',
    decision: 'executed',
  })
  return { ok: true }
})
