import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { deleteSceneRegistryEntry } from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Scene id is required.' })

  await deleteSceneRegistryEntry(event, id)
  return { ok: true, id }
})
