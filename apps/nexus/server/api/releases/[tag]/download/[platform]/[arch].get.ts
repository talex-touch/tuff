import type { AssetArch, AssetPlatform, ReleaseAsset } from '../../../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createError, send, setResponseHeader } from 'h3'
import { requireReleaseAsset } from '../../../../../utils/releaseAssetStorage'
import { getReleaseByTag, incrementDownloadCount } from '../../../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { tag, platform, arch } = event.context.params ?? {}

  if (!tag || !platform || !arch)
    throw createError({ statusCode: 400, statusMessage: 'Tag, platform, and arch are required.' })

  const release = await getReleaseByTag(event, tag, true)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  if (release.status !== 'published')
    throw createError({ statusCode: 403, statusMessage: 'Release is not published.' })

  const asset = release.assets?.find(
    (a: ReleaseAsset) => a.platform === (platform as AssetPlatform) && a.arch === (arch as AssetArch),
  )

  if (!asset)
    throw createError({ statusCode: 404, statusMessage: 'Asset not found for this platform/arch.' })

  // Increment download count
  await incrementDownloadCount(event, asset.id)

  if (!asset.fileKey) {
    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  const result = await requireReleaseAsset(event, asset.fileKey)
  const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data)

  setResponseHeader(event, 'Content-Type', asset.contentType || result.contentType)
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}"`)

  return send(event, buffer)
})
