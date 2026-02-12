import { createError, readBody } from 'h3'
import { requireAdminOrApiKey } from '../../utils/auth'
import { createReleaseRevision, getReleaseByTag, updateRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdminOrApiKey(event, ['release:sync'])

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const body = await readBody(event)

  const existing = await getReleaseByTag(event, tag, true)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  await createReleaseRevision(event, existing, userId)
  const release = await updateRelease(event, tag, body)

  return {
    release,
  }
})
