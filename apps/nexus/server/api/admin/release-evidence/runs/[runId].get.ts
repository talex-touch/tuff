import { createError } from 'h3'
import { requireAdminOrApiKey } from '../../../../utils/auth'
import { getReleaseEvidenceRun } from '../../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:evidence'])
  const runId = event.context.params?.runId

  if (!runId)
    throw createError({ statusCode: 400, statusMessage: 'runId is required.' })

  const detail = await getReleaseEvidenceRun(event, runId)
  if (!detail)
    throw createError({ statusCode: 404, statusMessage: 'Release evidence run not found.' })

  return detail
})
