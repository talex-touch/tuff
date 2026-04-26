import type { ReleaseEvidencePlatform, ReleaseEvidenceRunStatus, ReleaseEvidenceScope } from '../../../utils/releaseEvidenceStore'
import { getQuery } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { listReleaseEvidenceRuns } from '../../../utils/releaseEvidenceStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:evidence'])
  const query = getQuery(event)

  return await listReleaseEvidenceRuns(event, {
    version: typeof query.version === 'string' ? query.version : undefined,
    platform: typeof query.platform === 'string' ? query.platform as ReleaseEvidencePlatform : undefined,
    scope: typeof query.scope === 'string' ? query.scope as ReleaseEvidenceScope : undefined,
    status: typeof query.status === 'string' ? query.status as ReleaseEvidenceRunStatus : undefined,
    page: typeof query.page === 'string' ? Number.parseInt(query.page, 10) : undefined,
    limit: typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined,
  })
})
