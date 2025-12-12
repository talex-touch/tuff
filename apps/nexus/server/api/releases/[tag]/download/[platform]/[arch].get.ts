import { createError, sendRedirect } from 'h3'
import { getReleaseByTag, incrementDownloadCount } from '../../../../../utils/releasesStore'
import type { AssetArch, AssetPlatform, ReleaseAsset } from '../../../../../utils/releasesStore'

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

  // TODO: Generate signed URL from R2/S3 and redirect
  // For now, redirect to the stored download URL
  return sendRedirect(event, asset.downloadUrl, 302)
})
