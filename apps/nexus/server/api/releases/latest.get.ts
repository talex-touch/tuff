import type { AssetPlatform, ReleaseChannel } from '../../utils/releasesStore'
import { getQuery } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { attachSignatureUrls, getReleaseMetadataEdgeTtlSeconds } from '../../utils/releaseSignature'
import { getLatestRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const channel = (query.channel as ReleaseChannel) || 'RELEASE'
  const platform = query.platform as AssetPlatform | undefined

  // Every update check asks this; the answer is the same for everyone with the same channel and
  // platform. A parameter given twice arrives as an array and is left to the uncached path.
  const cacheable = typeof channel === 'string' && (platform === undefined || typeof platform === 'string')
  const edge = cacheable
    ? await openEdgeCache(event, { name: 'releases/latest', params: { channel, platform } })
    : null
  if (edge?.hit)
    return edge.hit

  const release = await getLatestRelease(event, channel, platform)

  const body = release
    ? { release: attachSignatureUrls(release, event) }
    : {
        release: null,
        message: `No published release found for channel: ${channel}`,
      }

  if (edge) {
    return edge.store(
      { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
      getReleaseMetadataEdgeTtlSeconds(body.release),
    )
  }
  return body
})
