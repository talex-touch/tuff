import { createError, readBody } from 'h3'
import { requireAdminOrApiKey } from '../../../../../utils/auth'
import { upsertReleaseEvidenceItem } from '../../../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:evidence'])
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

  return { item }
})
