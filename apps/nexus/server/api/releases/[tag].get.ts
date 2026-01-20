import { createError, getQuery } from 'h3'
import { attachSignatureUrls } from '../../utils/releaseSignature'
import { getReleaseByTag } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const query = getQuery(event)
  const includeAssets = query.assets !== 'false' && query.assets !== '0'

  const release = await getReleaseByTag(event, tag, includeAssets)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  return {
    release: attachSignatureUrls(release),
  }
})
