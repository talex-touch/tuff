import { readBody } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { createRelease } from '../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)

  const body = await readBody(event)

  const release = await createRelease(event, {
    ...body,
    createdBy: userId,
  })

  return {
    release,
  }
})
