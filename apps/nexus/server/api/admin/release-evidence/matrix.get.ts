import { getQuery } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { getReleaseEvidenceMatrix } from '../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:evidence'])
  const query = getQuery(event)
  const version = typeof query.version === 'string' ? query.version : ''

  return await getReleaseEvidenceMatrix(event, version)
})
