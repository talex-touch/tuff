import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { updateUpdate } from '../../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Update id is required.' })

  const body = await readBody(event)
  const update = await updateUpdate(event, id, body)

  return {
    update,
  }
})
