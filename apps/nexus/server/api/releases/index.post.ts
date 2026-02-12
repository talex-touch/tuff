import { readBody } from 'h3'
import { requireAdminOrApiKey } from '../../utils/auth'
import { createRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdminOrApiKey(event, ['release:sync'])

  const body = await readBody(event)

  const release = await createRelease(event, {
    ...body,
    createdBy: userId,
  })

  return {
    release,
  }
})
