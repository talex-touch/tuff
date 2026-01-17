import type { ReleaseChannel, ReleaseStatus } from '../../utils/releasesStore'
import { getQuery } from 'h3'
import { listReleases } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const channel = query.channel as ReleaseChannel | undefined
  const status = query.status as ReleaseStatus | undefined
  const includeAssets = query.assets === 'true' || query.assets === '1'
  const limit = query.limit ? Number.parseInt(query.limit as string, 10) : undefined

  const releases = await listReleases(event, {
    channel,
    status: status ?? 'published',
    includeAssets,
    limit,
  })

  return {
    releases,
  }
})
