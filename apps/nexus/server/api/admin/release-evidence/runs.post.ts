import { readBody } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { createReleaseEvidenceRun } from '../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdminOrApiKey(event, ['release:evidence'])
  const body = await readBody(event)

  const run = await createReleaseEvidenceRun(event, {
    version: body?.version,
    platform: body?.platform,
    scope: body?.scope,
    status: body?.status,
    notes: body?.notes,
    createdBy: userId,
  })

  return { run }
})
