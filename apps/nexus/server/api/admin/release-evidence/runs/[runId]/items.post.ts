import { createError, readBody } from 'h3'
import { logAdminAudit } from '../../../../../utils/adminAuditStore'
import { requireAdminOrApiKey } from '../../../../../utils/auth'
import { upsertReleaseEvidenceItem } from '../../../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  const { userId, authType } = await requireAdminOrApiKey(event, ['release:evidence'])
  const runId = event.context.params?.runId

  if (!runId)
    throw createError({ statusCode: 400, statusMessage: 'runId is required.' })

  const body = await readBody(event)
  const item = await upsertReleaseEvidenceItem(event, runId, {
    category: body?.category,
    caseId: body?.caseId,
    status: body?.status,
    requiredForRelease: body?.requiredForRelease,
    evidence: body?.evidence,
    notes: body?.notes,
  })

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'release.evidence.item.upsert',
    targetType: 'release_evidence_item',
    targetId: item.id,
    targetLabel: `${runId} / ${item.category} / ${item.caseId}`,
    metadata: {
      authType,
      runId,
      after: {
        category: item.category,
        caseId: item.caseId,
        status: item.status,
        requiredForRelease: item.requiredForRelease,
      },
    },
  })

  return { item }
})
