import { createError } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { getReleaseByTag, updateRelease } from '../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:publish'])

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const existing = await getReleaseByTag(event, tag, true)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const hasDownloadableAsset = (existing.assets ?? []).some(asset =>
    Boolean(asset.fileKey)
    || asset.downloadUrl.startsWith('https://')
    || asset.downloadUrl.startsWith('http://')
    || asset.downloadUrl.startsWith('/api/releases/')
  )

  if (!hasDownloadableAsset) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Release must include at least one downloadable asset before publishing.',
    })
  }

  const release = await updateRelease(event, tag, {
    status: 'published',
    publishedAt: new Date().toISOString(),
  })

  return {
    release,
    message: `Release ${tag} published successfully.`,
  }
})
