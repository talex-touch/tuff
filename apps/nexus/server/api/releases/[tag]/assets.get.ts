import { createError } from 'h3'
import { attachSignatureUrls } from '../../../utils/releaseSignature'
import { getReleaseByTag } from '../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const release = await getReleaseByTag(event, tag, true)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const releaseWithSignatures = attachSignatureUrls(release)

  return {
    assets: releaseWithSignatures.assets ?? [],
  }
})
