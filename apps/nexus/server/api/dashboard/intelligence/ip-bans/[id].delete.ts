import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import { executeRiskCaseReview } from '../../../../utils/adminRiskActions'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, 'risk.case.review', {
    auditAction: 'risk.case.review.compat.ip-ban-delete.auth',
  })
  const id = event.context.params?.id
  if (!id)
    return { ok: false, error: 'Missing id' }

  await executeRiskCaseReview(event, {
    kind: 'ip-ban-delete',
    id,
  })
  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: 'risk.case.review.compat.ip-ban-delete',
    target: id,
    scope: 'risk.case.review',
    decision: 'executed',
  })
  return { ok: true }
})
