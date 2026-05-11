import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { deleteSceneRegistryEntry } from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const deleted = await deleteSceneRegistryEntry(event, id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Scene registry entry not found.' })
  }

  return { success: true }
})
