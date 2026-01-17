import type { AssetArch, AssetPlatform } from '../../../utils/releasesStore'
import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { createReleaseAsset, getReleaseByTag } from '../../../utils/releasesStore'

interface LinkGitHubAssetInput {
  platform: AssetPlatform
  arch: AssetArch
  filename: string
  downloadUrl: string
  size: number
  sha256?: string | null
  contentType?: string
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const release = await getReleaseByTag(event, tag, false)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const body = await readBody<LinkGitHubAssetInput>(event)

  if (!body.platform || !body.arch || !body.filename || !body.downloadUrl)
    throw createError({ statusCode: 400, statusMessage: 'platform, arch, filename, and downloadUrl are required.' })

  if (!body.downloadUrl.startsWith('https://'))
    throw createError({ statusCode: 400, statusMessage: 'downloadUrl must be a valid HTTPS URL.' })

  const asset = await createReleaseAsset(event, {
    releaseId: release.id,
    platform: body.platform,
    arch: body.arch,
    filename: body.filename,
    sourceType: 'github',
    fileKey: null,
    downloadUrl: body.downloadUrl,
    size: body.size || 0,
    sha256: body.sha256 ?? null,
    contentType: body.contentType || 'application/octet-stream',
  })

  return {
    asset,
    message: 'GitHub asset linked successfully.',
  }
})
