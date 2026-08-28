import { Buffer } from 'node:buffer'
import { createError, send, sendRedirect, setResponseHeader } from 'h3'
import { requireReleaseAsset } from '../../../../../utils/releaseAssetStorage'
import { resolveReleaseDownload } from '../../../../../utils/releaseDownload'
import { incrementDownloadCount } from '../../../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { tag, platform, arch, asset } = await resolveReleaseDownload(event)

  // Increment download count
  await incrementDownloadCount(event, asset.id)

  if (!asset.fileKey) {
    if (asset.downloadUrl.startsWith('https://') || asset.downloadUrl.startsWith('http://')) {
      return sendRedirect(event, asset.downloadUrl, 302)
    }
    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  const result = await requireReleaseAsset(event, asset.fileKey, {
    governanceResourceId: `release:${tag}:${platform}:${arch}`,
    resourceType: 'release-asset',
  })
  const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data)

  setResponseHeader(event, 'Content-Type', asset.contentType || result.contentType)
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}"`)

  return send(event, buffer)
})
