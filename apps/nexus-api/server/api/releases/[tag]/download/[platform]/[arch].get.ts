import { createError, send, sendRedirect, sendStream, setResponseHeader } from 'h3'
import { requireReleaseAssetStream } from '../../../../../utils/releaseAssetStorage'
import { resolveReleaseDownload } from '../../../../../utils/releaseDownload'
import { incrementDownloadCount } from '../../../../../utils/releasesStore'
import { runAfterResponse } from '../../../../../utils/afterResponse'

export default defineEventHandler(async (event) => {
  const { tag, platform, arch, asset } = await resolveReleaseDownload(event)

  // Counted after the response: the download does not wait for the counter, nor fail with it.
  runAfterResponse(event, 'release download count', () => incrementDownloadCount(event, asset.id))

  if (!asset.fileKey) {
    if (asset.downloadUrl.startsWith('https://') || asset.downloadUrl.startsWith('http://')) {
      return sendRedirect(event, asset.downloadUrl, 302)
    }
    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  const result = await requireReleaseAssetStream(event, asset.fileKey, {
    governanceResourceId: `release:${tag}:${platform}:${arch}`,
    resourceType: 'release-asset',
  })

  setResponseHeader(event, 'Content-Type', asset.contentType || result.contentType)
  setResponseHeader(event, 'Content-Length', result.size)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}"`)

  return result.body instanceof ReadableStream
    ? sendStream(event, result.body)
    : send(event, result.body)
})
