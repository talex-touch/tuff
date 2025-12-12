import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { updateRelease } from '../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const release = await updateRelease(event, tag, {
    status: 'published',
    publishedAt: new Date().toISOString(),
  })

  return {
    release,
    message: `Release ${tag} published successfully.`,
  }
})
