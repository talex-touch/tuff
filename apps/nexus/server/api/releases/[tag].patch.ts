import { createError, readBody } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { updateRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const body = await readBody(event)

  const release = await updateRelease(event, tag, body)

  return {
    release,
  }
})
