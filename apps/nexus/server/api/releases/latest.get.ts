import type { AppRelease, AssetPlatform, ReleaseChannel } from '../../utils/releasesStore'
import { getQuery } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { attachSignatureUrls } from '../../utils/releaseSignature'
import { getLatestRelease } from '../../utils/releasesStore'

/** The longest a copy of this answer is served from the edge cache. */
const LATEST_RELEASE_EDGE_TTL_SECONDS = 60

/**
 * Seconds a copy of `release` may be served: at most a minute, and a tenth of the life left in its
 * signed download URLs, so a cached copy never hands a client a URL that is nearly spent.
 */
function edgeTtlSeconds(release: AppRelease | null): number {
  let seconds = LATEST_RELEASE_EDGE_TTL_SECONDS
  const now = Math.floor(Date.now() / 1000)
  for (const asset of release?.assets ?? []) {
    const exp = Number(readSignedUrlExpiry(asset.downloadUrl))
    if (Number.isFinite(exp) && exp > 0)
      seconds = Math.min(seconds, Math.floor((exp - now) / 10))
  }
  return seconds
}

function readSignedUrlExpiry(url: string | null | undefined): string | null {
  try {
    return new URL(url ?? '', 'https://signed.invalid').searchParams.get('exp')
  }
  catch {
    return null
  }
}

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
      edgeTtlSeconds(body.release),
    )
  }
  return body
})
