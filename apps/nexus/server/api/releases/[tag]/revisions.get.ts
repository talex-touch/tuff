import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listReleaseRevisions } from '../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tag = event.context.params?.tag
  if (!tag) {
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })
  }

  const revisions = await listReleaseRevisions(event, tag)
  return { revisions }
})
