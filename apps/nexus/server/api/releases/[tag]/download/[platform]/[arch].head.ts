import { createError, sendRedirect, setResponseHeader } from 'h3'
import { resolveReleaseDownload } from '../../../../../utils/releaseDownload'

export default defineEventHandler(async (event) => {
  const { asset } = await resolveReleaseDownload(event)

  if (!asset.fileKey) {
    if (asset.downloadUrl.startsWith('https://') || asset.downloadUrl.startsWith('http://'))
      return sendRedirect(event, asset.downloadUrl, 302)

    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  setResponseHeader(event, 'Content-Type', asset.contentType || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', asset.size)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}"`)

  return undefined
})
