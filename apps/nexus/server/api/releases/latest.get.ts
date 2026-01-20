import type { AssetPlatform, ReleaseChannel } from '../../utils/releasesStore'
import { getQuery } from 'h3'
import { attachSignatureUrls } from '../../utils/releaseSignature'
import { getLatestRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const channel = (query.channel as ReleaseChannel) || 'RELEASE'
  const platform = query.platform as AssetPlatform | undefined

  const release = await getLatestRelease(event, channel, platform)

  if (!release) {
    return {
      release: null,
      message: `No published release found for channel: ${channel}`,
    }
  }

  return {
    release: attachSignatureUrls(release),
  }
})
