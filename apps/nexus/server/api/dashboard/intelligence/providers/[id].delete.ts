import { createError } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { deleteProvider, getProvider } from '../../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required.' })
  }

  const existing = await getProvider(event, userId, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })
  }

  await deleteProvider(event, userId, id)

  return { success: true }
})
