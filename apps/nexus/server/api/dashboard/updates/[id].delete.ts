import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { deleteUpdate } from '../../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Update id is required.' })

  await deleteUpdate(event, id)

  return {
    ok: true,
  }
})
