import { readBody } from 'h3'
import { logAdminAudit } from '../../../utils/adminAuditStore'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { createReleaseEvidenceRun } from '../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  const { userId, authType } = await requireAdminOrApiKey(event, ['release:evidence'])
  const body = await readBody(event)

  const run = await createReleaseEvidenceRun(event, {
    version: body?.version,
    platform: body?.platform,
    scope: body?.scope,
    status: body?.status,
    notes: body?.notes,
    createdBy: userId,
  })

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'release.evidence.run.create',
    targetType: 'release_evidence_run',
    targetId: run.id,
    targetLabel: `${run.version} / ${run.scope} / ${run.platform}`,
    metadata: {
      authType,
      after: {
        version: run.version,
        platform: run.platform,
        scope: run.scope,
        status: run.status,
      },
    },
  })

  return { run }
})
