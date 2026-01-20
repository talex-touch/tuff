import type { AssetArch, AssetPlatform, ReleaseAsset } from '../../../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createError, send, setResponseHeader } from 'h3'
import { requireReleaseAsset } from '../../../../../utils/releaseAssetStorage'
import { getReleaseByTag } from '../../../../../utils/releasesStore'

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

  if (!asset.fileKey) {
    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  const signatureKey = `${asset.fileKey}.sig`
  const result = await requireReleaseAsset(event, signatureKey)
  const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data)

  setResponseHeader(event, 'Content-Type', result.contentType || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}.sig"`)

  return send(event, buffer)
})
