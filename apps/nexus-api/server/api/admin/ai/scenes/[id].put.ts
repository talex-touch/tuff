import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import {
  createSceneRegistryEntry,
  getSceneRegistryEntry,
  type CreateSceneRegistryInput,
  updateSceneRegistryEntry,
  withSceneRegistryReadiness,
} from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Scene id is required.' })

  const body = await readBody<CreateSceneRegistryInput>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Scene payload is required.' })
  }

  const existing = await getSceneRegistryEntry(event, id)
  const saved = existing
    ? await updateSceneRegistryEntry(event, id, body)
    : await createSceneRegistryEntry(event, { ...body, id }, userId)
  if (!saved)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save scene.' })

  return {
    scene: await withSceneRegistryReadiness(event, saved),
  }
})
